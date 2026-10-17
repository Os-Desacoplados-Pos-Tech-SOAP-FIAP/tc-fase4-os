import { motivoParaCliente, motivoTecnico } from './motivo-compensacao';

describe('motivo da compensação', () => {
  describe('motivoParaCliente', () => {
    it.each([
      ['ESTOQUE_INSUFICIENTE', 'Não há estoque suficiente para as peças do orçamento'],
      ['CAPACIDADE_ESGOTADA', 'A oficina está sem capacidade de execução no momento'],
      ['INSUMO_NAO_ENCONTRADO', 'Não foi possível seguir com o serviço'],
      ['ORDEM_EM_ESTADO_INVALIDO', 'Não foi possível seguir com o serviço'],
    ])('%s → %s', (codigo, esperado) => {
      expect(motivoParaCliente(codigo)).toBe(esperado);
    });

    it('sem código → texto genérico', () => {
      expect(motivoParaCliente(null)).toBe('Não foi possível seguir com o serviço');
    });
  });

  describe('motivoTecnico', () => {
    it('junta contexto e mensagem legível, sem o código', () => {
      expect(motivoTecnico('Execução recusada', { motivo: 'CAPACIDADE_ESGOTADA', mensagem: 'Fila cheia' })).toBe(
        'Execução recusada: Fila cheia',
      );
    });

    it('sem mensagem usa o código', () => {
      expect(motivoTecnico('Reserva de insumos falhou', { motivo: 'ESTOQUE_INSUFICIENTE' })).toBe(
        'Reserva de insumos falhou: ESTOQUE_INSUFICIENTE',
      );
    });
  });
});
