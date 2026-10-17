import { EtapaSaga, SagaInstance } from './SagaInstance';

const OS_ID = '55555555-5555-4555-8555-555555555555';

describe('SagaInstance', () => {
  it('inicia no diagnóstico, versão 0, sem código nem motivo', () => {
    const saga = SagaInstance.iniciar(OS_ID);
    expect(saga.osId).toBe(OS_ID);
    expect(saga.etapa).toBe(EtapaSaga.DIAGNOSTICO);
    expect(saga.versao).toBe(0);
    expect(saga.motivoCompensacao).toBeNull();
    expect(saga.codigoCompensacao).toBeNull();
    expect(saga.pivoAtingido).toBe(false);
  });

  it('percorre o caminho feliz até CONCLUIDA', () => {
    const saga = SagaInstance.iniciar(OS_ID);
    [
      EtapaSaga.ORCAMENTO,
      EtapaSaga.RESERVA,
      EtapaSaga.EXECUCAO_SOLICITADA,
      EtapaSaga.EXECUCAO,
      EtapaSaga.COBRANCA,
      EtapaSaga.CONCLUIDA,
    ].forEach((etapa) => saga.avancar(etapa));
    expect(saga.etapa).toBe(EtapaSaga.CONCLUIDA);
    expect(saga.terminada).toBe(true);
    expect(saga.pivoAtingido).toBe(true);
  });

  it('encerra na reprovação', () => {
    const saga = SagaInstance.iniciar(OS_ID);
    saga.avancar(EtapaSaga.ORCAMENTO);
    saga.avancar(EtapaSaga.ENCERRADA);
    expect(saga.terminada).toBe(true);
  });

  it('compensa a recusa da execução em duas etapas, guardando código e motivo', () => {
    const saga = SagaInstance.iniciar(OS_ID);
    saga.avancar(EtapaSaga.ORCAMENTO);
    saga.avancar(EtapaSaga.RESERVA);
    saga.avancar(EtapaSaga.EXECUCAO_SOLICITADA);
    saga.compensar(EtapaSaga.COMPENSANDO_RESERVAS, 'CAPACIDADE_ESGOTADA', 'Fila de execução cheia');
    saga.avancar(EtapaSaga.COMPENSANDO_ORCAMENTO);
    saga.avancar(EtapaSaga.COMPENSADA);
    expect(saga.motivoCompensacao).toBe('Fila de execução cheia');
    expect(saga.codigoCompensacao).toBe('CAPACIDADE_ESGOTADA');
    expect(saga.terminada).toBe(true);
    expect(saga.pivoAtingido).toBe(false);
  });

  it('compensa a falha de reserva direto pelo orçamento', () => {
    const saga = SagaInstance.iniciar(OS_ID);
    saga.avancar(EtapaSaga.ORCAMENTO);
    saga.avancar(EtapaSaga.RESERVA);
    saga.compensar(EtapaSaga.COMPENSANDO_ORCAMENTO, 'ESTOQUE_INSUFICIENTE', 'Sem estoque');
    expect(saga.em(EtapaSaga.COMPENSANDO_ORCAMENTO)).toBe(true);
  });

  it.each([
    [EtapaSaga.DIAGNOSTICO, EtapaSaga.RESERVA],
    [EtapaSaga.EXECUCAO, EtapaSaga.COMPENSANDO_RESERVAS],
    [EtapaSaga.CONCLUIDA, EtapaSaga.DIAGNOSTICO],
  ])('recusa %s → %s', (de, para) => {
    const saga = SagaInstance.restaurar({ osId: OS_ID, etapa: de, codigoCompensacao: null, motivoCompensacao: null, versao: 1 });
    expect(() => saga.avancar(para)).toThrow(expect.objectContaining({ code: 'SAGA_TRANSICAO_INVALIDA' }));
  });

  it('compensar só aceita etapas de compensação', () => {
    const saga = SagaInstance.restaurar({
      osId: OS_ID,
      etapa: EtapaSaga.RESERVA,
      codigoCompensacao: null,
      motivoCompensacao: null,
      versao: 2,
    });
    expect(() => saga.compensar(EtapaSaga.EXECUCAO_SOLICITADA, 'X', 'x')).toThrow(
      expect.objectContaining({ code: 'SAGA_COMPENSACAO_INVALIDA' }),
    );
  });

  it('iniciar recusa osId que não é UUID', () => {
    expect(() => SagaInstance.iniciar('os-1')).toThrow(expect.objectContaining({ code: 'INVALID_ID' }));
  });

  it.each([
    [EtapaSaga.RESERVA, EtapaSaga.COMPENSANDO_ORCAMENTO],
    [EtapaSaga.EXECUCAO_SOLICITADA, EtapaSaga.COMPENSANDO_RESERVAS],
  ])('avancar recusa entrar em compensação sem motivo (%s → %s)', (de, para) => {
    const saga = SagaInstance.restaurar({ osId: OS_ID, etapa: de, codigoCompensacao: null, motivoCompensacao: null, versao: 1 });
    expect(() => saga.avancar(para)).toThrow(
      expect.objectContaining({ code: 'SAGA_COMPENSACAO_SEM_MOTIVO' }),
    );
    expect(saga.etapa).toBe(de);
  });

  it('avancar segue de COMPENSANDO_RESERVAS para COMPENSANDO_ORCAMENTO', () => {
    const saga = SagaInstance.restaurar({
      osId: OS_ID,
      etapa: EtapaSaga.COMPENSANDO_RESERVAS,
      codigoCompensacao: 'CAPACIDADE_ESGOTADA',
      motivoCompensacao: 'Fila cheia',
      versao: 3,
    });
    saga.avancar(EtapaSaga.COMPENSANDO_ORCAMENTO);
    expect(saga.etapa).toBe(EtapaSaga.COMPENSANDO_ORCAMENTO);
    expect(saga.motivoCompensacao).toBe('Fila cheia');
    expect(saga.codigoCompensacao).toBe('CAPACIDADE_ESGOTADA');
  });

  it('em() aceita várias etapas', () => {
    const saga = SagaInstance.iniciar(OS_ID);
    expect(saga.em(EtapaSaga.ORCAMENTO, EtapaSaga.DIAGNOSTICO)).toBe(true);
    expect(saga.em(EtapaSaga.ORCAMENTO)).toBe(false);
  });
});
