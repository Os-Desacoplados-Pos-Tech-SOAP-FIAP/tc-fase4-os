/** URLs das filas de entrada (FIFO) dos serviços que recebem comandos do orquestrador. */
export interface DestinosComandos {
  catalog: string;
  billing: string;
  execution: string;
}

export type ServicoDestino = keyof DestinosComandos;
