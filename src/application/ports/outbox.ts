import { MessageEnvelope } from './message-envelope';

/**
 * Grava um comando para publicação, na transação corrente. O OS não tem tópico de eventos
 * próprio: todo envio tem destino explícito (URL da fila de entrada do serviço alvo).
 */
export interface IOutbox {
  publicar(envelope: MessageEnvelope, destino: string): Promise<void>;
}
