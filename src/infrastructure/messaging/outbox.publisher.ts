import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { performance } from 'node:perf_hooks';

import { MessageEnvelope } from '../../application/ports/message-envelope';
import { PrismaService } from '../database/prisma.service';
import { erroParaLog } from './erro-para-log';
import { MESSAGING_CONFIG, MessagingConfig } from './messaging.config';
import { SnsSqsTransport } from './sns-sqs.transport';

const INTERVALO_MS = 1000;
const LOTE = 10;
const TAMANHO_MAXIMO_ERRO = 500;

/**
 * Chave do advisory lock que elege um único publicador por serviço. Só precisaria ser
 * diferente entre serviços se eles compartilhassem o mesmo banco (não compartilham).
 */
export const OUTBOX_LOCK_KEY = 4_271_001;

/**
 * Passado esse tempo no ciclo, não começa novos envios: o resto fica para o próximo ciclo.
 * Evita que um SNS lento estoure o timeout da transação e desfaça o ciclo inteiro.
 */
const PRAZO_NOVOS_ENVIOS_MS = 5_000;

/**
 * A transação segura o lock durante os envios de rede. Invariante:
 * PRAZO_NOVOS_ENVIOS_MS + pior envio (maxAttempts × (connectionTimeout + requestTimeout))
 * + I/O do banco < TIMEOUT_TRANSACAO_MS. Com os clientes de publicação do MessagingModule:
 * 5s + 2 × (2s + 3s) = 15s, então 20s deixa folga para o banco.
 */
const TIMEOUT_TRANSACAO_MS = 20_000;
const OPCOES_TRANSACAO = { timeout: TIMEOUT_TRANSACAO_MS, maxWait: 5_000 };

interface OutboxPendente {
  id: string;
  groupId: string;
  type: string;
  destination: string;
  body: MessageEnvelope;
  traceparent: string | null;
}

/**
 * Publica a outbox em ordem de `seq` dentro de cada OS, com um único publicador ativo
 * (advisory lock): com duas réplicas publicando, mensagens da mesma OS poderiam sair fora
 * de ordem. Falha num envio afeta só a OS da mensagem: as seguintes dela ficam para o
 * próximo ciclo e as outras OS seguem.
 * Reenvio (ex.: transação desfeita após envio) é absorvido pela deduplicação FIFO e pela
 * idempotência dos consumidores.
 */
@Injectable()
export class OutboxPublisher implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(OutboxPublisher.name);
  private timer?: NodeJS.Timeout;
  private cicloAtual?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly transporte: SnsSqsTransport,
    @Inject(MESSAGING_CONFIG) private readonly config: MessagingConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(() => void this.ciclo(), INTERVALO_MS);
  }

  /** Roda antes do Prisma desconectar: espera o ciclo em andamento terminar. */
  async beforeApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.cicloAtual;
  }

  private ciclo(): Promise<void> {
    this.cicloAtual ??= this.publicarComLog().finally(() => (this.cicloAtual = undefined));
    return this.cicloAtual;
  }

  private async publicarComLog(): Promise<void> {
    try {
      await this.publicarPendentes();
    } catch (erro) {
      this.logger.error({ msg: 'Falha ao publicar a outbox', err: erroParaLog(erro) });
    }
  }

  async publicarPendentes(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const [{ obtido }] = await tx.$queryRaw<{ obtido: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${OUTBOX_LOCK_KEY}::bigint) AS "obtido"`;
      if (!obtido) return 0; // outra réplica está publicando

      const inicio = performance.now();
      const gruposComFalha = new Set<string>();
      let total = 0;
      while (performance.now() - inicio <= PRAZO_NOVOS_ENVIOS_MS) {
        const pendentes = await this.cabecasDosGrupos(tx, gruposComFalha);
        if (pendentes.length === 0) break;
        total += await this.enviarRodada(tx, pendentes, inicio, gruposComFalha);
      }
      return total;
    }, OPCOES_TRANSACAO);
  }

  /**
   * Só a mensagem mais antiga de cada OS entra na rodada: backlog de uma OS não ocupa o
   * lote e a ordem por OS é preservada. OS que já falharam no ciclo ficam de fora das
   * rodadas seguintes, liberando o lote para as demais (sem inanição). OS sem falha
   * anterior vêm primeiro: as que já falharam (e podem demorar até o timeout) não consomem
   * o prazo do ciclo antes das saudáveis.
   * Sem FOR UPDATE: o advisory lock já garante um só publicador.
   */
  private cabecasDosGrupos(
    tx: Prisma.TransactionClient,
    gruposComFalha: Set<string>,
  ): Promise<OutboxPendente[]> {
    return tx.$queryRaw<OutboxPendente[]>`
      SELECT h."id", h."destination", h."body", h."groupId", h."type", h."traceparent" FROM (
        SELECT DISTINCT ON ("groupId")
          "id", "destination", "body", "groupId", "type", "traceparent", "seq", "tentativas"
        FROM "Outbox"
        WHERE "publicadoEm" IS NULL AND NOT ("groupId" = ANY(${[...gruposComFalha]}::text[]))
        ORDER BY "groupId", "seq"
      ) h
      ORDER BY (h."tentativas" > 0), h."seq"
      LIMIT ${LOTE}`;
  }

  private async enviarRodada(
    tx: Prisma.TransactionClient,
    pendentes: OutboxPendente[],
    inicio: number,
    gruposComFalha: Set<string>,
  ): Promise<number> {
    const enviados: string[] = [];
    for (const pendente of pendentes) {
      if (performance.now() - inicio > PRAZO_NOVOS_ENVIOS_MS) break;
      try {
        await this.transporte.enviar(pendente.destination, pendente.body, pendente.traceparent);
        enviados.push(pendente.id);
      } catch (erro) {
        gruposComFalha.add(pendente.groupId);
        const motivo = (erro as Error).message;
        this.logger.error({
          msg: 'Falha ao publicar mensagem da outbox',
          outboxId: pendente.id,
          messageId: pendente.body.messageId,
          type: pendente.type,
          osId: pendente.groupId,
          err: erroParaLog(erro),
        });
        await tx.outbox.update({
          where: { id: pendente.id },
          data: { tentativas: { increment: 1 }, ultimoErro: motivo.slice(0, TAMANHO_MAXIMO_ERRO) },
        });
      }
    }

    if (enviados.length > 0) {
      await tx.outbox.updateMany({
        where: { id: { in: enviados } },
        data: { publicadoEm: new Date() },
      });
    }
    return enviados.length;
  }
}
