import { CatalogoIndisponivelError } from '../../application/errors';
import { CatalogoHttp } from './catalogo-http';

const ID = 'a0000000-0000-4000-8000-000000000001';
const TOKEN = 'Bearer abc';

function resposta(status: number, corpo?: unknown): Response {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CatalogoHttp', () => {
  const catalogo = new CatalogoHttp({ urlBase: 'http://catalog/api/catalog', timeoutMs: 3000 });
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('busca serviço repassando o JWT e mapeia nome e valorPadrao', async () => {
    fetchMock.mockResolvedValue(resposta(200, { id: ID, nome: 'Revisão geral', valorPadrao: 250, ativo: true, descricao: 'x' }));
    expect(await catalogo.buscarServico(ID, TOKEN)).toEqual({ id: ID, descricao: 'Revisão geral', valorUnitario: 250, ativo: true });
    const [url, opcoes] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://catalog/api/catalog/servicos/${ID}`);
    expect(opcoes.headers).toEqual(expect.objectContaining({ authorization: TOKEN }));
    expect(opcoes.signal).toBeDefined();
  });

  it('busca insumo e mapeia nome e valorUnitario, sempre ativo', async () => {
    fetchMock.mockResolvedValue(resposta(200, { id: ID, nome: 'Filtro', valorUnitario: 35.5, quantidadeDisponivel: 0 }));
    expect(await catalogo.buscarInsumo(ID, TOKEN)).toEqual({ id: ID, descricao: 'Filtro', valorUnitario: 35.5, ativo: true });
    expect(fetchMock.mock.calls[0][0]).toBe(`http://catalog/api/catalog/insumos/${ID}`);
  });

  it('404 → null', async () => {
    fetchMock.mockResolvedValue(resposta(404, { message: 'não encontrado' }));
    expect(await catalogo.buscarServico(ID, TOKEN)).toBeNull();
  });

  it.each([404, 500])('HTTP %i descarta o corpo da resposta antes de sair', async (status) => {
    const respostaComCorpo = resposta(status, { message: 'x' });
    const cancelar = jest.spyOn(respostaComCorpo.body!, 'cancel');
    fetchMock.mockResolvedValue(respostaComCorpo);
    await catalogo.buscarServico(ID, TOKEN).catch(() => undefined);
    expect(cancelar).toHaveBeenCalledTimes(1);
  });

  it('404 sem corpo → null sem quebrar', async () => {
    fetchMock.mockResolvedValue(resposta(404));
    expect(await catalogo.buscarServico(ID, TOKEN)).toBeNull();
  });

  it.each([
    ['erro 500', () => fetchMock.mockResolvedValue(resposta(500, {})), 'HTTP 500'],
    ['erro 401', () => fetchMock.mockResolvedValue(resposta(401, {})), 'HTTP 401'],
    ['corpo fora do contrato', () => fetchMock.mockResolvedValue(resposta(200, { id: ID })), 'resposta fora do contrato'],
    ['corpo não JSON', () => fetchMock.mockResolvedValue(new Response('<html>', { status: 200 })), 'resposta fora do contrato'],
    ['falha de rede', () => fetchMock.mockRejectedValue(new TypeError('fetch failed')), 'falha de rede'],
    ['timeout', () => fetchMock.mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' })), 'timeout'],
  ])('%s → CatalogoIndisponivelError', async (_caso, preparar, motivo) => {
    preparar();
    const erro = await catalogo.buscarServico(ID, TOKEN).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(CatalogoIndisponivelError);
    expect((erro as Error).message).toBe(`Catalog indisponível: ${motivo}`);
  });
});
