import { CatalogoIndisponivelError } from '../../src/application/errors';
import { ICatalogo, ItemDoCatalogo } from '../../src/application/ports/catalogo';

export const SERVICO_REVISAO = 'a0000000-0000-4000-8000-000000000001';
export const SERVICO_INATIVO = 'a0000000-0000-4000-8000-000000000002';
export const INSUMO_FILTRO = 'b0000000-0000-4000-8000-000000000001';
export const INSUMO_SEM_ESTOQUE = 'b0000000-0000-4000-8000-000000000002';

/** Catalog falso com dois serviços e dois insumos; `fora()` simula indisponibilidade. */
export class CatalogoEmMemoria implements ICatalogo {
  public autorizacoes: string[] = [];
  private indisponivel = false;

  private readonly servicos = new Map<string, ItemDoCatalogo>([
    [SERVICO_REVISAO, { id: SERVICO_REVISAO, descricao: 'Revisão geral', valorUnitario: 250, ativo: true }],
    [SERVICO_INATIVO, { id: SERVICO_INATIVO, descricao: 'Polimento', valorUnitario: 80, ativo: false }],
  ]);

  private readonly insumos = new Map<string, ItemDoCatalogo>([
    [INSUMO_FILTRO, { id: INSUMO_FILTRO, descricao: 'Filtro de óleo', valorUnitario: 35.5, ativo: true }],
    [INSUMO_SEM_ESTOQUE, { id: INSUMO_SEM_ESTOQUE, descricao: 'Pastilha de freio', valorUnitario: 120, ativo: true }],
  ]);

  fora(): void {
    this.indisponivel = true;
  }

  async buscarServico(id: string, autorizacao: string): Promise<ItemDoCatalogo | null> {
    return this.buscar(this.servicos, id, autorizacao);
  }

  async buscarInsumo(id: string, autorizacao: string): Promise<ItemDoCatalogo | null> {
    return this.buscar(this.insumos, id, autorizacao);
  }

  private buscar(
    itens: Map<string, ItemDoCatalogo>,
    id: string,
    autorizacao: string,
  ): ItemDoCatalogo | null {
    this.autorizacoes.push(autorizacao);
    if (this.indisponivel) throw new CatalogoIndisponivelError('fora do ar (teste)');
    return itens.get(id) ?? null;
  }
}
