import { Injectable } from '@nestjs/common';
import { context, propagation } from '@opentelemetry/api';
import { Prisma } from '@prisma/client';

import { MessageEnvelope } from '../../application/ports/message-envelope';
import { IOutbox } from '../../application/ports/outbox';
import { PrismaTransactionManager } from '../database/prisma-transaction.manager';

@Injectable()
export class PrismaOutbox implements IOutbox {
  constructor(private readonly db: PrismaTransactionManager) {}

  async publicar(envelope: MessageEnvelope, destino: string): Promise<void> {
    await this.db.client.outbox.create({
      data: {
        messageId: envelope.messageId,
        type: envelope.type,
        destination: destino,
        groupId: envelope.correlationId,
        body: envelope as unknown as Prisma.InputJsonValue,
        traceparent: traceparentAtivo(),
      },
    });
  }
}

/**
 * O envio acontece depois, no publicador, fora do contexto da requisição/mensagem;
 * por isso o contexto W3C é capturado aqui e gravado junto com o evento.
 */
function traceparentAtivo(): string | null {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent ?? null;
}
