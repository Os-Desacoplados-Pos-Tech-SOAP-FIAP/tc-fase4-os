export enum StatusOS {
  RECEBIDA = 'RECEBIDA',
  EM_DIAGNOSTICO = 'EM_DIAGNOSTICO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  APROVADA = 'APROVADA',
  REPROVADA = 'REPROVADA',
  EM_EXECUCAO = 'EM_EXECUCAO',
  FINALIZADA = 'FINALIZADA',
  PAGA = 'PAGA',
  ENTREGUE = 'ENTREGUE',
  CANCELADA = 'CANCELADA',
}

/** Máquina de estados da OS (spec §4.1). Só a saga e a entrega mudam o status. */
const TRANSICOES: Readonly<Record<StatusOS, readonly StatusOS[]>> = {
  [StatusOS.RECEBIDA]: [StatusOS.EM_DIAGNOSTICO],
  [StatusOS.EM_DIAGNOSTICO]: [StatusOS.AGUARDANDO_APROVACAO],
  [StatusOS.AGUARDANDO_APROVACAO]: [StatusOS.APROVADA, StatusOS.REPROVADA],
  [StatusOS.APROVADA]: [StatusOS.EM_EXECUCAO, StatusOS.CANCELADA],
  [StatusOS.EM_EXECUCAO]: [StatusOS.FINALIZADA],
  [StatusOS.FINALIZADA]: [StatusOS.PAGA],
  [StatusOS.PAGA]: [StatusOS.ENTREGUE],
  [StatusOS.REPROVADA]: [],
  [StatusOS.ENTREGUE]: [],
  [StatusOS.CANCELADA]: [],
};

export const STATUS_TERMINAIS: ReadonlySet<StatusOS> = new Set([
  StatusOS.REPROVADA,
  StatusOS.ENTREGUE,
  StatusOS.CANCELADA,
]);

export function podeTransicionar(de: StatusOS, para: StatusOS): boolean {
  return TRANSICOES[de].includes(para);
}
