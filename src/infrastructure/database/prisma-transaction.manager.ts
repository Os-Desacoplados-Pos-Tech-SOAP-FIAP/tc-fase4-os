import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ITransactionManager } from '../../application/ports/transaction-manager';
import { PrismaService } from './prisma.service';

/**
 * Limites da transação interativa. O padrão do Prisma (5s de timeout, 2s de maxWait) é curto
 * para um handler que espera a trava por OS (pg_advisory_xact_lock) e depois faz I/O.
 */
const TIMEOUT_DA_TRANSACAO_MS = 15_000;
const ESPERA_MAXIMA_POR_CONEXAO_MS = 5_000;

/**
 * Transação por contexto assíncrono: dentro de `run`, `client` devolve o client da
 * transação; fora dela, o PrismaService. Assim repositórios, outbox e registro de
 * idempotência participam da mesma transação sem receber `tx` por parâmetro.
 */
@Injectable()
export class PrismaTransactionManager implements ITransactionManager {
  private readonly contexto = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(private readonly prisma: PrismaService) {}

  get client(): Prisma.TransactionClient {
    return this.contexto.getStore() ?? this.prisma;
  }

  get emTransacao(): boolean {
    return this.contexto.getStore() !== undefined;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.contexto.getStore()) return work();
    return this.prisma.$transaction((tx) => this.contexto.run(tx, work), {
      timeout: TIMEOUT_DA_TRANSACAO_MS,
      maxWait: ESPERA_MAXIMA_POR_CONEXAO_MS,
    });
  }
}
