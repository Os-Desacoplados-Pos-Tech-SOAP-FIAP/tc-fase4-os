import { codigoDoMotivoTecnico, motivoParaCliente, motivoTecnico } from './motivo-compensacao';

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
    it('guarda contexto, código e mensagem', () => {
      expect(motivoTecnico('Execução recusada', { motivo: 'CAPACIDADE_ESGOTADA', mensagem: 'Fila cheia' })).toBe(
        'Execução recusada [CAPACIDADE_ESGOTADA]: Fila cheia',
      );
    });

    it('sem mensagem fica só com o código', () => {
      expect(motivoTecnico('Reserva de insumos falhou', { motivo: 'ESTOQUE_INSUFICIENTE' })).toBe(
        'Reserva de insumos falhou [ESTOQUE_INSUFICIENTE]',
      );
    });
  });

  describe('codigoDoMotivoTecnico', () => {
    it('recupera o código gravado no motivo técnico', () => {
      const motivo = motivoTecnico('Execução recusada', { motivo: 'CAPACIDADE_ESGOTADA', mensagem: 'Fila [x] cheia' });
      expect(codigoDoMotivoTecnico(motivo)).toBe('CAPACIDADE_ESGOTADA');
    });

    it.each([null, 'Motivo sem código'])('%s → null', (motivo) => {
      expect(codigoDoMotivoTecnico(motivo)).toBeNull();
    });
  });
});
