import { DomainError } from '../../shared/DomainError';
import { Entity, EntityProps } from '../../shared/Entity';
import { UniqueID } from '../../shared/UniqueID';

export enum TipoItemOrcamento {
  SERVICO = 'SERVICO',
  INSUMO = 'INSUMO',
}

export interface NovoItemOrcamento {
  tipo: TipoItemOrcamento;
  /** Id do serviço ou insumo no Catalog. */
  referenciaId: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
}

export type ItemOrcamentoProps = EntityProps & NovoItemOrcamento;

export const paraCentavos = (valor: number): number => Math.round(valor * 100);

function validarQuantidade(quantidade: number): void {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw new DomainError('Quantidade deve ser inteira e positiva', 'ITEM_QUANTIDADE_INVALIDA');
  }
}

function validarValor(valor: number): void {
  const temMaisDeDuasCasas = Math.abs(valor * 100 - paraCentavos(valor)) > 1e-6;
  if (!Number.isFinite(valor) || valor < 0 || temMaisDeDuasCasas) {
    throw new DomainError('Valor unitário inválido', 'ITEM_VALOR_INVALIDO');
  }
}

/** Snapshot de um serviço ou insumo do Catalog no momento em que entrou na OS. */
export class ItemOrcamento extends Entity<ItemOrcamentoProps> {
  private constructor(props: ItemOrcamentoProps, id?: UniqueID) {
    super(props, id);
  }

  public static criar(novo: NovoItemOrcamento): ItemOrcamento {
    validarQuantidade(novo.quantidade);
    validarValor(novo.valorUnitario);
    const descricao = novo.descricao?.trim() ?? '';
    if (descricao === '') {
      throw new DomainError('Descrição do item é obrigatória', 'ITEM_DESCRICAO_INVALIDA');
    }
    return new ItemOrcamento({
      tipo: novo.tipo,
      referenciaId: new UniqueID(novo.referenciaId).toValue(),
      descricao,
      quantidade: novo.quantidade,
      valorUnitario: paraCentavos(novo.valorUnitario) / 100,
    });
  }

  public static restaurar(props: ItemOrcamentoProps, id: UniqueID): ItemOrcamento {
    return new ItemOrcamento({ ...props }, id);
  }

  public get tipo(): TipoItemOrcamento {
    return this.props.tipo;
  }
  public get referenciaId(): string {
    return this.props.referenciaId;
  }
  public get descricao(): string {
    return this.props.descricao;
  }
  public get quantidade(): number {
    return this.props.quantidade;
  }
  public get valorUnitario(): number {
    return this.props.valorUnitario;
  }

  /** Em centavos inteiros para não acumular erro de ponto flutuante. */
  public get valorTotalEmCentavos(): number {
    return this.props.quantidade * paraCentavos(this.props.valorUnitario);
  }

  public get valorTotal(): number {
    return this.valorTotalEmCentavos / 100;
  }

  public incrementar(quantidade: number): void {
    validarQuantidade(quantidade);
    this.props.quantidade += quantidade;
    this.touch();
  }
}
