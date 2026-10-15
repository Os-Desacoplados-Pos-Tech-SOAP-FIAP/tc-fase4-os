import { lerConfigCatalogo, lerDestinosComandos } from './os.config';

describe('configuração do OS', () => {
  it('lê as filas de comando dos três serviços', () => {
    expect(
      lerDestinosComandos({
        CATALOG_COMMANDS_QUEUE_URL: 'c',
        BILLING_COMMANDS_QUEUE_URL: 'b',
        EXECUTION_COMMANDS_QUEUE_URL: 'e',
      }),
    ).toEqual({ catalog: 'c', billing: 'b', execution: 'e' });
  });

  it('usa string vazia quando a fila não foi configurada (mensageria desligada)', () => {
    expect(lerDestinosComandos({})).toEqual({ catalog: '', billing: '', execution: '' });
  });

  it('lê a URL do Catalog sem a barra final e o timeout com padrão de 3 s', () => {
    expect(lerConfigCatalogo({ CATALOG_BASE_URL: 'http://catalog/api/catalog/' })).toEqual({
      urlBase: 'http://catalog/api/catalog',
      timeoutMs: 3000,
    });
    expect(lerConfigCatalogo({ CATALOG_BASE_URL: 'http://c', CATALOG_TIMEOUT_MS: '500' })).toEqual({
      urlBase: 'http://c',
      timeoutMs: 500,
    });
  });
});
