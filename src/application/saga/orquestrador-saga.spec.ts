import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';

import { INSUMO_FILTRO } from '../../../test/fakes/catalogo-em-memoria';
import { Cenario, criarCenario } from '../../../test/fakes/cenario';
import { contexto, criarOrquestrador, incluirItens, INSUMO, osAberta, SERVICO, versoes } from '../../../test/fakes/saga';
import { NovoItemOrcamento } from '../../domain/ordem-de-servico/entities/ItemOrcamento';
import { OrdemDeServico } from '../../domain/ordem-de-servico/entities/OrdemDeServico';
import { StatusOS } from '../../domain/ordem-de-servico/StatusOS';
import { EtapaSaga } from '../../domain/saga/SagaInstance';
import { RecursoNaoEncontradoError } from '../errors';
import { OrquestradorSaga } from './orquestrador-saga';

describe('OrquestradorSaga — diagnóstico e orçamento', () => {
  let c: Cenario;
  let orq: OrquestradorSaga;
  let osId: string;
  let warn: jest.SpyInstance;

  const status = async () => (await c.ordens.buscarPorId(osId))!.status;
  const etapa = async () => (await c.sagas.buscar(osId))!.etapa;

  beforeEach(async () => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    c = criarCenario();
    orq = criarOrquestrador(c);
    osId = await osAberta(c);
    c.outbox.enviadas = [];
  });

  afterEach(() => warn.mockRestore());

  describe('diagnostico-iniciado', () => {
    it('leva a OS para EM_DIAGNOSTICO travando a OS', async () => {
      await orq.diagnosticoIniciado(contexto(osId));
      expect(await status()).toBe(StatusOS.EM_DIAGNOSTICO);
      expect(c.trava.travadas).toEqual([osId]);
      expect(c.outbox.enviadas).toEqual([]);
    });

    it('repetido (reabertura) não grava OS nem saga, não gera histórico e não loga warn', async () => {
      await orq.diagnosticoIniciado(contexto(osId));
      const antes = await versoes(c, osId);
      const ctx = contexto(osId);

      await orq.diagnosticoIniciado(ctx);

      expect(await status()).toBe(StatusOS.EM_DIAGNOSTICO);
      expect(await c.ordens.historico(osId)).toHaveLength(2);
      expect(await versoes(c, osId)).toEqual(antes);
      expect(c.processadas.ids.has(ctx.messageId)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });

    it('mesma mensagem duas vezes é processada uma vez só', async () => {
      const ctx = contexto(osId);
      await orq.diagnosticoIniciado(ctx);
      await orq.diagnosticoIniciado(ctx);
      expect(c.trava.travadas).toEqual([osId]);
    });

    it('OS inexistente → erro (retentativa e DLQ)', async () => {
      await expect(orq.diagnosticoIniciado(contexto(randomUUID()))).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
      expect(c.processadas.ids.size).toBe(0);
    });

    it('saga inexistente → erro (retentativa e DLQ)', async () => {
      const { cliente, veiculo } = await c.clienteComVeiculoDe('111.444.777-35', 'XYZ9A87');
      const semSaga = OrdemDeServico.abrir({
        numero: await c.ordens.proximoNumero(),
        clienteId: cliente.id.toValue(),
        veiculoId: veiculo.id.toValue(),
      });
      await c.ordens.salvar(semSaga);

      await expect(orq.diagnosticoIniciado(contexto(semSaga.id.toValue()))).rejects.toBeInstanceOf(
        RecursoNaoEncontradoError,
      );
      expect(c.processadas.ids.size).toBe(0);
    });
  });

  describe('diagnostico-concluido', () => {
    beforeEach(() => orq.diagnosticoIniciado(contexto(osId)));

    it('orçamento válido: pede gerar-orcamento ao Billing com cliente e itens e avança a saga', async () => {
      await incluirItens(c, osId, [SERVICO, INSUMO]);
      const ctx = contexto(osId);
      await orq.diagnosticoConcluido(ctx);

      expect(await etapa()).toBe(EtapaSaga.ORCAMENTO);
      expect(c.outbox.enviadas).toHaveLength(1);
      const { destino, envelope } = c.outbox.ultima();
      expect(destino).toBe('fila-billing');
      expect(envelope).toEqual(
        expect.objectContaining({ type: 'billing.gerar-orcamento.v1', correlationId: osId, causationId: ctx.messageId }),
      );
      expect(envelope.payload).toEqual(
        expect.objectContaining({
          cliente: { nome: 'Maria Souza', email: 'maria@example.com' },
          itens: [
            expect.objectContaining({ tipo: 'SERVICO', valorUnitario: 250, quantidade: 1 }),
            expect.objectContaining({ tipo: 'INSUMO', valorUnitario: 35.5, quantidade: 2 }),
          ],
        }),
      );
    });

    it.each<[string, NovoItemOrcamento[], string]>([
      ['sem itens', [], 'Nenhum item registrado no diagnóstico'],
      ['sem serviço', [INSUMO], 'O orçamento precisa de ao menos um serviço'],
      ['total zero', [{ ...SERVICO, valorUnitario: 0 }], 'Orçamento sem valor a cobrar'],
    ])('%s: reabre o diagnóstico no Execution e registra o motivo (E5)', async (_caso, itens, motivo) => {
      await incluirItens(c, osId, itens);
      await orq.diagnosticoConcluido(contexto(osId));

      expect(await etapa()).toBe(EtapaSaga.DIAGNOSTICO);
      expect(await status()).toBe(StatusOS.EM_DIAGNOSTICO);
      expect(c.outbox.tipos()).toEqual(['execution.reabrir-diagnostico.v1']);
      expect(c.outbox.ultima().destino).toBe('fila-execution');
      expect((await c.ordens.historico(osId)).at(-1)?.motivo).toBe(`Diagnóstico reaberto: ${motivo}`);
    });

    it('fora da etapa DIAGNOSTICO é ignorado', async () => {
      await incluirItens(c, osId, [SERVICO]);
      await orq.diagnosticoConcluido(contexto(osId));
      c.outbox.enviadas = [];
      await orq.diagnosticoConcluido(contexto(osId));
      expect(c.outbox.enviadas).toEqual([]);
      expect(await etapa()).toBe(EtapaSaga.ORCAMENTO);
    });
  });

  describe('orçamento enviado e decisão do cliente', () => {
    const enviado = { valorTotal: 321, validoAte: '2026-10-20T12:00:00.000Z' };

    beforeEach(async () => {
      await orq.diagnosticoIniciado(contexto(osId));
      await incluirItens(c, osId, [SERVICO, INSUMO]);
      await orq.diagnosticoConcluido(contexto(osId));
      c.outbox.enviadas = [];
    });

    it('orcamento-enviado: AGUARDANDO_APROVACAO com valor e validade; repetido não grava nem loga warn', async () => {
      await orq.orcamentoEnviado(contexto(osId), enviado);
      const antes = await versoes(c, osId);
      const ctx = contexto(osId);

      await orq.orcamentoEnviado(ctx, enviado);

      const os = (await c.ordens.buscarPorId(osId))!;
      expect(os.status).toBe(StatusOS.AGUARDANDO_APROVACAO);
      expect(os.orcamento).toEqual({ valor: 321, validoAte: new Date(enviado.validoAte) });
      expect((await c.ordens.historico(osId)).filter((r) => r.para === StatusOS.AGUARDANDO_APROVACAO)).toHaveLength(1);
      expect(await versoes(c, osId)).toEqual(antes);
      expect(c.processadas.ids.has(ctx.messageId)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });

    it('orcamento-aprovado: APROVADA, saga RESERVA e reservar-insumos só com os insumos', async () => {
      await orq.orcamentoEnviado(contexto(osId), enviado);
      await orq.orcamentoAprovado(contexto(osId));
      expect(await status()).toBe(StatusOS.APROVADA);
      expect(await etapa()).toBe(EtapaSaga.RESERVA);
      expect(c.outbox.ultima().destino).toBe('fila-catalog');
      expect(c.outbox.ultima().envelope).toEqual(
        expect.objectContaining({
          type: 'catalog.reservar-insumos.v1',
          payload: { itens: [{ insumoId: INSUMO_FILTRO, quantidade: 2 }] },
        }),
      );
    });

    it('orcamento-reprovado/expirado: REPROVADA com o motivo e saga ENCERRADA', async () => {
      await orq.orcamentoEnviado(contexto(osId), enviado);
      await orq.orcamentoReprovado(contexto(osId), 'Orçamento expirado sem resposta do cliente');
      expect(await status()).toBe(StatusOS.REPROVADA);
      expect(await etapa()).toBe(EtapaSaga.ENCERRADA);
      expect((await c.ordens.historico(osId)).at(-1)?.motivo).toBe('Orçamento expirado sem resposta do cliente');
      expect(c.outbox.enviadas).toEqual([]);
    });

    it('aprovação antes do envio registrado é ignorada: não grava, registra a mensagem e loga warn', async () => {
      const antes = await versoes(c, osId);
      const ctx = contexto(osId, 'billing.orcamento-aprovado.v1');

      await orq.orcamentoAprovado(ctx);

      expect(await status()).toBe(StatusOS.EM_DIAGNOSTICO);
      expect(await etapa()).toBe(EtapaSaga.ORCAMENTO);
      expect(await versoes(c, osId)).toEqual(antes);
      expect(c.outbox.enviadas).toEqual([]);
      expect(c.processadas.ids.has(ctx.messageId)).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'billing.orcamento-aprovado.v1', messageId: ctx.messageId, osId }),
      );
    });

    it('reprovação fora de AGUARDANDO_APROVACAO é ignorada', async () => {
      const antes = await versoes(c, osId);

      await orq.orcamentoReprovado(contexto(osId), 'Cliente recusou');

      expect(await status()).toBe(StatusOS.EM_DIAGNOSTICO);
      expect(await etapa()).toBe(EtapaSaga.ORCAMENTO);
      expect(await versoes(c, osId)).toEqual(antes);
    });
  });
});
