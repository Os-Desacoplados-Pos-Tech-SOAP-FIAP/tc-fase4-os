import { MessageEnvelope } from '../../src/application/ports/message-envelope';
import { IOutbox } from '../../src/application/ports/outbox';
import { ParticipanteTransacao } from './fake-transaction.manager';

export interface MensagemEnviada {
  envelope: MessageEnvelope;
  destino: string;
}

export class InMemoryOutbox implements IOutbox, ParticipanteTransacao {
  public enviadas: MensagemEnviada[] = [];

  async publicar(envelope: MessageEnvelope, destino: string): Promise<void> {
    this.enviadas.push({ envelope, destino });
  }
  tipos(): string[] {
    return this.enviadas.map((m) => m.envelope.type);
  }
  ultima(): MensagemEnviada {
    return this.enviadas[this.enviadas.length - 1];
  }
  snapshot(): unknown {
    return [...this.enviadas];
  }
  restaurar(estado: unknown): void {
    this.enviadas = estado as MensagemEnviada[];
  }
}
