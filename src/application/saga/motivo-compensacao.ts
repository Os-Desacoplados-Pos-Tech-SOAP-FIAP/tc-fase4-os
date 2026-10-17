import { FalhaLida } from './saga-messages';

/**
 * Textos para o cliente por código de falha (vão no cancelar-orcamento e no e-mail do Billing).
 * Códigos: Catalog (reserva-insumos-falhou, erro de domínio da reserva) e Execution (MOTIVOS_RECUSA).
 */
const MOTIVOS_PARA_CLIENTE: Readonly<Record<string, string>> = {
  ESTOQUE_INSUFICIENTE: 'Não há estoque suficiente para as peças do orçamento',
  CAPACIDADE_ESGOTADA: 'A oficina está sem capacidade de execução no momento',
};

const MOTIVO_PADRAO_PARA_CLIENTE = 'Não foi possível seguir com o serviço';

/** Código entre colchetes no motivo técnico, para derivar o texto do cliente depois (reservas-liberadas). */
const CODIGO_NO_MOTIVO = /\[([A-Z0-9_]+)\]/;

export function motivoParaCliente(codigo: string | null): string {
  return (codigo && MOTIVOS_PARA_CLIENTE[codigo]) || MOTIVO_PADRAO_PARA_CLIENTE;
}

/** Detalhe técnico guardado na saga e no histórico da OS: `contexto [CODIGO]: mensagem`. */
export function motivoTecnico(contexto: string, falha: FalhaLida): string {
  const base = `${contexto} [${falha.motivo}]`;
  return falha.mensagem ? `${base}: ${falha.mensagem}` : base;
}

export function codigoDoMotivoTecnico(motivo: string | null): string | null {
  return motivo?.match(CODIGO_NO_MOTIVO)?.[1] ?? null;
}
