import { ItemOrcamento, TipoItemOrcamento } from './ItemOrcamento';

const SERVICO_ID = '7d3c1b7e-0a37-4c9e-9c35-0d2f0b6f4a11';
const novo = {
  tipo: TipoItemOrcamento.SERVICO,
  referenciaId: SERVICO_ID,
  descricao: '  Troca de óleo ',
  quantidade: 2,
  valorUnitario: 120.5,
};

describe('ItemOrcamento', () => {
  it('cria com id próprio, descrição aparada e total em centavos exatos', () => {
    const item = ItemOrcamento.criar(novo);
    expect(item.id.toValue()).toMatch(/^[0-9a-f-]{36}$/);
    expect(item.descricao).toBe('Troca de óleo');
    expect(item.valorTotal).toBe(241);
  });

  it('soma sem erro de ponto flutuante', () => {
    const item = ItemOrcamento.criar({ ...novo, quantidade: 3, valorUnitario: 0.1 });
    expect(item.valorTotal).toBe(0.3);
  });

  it.each([
    [{ quantidade: 0 }, 'ITEM_QUANTIDADE_INVALIDA'],
    [{ quantidade: 1.5 }, 'ITEM_QUANTIDADE_INVALIDA'],
    [{ valorUnitario: -1 }, 'ITEM_VALOR_INVALIDO'],
    [{ valorUnitario: 10.123 }, 'ITEM_VALOR_INVALIDO'],
    [{ valorUnitario: Number.NaN }, 'ITEM_VALOR_INVALIDO'],
    [{ descricao: '   ' }, 'ITEM_DESCRICAO_INVALIDA'],
    [{ referenciaId: 'nao-e-uuid' }, 'INVALID_ID'],
  ])('recusa %p', (alteracao, code) => {
    expect(() => ItemOrcamento.criar({ ...novo, ...alteracao })).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it('incrementa quantidade', () => {
    const item = ItemOrcamento.criar(novo);
    item.incrementar(3);
    expect(item.quantidade).toBe(5);
    expect(() => item.incrementar(0)).toThrow(
      expect.objectContaining({ code: 'ITEM_QUANTIDADE_INVALIDA' }),
    );
  });

  it('restaura preservando id e valores', () => {
    const original = ItemOrcamento.criar(novo);
    const restaurado = ItemOrcamento.restaurar(
      {
        tipo: original.tipo,
        referenciaId: original.referenciaId,
        descricao: original.descricao,
        quantidade: original.quantidade,
        valorUnitario: original.valorUnitario,
      },
      original.id,
    );
    expect(restaurado.id.equals(original.id)).toBe(true);
    expect(restaurado.valorTotal).toBe(241);
  });
});
