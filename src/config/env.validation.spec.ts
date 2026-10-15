import { validarAmbiente } from './env.validation';

const BASE = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 's', MESSAGING_ENABLED: 'false' };

describe('validarAmbiente', () => {
  it('aceita o mínimo com mensageria desligada', () => {
    expect(validarAmbiente(BASE)).toBe(BASE);
  });

  it('exige a fila de entrada quando a mensageria está ligada', () => {
    expect(() => validarAmbiente({ ...BASE, MESSAGING_ENABLED: 'true' })).toThrow(
      'INBOX_QUEUE_URL',
    );
  });

  it('exige DATABASE_URL e JWT_SECRET', () => {
    expect(() => validarAmbiente({ MESSAGING_ENABLED: 'false' })).toThrow(
      'DATABASE_URL, JWT_SECRET',
    );
  });
});
