import { Inject, Injectable } from '@nestjs/common';

import { CatalogoIndisponivelError } from '../../application/errors';
import { ICatalogo, ItemDoCatalogo } from '../../application/ports/catalogo';
import { ConfigCatalogo } from '../../config/os.config';

export const CONFIG_CATALOGO = Symbol('ConfigCatalogo');

type Leitor = (corpo: Record<string, unknown>) => ItemDoCatalogo | null;

const texto = (valor: unknown): valor is string => typeof valor === 'string' && valor !== '';
const numero = (valor: unknown): valor is number => typeof valor === 'number' && Number.isFinite(valor);

/** GET /servicos/:id do Catalog: { id, nome, valorPadrao, ativo }. */
const lerServico: Leitor = (corpo) =>
  texto(corpo.id) && texto(corpo.nome) && numero(corpo.valorPadrao) && typeof corpo.ativo === 'boolean'
    ? { id: corpo.id, descricao: corpo.nome, valorUnitario: corpo.valorPadrao, ativo: corpo.ativo }
    : null;

/** GET /insumos/:id do Catalog: { id, nome, valorUnitario, ... }. */
const lerInsumo: Leitor = (corpo) =>
  texto(corpo.id) && texto(corpo.nome) && numero(corpo.valorUnitario)
    ? { id: corpo.id, descricao: corpo.nome, valorUnitario: corpo.valorUnitario, ativo: true }
    : null;

/** Corpo não lido segura a conexão do pool do undici até o GC; descartar libera na hora. */
async function descartarCorpo(resposta: Response): Promise<void> {
  await resposta.body?.cancel();
}

/**
 * Cliente REST do Catalog (única chamada síncrona entre serviços da saga, spec §3).
 * Repassa o JWT do usuário: o Catalog aplica os próprios perfis.
 */
@Injectable()
export class CatalogoHttp implements ICatalogo {
  constructor(@Inject(CONFIG_CATALOGO) private readonly config: ConfigCatalogo) {}

  buscarServico(id: string, autorizacao: string): Promise<ItemDoCatalogo | null> {
    return this.buscar(`servicos/${encodeURIComponent(id)}`, autorizacao, lerServico);
  }

  buscarInsumo(id: string, autorizacao: string): Promise<ItemDoCatalogo | null> {
    return this.buscar(`insumos/${encodeURIComponent(id)}`, autorizacao, lerInsumo);
  }

  private async buscar(caminho: string, autorizacao: string, ler: Leitor): Promise<ItemDoCatalogo | null> {
    let resposta: Response;
    try {
      resposta = await fetch(`${this.config.urlBase}/${caminho}`, {
        headers: { authorization: autorizacao, accept: 'application/json' },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (erro) {
      throw new CatalogoIndisponivelError((erro as Error).name === 'TimeoutError' ? 'timeout' : 'falha de rede');
    }
    if (resposta.status === 404) {
      await descartarCorpo(resposta);
      return null;
    }
    if (!resposta.ok) {
      await descartarCorpo(resposta);
      throw new CatalogoIndisponivelError(`HTTP ${resposta.status}`);
    }

    const corpo: unknown = await resposta.json().catch(() => null);
    const item = typeof corpo === 'object' && corpo !== null ? ler(corpo as Record<string, unknown>) : null;
    if (!item) throw new CatalogoIndisponivelError('resposta fora do contrato');
    return item;
  }
}
