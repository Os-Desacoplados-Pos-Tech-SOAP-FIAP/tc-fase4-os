import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';

import pino from 'pino';

import { semDadoPessoal } from './sem-dado-pessoal';

const CPF = '52998224725';

/** Monta uma requisição como o Express entrega ao pino-http (com params e query já resolvidos). */
function requisicaoBruta(url: string, params: Record<string, string>, query: Record<string, string> = {}) {
  const req = new IncomingMessage(new Socket()) as IncomingMessage & Record<string, unknown>;
  req.method = 'GET';
  req.url = url;
  req.headers = { host: 'localhost' };
  req.params = params;
  req.query = query;
  return req;
}

describe('semDadoPessoal', () => {
  it('mascara o CPF na URL e remove params a partir do serializer padrão do pino', () => {
    const bruta = requisicaoBruta(`/api/os/internal/clientes/cpf/${CPF}`, { cpf: CPF });

    const padrao = { ...pino.stdSerializers.req(bruta) };
    expect(JSON.stringify(padrao)).toContain(CPF);

    const serializado = semDadoPessoal(padrao);

    expect(serializado.url).toBe('/api/os/internal/clientes/cpf/***');
    expect(serializado).not.toHaveProperty('params');
    expect(JSON.stringify(serializado)).not.toContain(CPF);
  });

  it.each([
    ['/api/os/clientes/documento/12345678000195', '/api/os/clientes/documento/***'],
    ['/api/os/veiculos/placa/ABC1D23?x=1', '/api/os/veiculos/placa/***?x=1'],
    ['/api/os/clientes/cpf/529.982.247-25/extra', '/api/os/clientes/cpf/***/extra'],
  ])('mascara o segmento sensível em %s', (url, esperado) => {
    expect(semDadoPessoal({ url }).url).toBe(esperado);
  });

  it('mantém a URL das demais rotas e sempre remove params', () => {
    const req = { method: 'GET', url: '/api/os/ordens/os-1?pagina=2', params: { id: 'os-1' }, query: { pagina: '2' } };

    expect(semDadoPessoal(req)).toEqual({ method: 'GET', url: '/api/os/ordens/os-1?pagina=2', query: { pagina: '2' } });
  });

  it('remove a query quando ela traz cpf, documento ou placa', () => {
    const req = { url: '/api/os/clientes?cpf=' + CPF, query: { cpf: CPF } };

    const serializado = semDadoPessoal(req);

    expect(serializado).not.toHaveProperty('query');
    expect(serializado.url).toBe('/api/os/clientes');
    expect(JSON.stringify(serializado)).not.toContain(CPF);
  });

  it('aceita requisição sem url', () => {
    expect(semDadoPessoal({ method: 'GET' })).toEqual({ method: 'GET' });
  });
});
