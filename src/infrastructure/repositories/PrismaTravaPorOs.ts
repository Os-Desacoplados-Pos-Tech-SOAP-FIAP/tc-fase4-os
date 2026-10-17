import { Injectable } from '@nestjs/common';

import { ITravaPorOs } from '../../application/ports/trava-por-os';
import { PrismaTransactionManager } from '../database/prisma-transaction.manager';

/**
 * Classe do advisory lock de OS. A forma de dois int4 tem espaço de chaves separado da forma
 * de um bigint usada pelo OutboxPublisher (OUTBOX_LOCK_KEY), então não colidem.
 */
const CLASSE_TRAVA_OS = 5;

/**
 * Trava a OS até o fim da transação corrente (E9). Precisa rodar dentro de
 * ITransactionManager.run: fora de transação, o lock de transação é solto na hora.
 */
@Injectable()
export class PrismaTravaPorOs implements ITravaPorOs {
  constructor(private readonly db: PrismaTransactionManager) {}

  async travar(osId: string): Promise<void> {
    if (!this.db.emTransacao) {
      throw new Error('travar exige uma transação ativa (ITransactionManager.run)');
    }
    await this.db.client.$executeRaw`SELECT pg_advisory_xact_lock(${CLASSE_TRAVA_OS}::int, hashtext(${osId}))`;
  }
}
