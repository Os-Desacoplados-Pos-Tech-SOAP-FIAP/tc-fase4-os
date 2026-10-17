import { Cenario, criarCenario, DESTINOS } from '../../../../test/fakes/cenario';
import { StatusOS } from '../../../domain/ordem-de-servico/StatusOS';
import { EtapaSaga } from '../../../domain/saga/SagaInstance';
import { RecursoNaoEncontradoError } from '../../errors';
import { AbrirOrdemDeServicoUseCase } from './AbrirOrdemDeServicoUseCase';

describe('AbrirOrdemDeServicoUseCase', () => {
  let c: Cenario;
  let useCase: AbrirOrdemDeServicoUseCase;

  beforeEach(() => {
    c = criarCenario();
    useCase = new AbrirOrdemDeServicoUseCase(c.transacao, c.ordens, c.sagas, c.clientes, c.veiculos, c.outbox, DESTINOS);
  });

  it('abre RECEBIDA, inicia a saga e pede o diagnóstico ao Execution na mesma transação', async () => {
    const { cliente, veiculo } = await c.clienteComVeiculo();
    const { os, saga } = await useCase.execute({
      clienteId: cliente.id.toValue(),
      veiculoId: veiculo.id.toValue(),
      observacoes: 'Barulho na suspensão',
    });

    expect(os.status).toBe(StatusOS.RECEBIDA);
    expect(os.numero).toBe(1);
    expect(saga.etapa).toBe(EtapaSaga.DIAGNOSTICO);
    expect(await c.ordens.buscarPorId(os.id.toValue())).not.toBeNull();
    expect((await c.sagas.buscar(os.id.toValue()))?.etapa).toBe(EtapaSaga.DIAGNOSTICO);
    expect(c.outbox.enviadas).toEqual([
      {
        destino: 'fila-execution',
        envelope: expect.objectContaining({
          type: 'execution.enfileirar-diagnostico.v1',
          correlationId: os.id.toValue(),
          payload: { numeroOs: 1 },
        }),
      },
    ]);
    expect(await c.ordens.historico(os.id.toValue())).toEqual([
      expect.objectContaining({ de: null, para: StatusOS.RECEBIDA }),
    ]);
  });

  it('cliente ou veículo inexistente → 404', async () => {
    const { cliente, veiculo } = await c.clienteComVeiculo();
    const outro = '99999999-9999-4999-8999-999999999999';
    await expect(useCase.execute({ clienteId: outro, veiculoId: veiculo.id.toValue() })).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
    await expect(useCase.execute({ clienteId: cliente.id.toValue(), veiculoId: outro })).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
    expect(c.outbox.enviadas).toEqual([]);
  });

  it('veículo de outro cliente → 422', async () => {
    const { veiculo } = await c.clienteComVeiculo();
    const segundo = await c.clienteComVeiculoDe('111.444.777-35', 'XYZ9A87');
    await expect(
      useCase.execute({ clienteId: segundo.cliente.id.toValue(), veiculoId: veiculo.id.toValue() }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VEICULO_NAO_PERTENCE_AO_CLIENTE' }));
  });
});
