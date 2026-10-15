import { OrdemDeServico } from '../../domain/ordem-de-servico/entities/OrdemDeServico';
import { DestinosComandos, ServicoDestino } from '../ports/destinos-comandos';
import { criarEnvelope } from '../ports/message-envelope';
import { IOutbox } from '../ports/outbox';
import {
  BILLING_COMMANDS,
  CancelarOrcamentoPayload,
  CATALOG_COMMANDS,
  EnfileirarDiagnosticoPayload,
  EnfileirarExecucaoPayload,
  EXECUTION_COMMANDS,
  GerarOrcamentoPayload,
  PayloadVazio,
  ReservarInsumosPayload,
} from './saga-messages';

export interface ComandoSaga<TPayload extends object = object> {
  destino: ServicoDestino;
  type: string;
  payload: TPayload;
}

export interface ClienteDoOrcamento {
  nome: string;
  email: string;
}

const vazio = (): PayloadVazio => ({});

/** Monta os comandos do orquestrador a partir do estado da OS (contratos em saga-messages.ts). */
export const comandos = {
  enfileirarDiagnostico: (os: OrdemDeServico): ComandoSaga<EnfileirarDiagnosticoPayload> => ({
    destino: 'execution',
    type: EXECUTION_COMMANDS.ENFILEIRAR_DIAGNOSTICO,
    payload: { numeroOs: os.numero },
  }),

  reabrirDiagnostico: (): ComandoSaga<PayloadVazio> => ({
    destino: 'execution',
    type: EXECUTION_COMMANDS.REABRIR_DIAGNOSTICO,
    payload: vazio(),
  }),

  /** Só serviços: insumo não tem apontamento e bloquearia a conclusão no Execution. */
  enfileirarExecucao: (os: OrdemDeServico): ComandoSaga<EnfileirarExecucaoPayload> => ({
    destino: 'execution',
    type: EXECUTION_COMMANDS.ENFILEIRAR_EXECUCAO,
    payload: {
      itens: os.itensDeServico.map((item) => ({
        itemId: item.id.toValue(),
        servicoId: item.referenciaId,
        descricao: item.descricao,
      })),
    },
  }),

  gerarOrcamento: (
    os: OrdemDeServico,
    cliente: ClienteDoOrcamento,
  ): ComandoSaga<GerarOrcamentoPayload> => ({
    destino: 'billing',
    type: BILLING_COMMANDS.GERAR_ORCAMENTO,
    payload: {
      numeroOs: os.numero,
      cliente: { nome: cliente.nome, email: cliente.email },
      itens: os.itens.map((item) => ({
        itemId: item.id.toValue(),
        tipo: item.tipo,
        referenciaId: item.referenciaId,
        descricao: item.descricao,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario,
      })),
    },
  }),

  cancelarOrcamento: (motivo: string): ComandoSaga<CancelarOrcamentoPayload> => ({
    destino: 'billing',
    type: BILLING_COMMANDS.CANCELAR_ORCAMENTO,
    payload: { motivo },
  }),

  gerarCobranca: (): ComandoSaga<PayloadVazio> => ({
    destino: 'billing',
    type: BILLING_COMMANDS.GERAR_COBRANCA,
    payload: vazio(),
  }),

  /** Pode ir vazio: o Catalog responde insumos-reservados na hora (spec §2.2). */
  reservarInsumos: (os: OrdemDeServico): ComandoSaga<ReservarInsumosPayload> => ({
    destino: 'catalog',
    type: CATALOG_COMMANDS.RESERVAR_INSUMOS,
    payload: {
      itens: os.itensDeInsumo.map((item) => ({
        insumoId: item.referenciaId,
        quantidade: item.quantidade,
      })),
    },
  }),

  liberarReservas: (): ComandoSaga<PayloadVazio> => ({
    destino: 'catalog',
    type: CATALOG_COMMANDS.LIBERAR_RESERVAS,
    payload: vazio(),
  }),

  baixarReservas: (): ComandoSaga<PayloadVazio> => ({
    destino: 'catalog',
    type: CATALOG_COMMANDS.BAIXAR_RESERVAS,
    payload: vazio(),
  }),
};

/**
 * Grava os comandos na outbox, na transação corrente e na ordem recebida (a outbox preserva
 * a ordem por OS). Cada comando ganha um messageId novo: reenvio do mesmo comando só acontece
 * pela outbox, que reaproveita o envelope gravado.
 */
export async function enviarComandos(
  outbox: IOutbox,
  destinos: DestinosComandos,
  osId: string,
  lista: ComandoSaga[],
  causationId?: string,
): Promise<void> {
  for (const comando of lista) {
    await outbox.publicar(
      criarEnvelope(comando.type, osId, comando.payload, causationId),
      destinos[comando.destino],
    );
  }
}
