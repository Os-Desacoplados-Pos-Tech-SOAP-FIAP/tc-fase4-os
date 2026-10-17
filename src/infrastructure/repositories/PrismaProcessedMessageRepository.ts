import { Injectable } from '@nestjs/common';

import { IProcessedMessageRepository } from '../../application/ports/processed-message.repository';
import { PrismaTransactionManager } from '../database/prisma-transaction.manager';

@Injectable()
export class PrismaProcessedMessageRepository implements IProcessedMessageRepository {
  constructor(private readonly db: PrismaTransactionManager) {}

  async registrar(messageId: string): Promise<boolean> {
    // ON CONFLICT DO NOTHING: duplicata não lança erro e não aborta a transação.
    const resultado = await this.db.client.processedMessage.createMany({
      data: [{ messageId }],
      skipDuplicates: true,
    });
    return resultado.count === 1;
  }
}
