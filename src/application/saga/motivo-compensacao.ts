import { FalhaLida } from './saga-messages';

/**
 * Textos para o cliente por código de falha (vão no cancelar-orcamento e no e-mail do Billing).
 * Códigos: Catalog (reserva-insumos-falhou, erro de domínio da reserva) e Execution (MOTIVOS_RECUSA).
 */
const MOTIVOS_PARA_CLIENTE: Readonly<Record<string, string>> = {
  ESTOQUE_INSUFICIENTE: 'Não há estoque suficiente para as peças do orçamento',
  CAPACIDADE_ESGOTADA: 'A oficina está sem capacidade de execução no momento',
};

/** Códigos de compensação conhecidos (os que têm texto próprio para o cliente). */
export const CODIGOS_COMPENSACAO: readonly string[] = Object.keys(MOTIVOS_PARA_CLIENTE);

const MOTIVO_PADRAO_PARA_CLIENTE = 'Não foi possível seguir com o serviço';

/** Código nulo (saga gravada antes da coluna) ou sem texto próprio → texto genérico. */
export function motivoParaCliente(codigo: string | null): string {
  return (codigo && MOTIVOS_PARA_CLIENTE[codigo]) || MOTIVO_PADRAO_PARA_CLIENTE;
}

/** Detalhe técnico guardado na saga e no histórico da OS: `contexto: mensagem` (ou o código, sem mensagem). */
export function motivoTecnico(contexto: string, falha: FalhaLida): string {
  return `${contexto}: ${falha.mensagem || falha.motivo}`;
}
