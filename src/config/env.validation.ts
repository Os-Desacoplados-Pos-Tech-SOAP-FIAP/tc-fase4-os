const OBRIGATORIAS = ['DATABASE_URL', 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN', 'CATALOG_BASE_URL'];
const TAMANHO_MINIMO_TOKEN_INTERNO = 16;
const OBRIGATORIAS_MENSAGERIA = [
  'INBOX_QUEUE_URL',
  'CATALOG_COMMANDS_QUEUE_URL',
  'BILLING_COMMANDS_QUEUE_URL',
  'EXECUTION_COMMANDS_QUEUE_URL',
];

function exigirAusentes(config: Record<string, unknown>, chaves: string[]): void {
  const ausentes = chaves.filter((chave) => !config[chave]);
  if (ausentes.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${ausentes.join(', ')}`);
  }
}

function exigirInteiro(config: Record<string, unknown>, chave: string, minimo: number): void {
  const valor = config[chave];
  if (valor === undefined || valor === '') return;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo) {
    throw new Error(`${chave} deve ser inteiro maior ou igual a ${minimo}`);
  }
}

/** Falha no boot se faltar configuração, em vez de quebrar na primeira requisição. */
export function validarAmbiente(config: Record<string, unknown>): Record<string, unknown> {
  exigirAusentes(
    config,
    config.MESSAGING_ENABLED === 'false'
      ? OBRIGATORIAS
      : [...OBRIGATORIAS, ...OBRIGATORIAS_MENSAGERIA],
  );
  exigirInteiro(config, 'CATALOG_TIMEOUT_MS', 1);
  // Segredo compartilhado com a Lambda: curto demais é adivinhável.
  if (String(config.INTERNAL_SERVICE_TOKEN).length < TAMANHO_MINIMO_TOKEN_INTERNO) {
    throw new Error(
      `INTERNAL_SERVICE_TOKEN deve ter ao menos ${TAMANHO_MINIMO_TOKEN_INTERNO} caracteres`,
    );
  }
  return config;
}
