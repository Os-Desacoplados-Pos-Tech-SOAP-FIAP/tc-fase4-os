import { validarAmbiente } from './env.validation';

const BASE = {
  DATABASE_URL: 'postgresql://x',
  JWT_SECRET: 's',
  INTERNAL_SERVICE_TOKEN: 'token-interno-de-teste',
  CATALOG_BASE_URL: 'http://localhost:3002/api/catalog',
  MESSAGING_ENABLED: 'false',
};

describe('validarAmbiente', () => {
  it('aceita o mínimo com mensageria desligada', () => {
    expect(validarAmbiente(BASE)).toBe(BASE);
  });

  it('exige banco, segredos e Catalog', () => {
    expect(() => validarAmbiente({ MESSAGING_ENABLED: 'false' })).toThrow(
      'DATABASE_URL, JWT_SECRET, INTERNAL_SERVICE_TOKEN, CATALOG_BASE_URL',
    );
  });

  it('exige a fila de entrada e as três filas de comando quando a mensageria está ligada', () => {
    expect(() => validarAmbiente({ ...BASE, MESSAGING_ENABLED: 'true' })).toThrow(
      'INBOX_QUEUE_URL, CATALOG_COMMANDS_QUEUE_URL, BILLING_COMMANDS_QUEUE_URL, EXECUTION_COMMANDS_QUEUE_URL',
    );
  });

  it('rejeita timeout do Catalog inválido', () => {
    expect(() => validarAmbiente({ ...BASE, CATALOG_TIMEOUT_MS: '0' })).toThrow('CATALOG_TIMEOUT_MS');
    expect(() => validarAmbiente({ ...BASE, CATALOG_TIMEOUT_MS: 'x' })).toThrow('CATALOG_TIMEOUT_MS');
    expect(validarAmbiente({ ...BASE, CATALOG_TIMEOUT_MS: '1500' })).toBeDefined();
  });

  it('exige INTERNAL_SERVICE_TOKEN com ao menos 16 caracteres', () => {
    expect(() => validarAmbiente({ ...BASE, INTERNAL_SERVICE_TOKEN: 'curto' })).toThrow(
      'INTERNAL_SERVICE_TOKEN deve ter ao menos 16 caracteres',
    );
  });
});
