/**
 * Serializa as escritas de uma mesma OS dentro da transação corrente (E9): sem isso, duas
 * transações da mesma OS poderiam gravar comandos na outbox fora de ordem.
 */
export interface ITravaPorOs {
  travar(osId: string): Promise<void>;
}
