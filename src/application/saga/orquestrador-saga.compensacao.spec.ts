import { Logger } from '@nestjs/common';

import { Cenario, criarCenario } from '../../../test/fakes/cenario';
import { StatusOS } from '../../domain/ordem-de-servico/StatusOS';
import { EtapaSaga } from '../../domain/saga/SagaInstance';
import { OrquestradorSaga } from './orquestrador-saga';
import {
  contexto,
  criarOrquestrador,
  forcarEtapa,
  incluirItens,
  INSUMO,
  osAberta,
  SERVICO,
  versoes,
} from '../../../test/fakes/saga';

describe('OrquestradorSaga — compensações (antes do pivô)', () => {
  let c: Cenario;
  let orq: OrquestradorSaga;
  let osId: string;
  let warn: jest.SpyInstance;

  const status = async () => (await c.ordens.buscarPorId(osId))!.status;
  const etapa = async () => (await c.sagas.buscar(osId))!.etapa;
  const ultimoMotivo = async () => (await c.ordens.historico(osId)).at(-1)?.motivo;

  beforeEach(async () => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    c = criarCenario();
    orq = criarOrquestrador(c);
    osId = await osAberta(c);
    await orq.diagnosticoIniciado(contexto(osId));
    await incluirItens(c, osId, [SERVICO, INSUMO]);
    await orq.diagnosticoConcluido(contexto(osId));
    await orq.orcamentoEnviado(contexto(osId), { valorTotal: 321, validoAte: '2026-10-20T12:00:00.000Z' });
    await orq.orcamentoAprovado(contexto(osId));
    c.outbox.enviadas = [];
  });

  afterEach(() => warn.mockRestore());

  it('reserva-insumos-falhou: cancela o orçamento com motivo amigável; o histórico guarda o detalhe técnico', async () => {
    const ctx = contexto(osId);
    await orq.reservaFalhou(ctx, { motivo: 'ESTOQUE_INSUFICIENTE', mensagem: 'Sem estoque de Filtro de óleo' });
    expect(await etapa()).toBe(EtapaSaga.COMPENSANDO_ORCAMENTO);
    expect(await status()).toBe(StatusOS.APROVADA);
    expect((await c.sagas.buscar(osId))!.motivoCompensacao).toBe(
      'Reserva de insumos falhou [ESTOQUE_INSUFICIENTE]: Sem estoque de Filtro de óleo',
    );
    expect(c.outbox.enviadas.map((m) => [m.destino, m.envelope.type, m.envelope.payload])).toEqual([
      ['fila-billing', 'billing.cancelar-orcamento.v1', { motivo: 'Não há estoque suficiente para as peças do orçamento' }],
    ]);
    expect(c.outbox.ultima().envelope.causationId).toBe(ctx.messageId);

    await orq.orcamentoCancelado(contexto(osId));
    expect(await status()).toBe(StatusOS.CANCELADA);
    expect(await etapa()).toBe(EtapaSaga.COMPENSADA);
    expect(await ultimoMotivo()).toBe('Reserva de insumos falhou [ESTOQUE_INSUFICIENTE]: Sem estoque de Filtro de óleo');
  });

  it('execucao-recusada: libera reservas, depois cancela o orçamento, depois CANCELADA (E6)', async () => {
    await orq.insumosReservados(contexto(osId));
    c.outbox.enviadas = [];

    const recusa = contexto(osId);
    await orq.execucaoRecusada(recusa, { motivo: 'CAPACIDADE_ESGOTADA', mensagem: 'Fila de execução cheia' });
    expect(await etapa()).toBe(EtapaSaga.COMPENSANDO_RESERVAS);
    expect(c.outbox.tipos()).toEqual(['catalog.liberar-reservas.v1']);
    expect(c.outbox.ultima().envelope.causationId).toBe(recusa.messageId);

    const liberadas = contexto(osId);
    await orq.reservasLiberadas(liberadas);
    expect(await etapa()).toBe(EtapaSaga.COMPENSANDO_ORCAMENTO);
    expect(c.outbox.tipos()).toEqual(['catalog.liberar-reservas.v1', 'billing.cancelar-orcamento.v1']);
    expect(c.outbox.ultima().envelope.payload).toEqual({ motivo: 'A oficina está sem capacidade de execução no momento' });
    expect(c.outbox.ultima().envelope.causationId).toBe(liberadas.messageId);

    await orq.orcamentoCancelado(contexto(osId));
    expect(await status()).toBe(StatusOS.CANCELADA);
    expect(await etapa()).toBe(EtapaSaga.COMPENSADA);
    expect(await ultimoMotivo()).toBe('Execução recusada [CAPACIDADE_ESGOTADA]: Fila de execução cheia');
  });

  it('código sem texto próprio: cliente recebe o texto genérico; o detalhe técnico usa o código', async () => {
    await orq.reservaFalhou(contexto(osId), { motivo: 'INSUMO_NAO_ENCONTRADO' });
    expect(c.outbox.ultima().envelope.payload).toEqual({ motivo: 'Não foi possível seguir com o serviço' });
    expect((await c.sagas.buscar(osId))!.motivoCompensacao).toBe('Reserva de insumos falhou [INSUMO_NAO_ENCONTRADO]');
  });

  it('insumos-reservados atrasado com a saga compensada → liberar-reservas e warn, sem mudar estado', async () => {
    await orq.reservaFalhou(contexto(osId), { motivo: 'ESTOQUE_INSUFICIENTE' });
    await orq.orcamentoCancelado(contexto(osId));
    c.outbox.enviadas = [];
    const ctx = contexto(osId, 'catalog.insumos-reservados.v1');

    await orq.insumosReservados(ctx);
    expect(c.outbox.tipos()).toEqual(['catalog.liberar-reservas.v1']);
    expect(c.outbox.ultima().envelope.causationId).toBe(ctx.messageId);
    expect(await status()).toBe(StatusOS.CANCELADA);
    expect(await etapa()).toBe(EtapaSaga.COMPENSADA);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'catalog.insumos-reservados.v1',
        messageId: ctx.messageId,
        osId,
        etapa: EtapaSaga.COMPENSADA,
      }),
    );
  });

  it.each([EtapaSaga.ENCERRADA, EtapaSaga.COMPENSADA])(
    'insumos-reservados atrasado em %s (antes do pivô) → liberar-reservas',
    async (etapaAtual) => {
      await forcarEtapa(c, osId, etapaAtual);
      await orq.insumosReservados(contexto(osId));
      expect(c.outbox.tipos()).toEqual(['catalog.liberar-reservas.v1']);
      expect(await etapa()).toBe(etapaAtual);
    },
  );

  it.each([
    EtapaSaga.CONCLUIDA,
    EtapaSaga.COMPENSANDO_RESERVAS,
    EtapaSaga.COMPENSANDO_ORCAMENTO,
    EtapaSaga.EXECUCAO,
    EtapaSaga.COBRANCA,
  ])('insumos-reservados atrasado em %s é ignorado (não libera reservas)', async (etapaAtual) => {
    await forcarEtapa(c, osId, etapaAtual);
    const antes = await versoes(c, osId);
    const ctx = contexto(osId);

    await orq.insumosReservados(ctx);

    expect(c.outbox.enviadas).toEqual([]);
    expect(await versoes(c, osId)).toEqual(antes);
    expect(c.processadas.ids.has(ctx.messageId)).toBe(true);
  });

  it('reservas-liberadas e orcamento-cancelado fora da compensação são ignorados', async () => {
    await orq.reservasLiberadas(contexto(osId));
    await orq.orcamentoCancelado(contexto(osId));
    expect(await status()).toBe(StatusOS.APROVADA);
    expect(await etapa()).toBe(EtapaSaga.RESERVA);
    expect(c.outbox.enviadas).toEqual([]);
  });

  it('recusa da execução depois do pivô é ignorada (não há rollback pós-pivô)', async () => {
    await orq.insumosReservados(contexto(osId));
    await orq.execucaoAceita(contexto(osId));
    c.outbox.enviadas = [];
    await orq.execucaoRecusada(contexto(osId), { motivo: 'CAPACIDADE_ESGOTADA' });
    expect(await etapa()).toBe(EtapaSaga.EXECUCAO);
    expect(c.outbox.enviadas).toEqual([]);
  });

  it('falha no meio desfaz tudo (transação) e a mensagem pode ser reprocessada', async () => {
    const salvar = jest.spyOn(c.sagas, 'salvar').mockRejectedValueOnce(new Error('banco fora'));
    const ctx = contexto(osId);
    await expect(orq.reservaFalhou(ctx, { motivo: 'ESTOQUE_INSUFICIENTE' })).rejects.toThrow('banco fora');
    expect(await status()).toBe(StatusOS.APROVADA);
    expect(c.outbox.enviadas).toEqual([]);
    expect(c.processadas.ids.has(ctx.messageId)).toBe(false);

    salvar.mockRestore();
    await orq.reservaFalhou(ctx, { motivo: 'ESTOQUE_INSUFICIENTE' });
    expect(await etapa()).toBe(EtapaSaga.COMPENSANDO_ORCAMENTO);
  });
});
