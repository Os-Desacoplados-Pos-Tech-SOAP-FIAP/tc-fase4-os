import { EtapaSaga, SagaInstance } from './SagaInstance';

const OS_ID = '55555555-5555-4555-8555-555555555555';

describe('SagaInstance', () => {
  it('inicia no diagnóstico, versão 0, sem motivo', () => {
    const saga = SagaInstance.iniciar(OS_ID);
    expect(saga.osId).toBe(OS_ID);
    expect(saga.etapa).toBe(EtapaSaga.DIAGNOSTICO);
    expect(saga.versao).toBe(0);
    expect(saga.motivoCompensacao).toBeNull();
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

  it('compensa a recusa da execução em duas etapas, guardando o motivo', () => {
    const saga = SagaInstance.iniciar(OS_ID);
    saga.avancar(EtapaSaga.ORCAMENTO);
    saga.avancar(EtapaSaga.RESERVA);
    saga.avancar(EtapaSaga.EXECUCAO_SOLICITADA);
    saga.compensar(EtapaSaga.COMPENSANDO_RESERVAS, 'Fila de execução cheia');
    saga.avancar(EtapaSaga.COMPENSANDO_ORCAMENTO);
    saga.avancar(EtapaSaga.COMPENSADA);
    expect(saga.motivoCompensacao).toBe('Fila de execução cheia');
    expect(saga.terminada).toBe(true);
    expect(saga.pivoAtingido).toBe(false);
  });

  it('compensa a falha de reserva direto pelo orçamento', () => {
    const saga = SagaInstance.iniciar(OS_ID);
    saga.avancar(EtapaSaga.ORCAMENTO);
    saga.avancar(EtapaSaga.RESERVA);
    saga.compensar(EtapaSaga.COMPENSANDO_ORCAMENTO, 'Sem estoque');
    expect(saga.em(EtapaSaga.COMPENSANDO_ORCAMENTO)).toBe(true);
  });

  it.each([
    [EtapaSaga.DIAGNOSTICO, EtapaSaga.RESERVA],
    [EtapaSaga.EXECUCAO, EtapaSaga.COMPENSANDO_RESERVAS],
    [EtapaSaga.CONCLUIDA, EtapaSaga.DIAGNOSTICO],
  ])('recusa %s → %s', (de, para) => {
    const saga = SagaInstance.restaurar({ osId: OS_ID, etapa: de, motivoCompensacao: null, versao: 1 });
    expect(() => saga.avancar(para)).toThrow(expect.objectContaining({ code: 'SAGA_TRANSICAO_INVALIDA' }));
  });

  it('compensar só aceita etapas de compensação', () => {
    const saga = SagaInstance.restaurar({
      osId: OS_ID,
      etapa: EtapaSaga.RESERVA,
      motivoCompensacao: null,
      versao: 2,
    });
    expect(() => saga.compensar(EtapaSaga.EXECUCAO_SOLICITADA, 'x')).toThrow(
      expect.objectContaining({ code: 'SAGA_COMPENSACAO_INVALIDA' }),
    );
  });

  it('em() aceita várias etapas', () => {
    const saga = SagaInstance.iniciar(OS_ID);
    expect(saga.em(EtapaSaga.ORCAMENTO, EtapaSaga.DIAGNOSTICO)).toBe(true);
    expect(saga.em(EtapaSaga.ORCAMENTO)).toBe(false);
  });
});
