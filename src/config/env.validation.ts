const OBRIGATORIAS = ['DATABASE_URL', 'JWT_SECRET'];
const OBRIGATORIAS_MENSAGERIA = ['INBOX_QUEUE_URL'];

function exigirAusentes(config: Record<string, unknown>, chaves: string[]): void {
  const ausentes = chaves.filter((chave) => !config[chave]);
  if (ausentes.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${ausentes.join(', ')}`);
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
  return config;
}
