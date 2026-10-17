/** Requisição já serializada pelo pino (pino-std-serializers). */
export interface RequisicaoSerializada {
  url?: string;
  query?: unknown;
  params?: unknown;
  [campo: string]: unknown;
}

/** Segmento de rota logo após /cpf/, /documento/ ou /placa/ (até a próxima barra ou a query). */
const SEGMENTO_PESSOAL = /\/(cpf|documento|placa)\/[^/?#]+/gi;
const CHAVES_PESSOAIS = new Set(['cpf', 'documento', 'placa']);
const MASCARA = '***';

function temChavePessoal(query: unknown): boolean {
  if (typeof query !== 'object' || query === null) return false;
  return Object.keys(query).some((chave) => CHAVES_PESSOAIS.has(chave.toLowerCase()));
}

/**
 * Serializer de `req` do pino-http (LGPD): CPF, documento e placa não vão para o log.
 * Mascara o segmento sensível da URL, remove `params` (repetem os segmentos da rota) e
 * remove `query` (e a query string da URL) quando ela traz algum desses dados. O pino-http aplica este serializer
 * sobre o padrão (pino.stdSerializers.req).
 */
export function semDadoPessoal<T extends RequisicaoSerializada>(req: T): T {
  delete req.params;
  if (req.url) req.url = req.url.replace(SEGMENTO_PESSOAL, `/$1/${MASCARA}`);
  if (!temChavePessoal(req.query)) return req;
  delete req.query;
  if (req.url) req.url = req.url.split('?')[0];
  return req;
}
