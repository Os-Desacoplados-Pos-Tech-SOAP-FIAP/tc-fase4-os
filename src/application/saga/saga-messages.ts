import { TipoItemOrcamento } from '../../domain/ordem-de-servico/entities/ItemOrcamento';

/** Comandos que o OS envia (cada um vai para a fila de entrada do serviço dono). */
export const CATALOG_COMMANDS = {
  RESERVAR_INSUMOS: 'catalog.reservar-insumos.v1',
  LIBERAR_RESERVAS: 'catalog.liberar-reservas.v1',
  BAIXAR_RESERVAS: 'catalog.baixar-reservas.v1',
} as const;

export const BILLING_COMMANDS = {
  GERAR_ORCAMENTO: 'billing.gerar-orcamento.v1',
  CANCELAR_ORCAMENTO: 'billing.cancelar-orcamento.v1',
  GERAR_COBRANCA: 'billing.gerar-cobranca.v1',
} as const;

export const EXECUTION_COMMANDS = {
  ENFILEIRAR_DIAGNOSTICO: 'execution.enfileirar-diagnostico.v1',
  REABRIR_DIAGNOSTICO: 'execution.reabrir-diagnostico.v1',
  ENFILEIRAR_EXECUCAO: 'execution.enfileirar-execucao.v1',
} as const;

/** Eventos que chegam na fila de entrada do OS (assinatura dos três tópicos). */
export const CATALOG_EVENTS = {
  INSUMOS_RESERVADOS: 'catalog.insumos-reservados.v1',
  RESERVA_INSUMOS_FALHOU: 'catalog.reserva-insumos-falhou.v1',
  RESERVAS_LIBERADAS: 'catalog.reservas-liberadas.v1',
  ESTOQUE_BAIXADO: 'catalog.estoque-baixado.v1',
} as const;

export const BILLING_EVENTS = {
  ORCAMENTO_ENVIADO: 'billing.orcamento-enviado.v1',
  ORCAMENTO_APROVADO: 'billing.orcamento-aprovado.v1',
  ORCAMENTO_REPROVADO: 'billing.orcamento-reprovado.v1',
  ORCAMENTO_EXPIRADO: 'billing.orcamento-expirado.v1',
  ORCAMENTO_CANCELADO: 'billing.orcamento-cancelado.v1',
  COBRANCA_GERADA: 'billing.cobranca-gerada.v1',
  PAGAMENTO_CONFIRMADO: 'billing.pagamento-confirmado.v1',
  PAGAMENTO_RECUSADO: 'billing.pagamento-recusado.v1',
} as const;

export const EXECUTION_EVENTS = {
  DIAGNOSTICO_INICIADO: 'execution.diagnostico-iniciado.v1',
  DIAGNOSTICO_CONCLUIDO: 'execution.diagnostico-concluido.v1',
  EXECUCAO_ACEITA: 'execution.execucao-aceita.v1',
  EXECUCAO_RECUSADA: 'execution.execucao-recusada.v1',
  REPARO_INICIADO: 'execution.reparo-iniciado.v1',
  SERVICO_EXECUTADO: 'execution.servico-executado.v1',
  EXECUCAO_CONCLUIDA: 'execution.execucao-concluida.v1',
} as const;

// Payloads dos comandos (valores sempre como number JSON: Decimal vira string e vai para a DLQ).

export interface EnfileirarDiagnosticoPayload {
  numeroOs: number;
}

export interface ItemExecucaoPayload {
  itemId: string;
  servicoId: string;
  descricao: string;
}

export interface EnfileirarExecucaoPayload {
  itens: ItemExecucaoPayload[];
}

export interface ItemGerarOrcamentoPayload {
  itemId: string;
  tipo: TipoItemOrcamento;
  referenciaId: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
}

export interface GerarOrcamentoPayload {
  numeroOs: number;
  cliente: { nome: string; email: string };
  itens: ItemGerarOrcamentoPayload[];
}

export interface CancelarOrcamentoPayload {
  motivo: string;
}

export interface ReservarInsumosPayload {
  itens: { insumoId: string; quantidade: number }[];
}

/** liberar-reservas, baixar-reservas, reabrir-diagnostico e gerar-cobranca. */
export type PayloadVazio = Record<string, never>;

// Campos lidos dos eventos (os demais são ignorados).

export interface OrcamentoEnviadoLido {
  valorTotal: number;
  validoAte: string;
}

export interface CobrancaGeradaLida {
  initPoint: string;
}

/** reserva-insumos-falhou, execucao-recusada e pagamento-recusado. */
export interface FalhaLida {
  motivo: string;
  mensagem?: string;
}
