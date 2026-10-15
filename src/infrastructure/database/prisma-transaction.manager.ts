import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ITransactionManager } from '../../application/ports/transaction-manager';
import { PrismaService } from './prisma.service';

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

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.contexto.getStore()) return work();
    return this.prisma.$transaction((tx) => this.contexto.run(tx, work));
  }
}
