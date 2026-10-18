import { Cenario, criarCenario, DESTINOS } from '../../../test/fakes/cenario';
import { StatusOS } from '../../domain/ordem-de-servico/StatusOS';
import { EtapaSaga } from '../../domain/saga/SagaInstance';
import { RecursoNaoEncontradoError } from '../errors';
import { AbrirOrdemDeServicoUseCase } from './abrir-ordem/AbrirOrdemDeServicoUseCase';
import { ConsultarOrdemDeServicoUseCase } from './consultar-ordem/ConsultarOrdemDeServicoUseCase';
import { HistoricoDaOrdemUseCase } from './historico/HistoricoDaOrdemUseCase';
import { ListarOrdensDeServicoUseCase } from './listar-ordens/ListarOrdensDeServicoUseCase';

const INEXISTENTE = '99999999-9999-4999-8999-999999999999';

describe('consultas de OS', () => {
  let c: Cenario;
  let osId: string;

  beforeEach(async () => {
    c = criarCenario();
    const { cliente, veiculo } = await c.clienteComVeiculo();
    const abrir = new AbrirOrdemDeServicoUseCase(c.transacao, c.ordens, c.sagas, c.clientes, c.veiculos, c.outbox, DESTINOS, c.metricas);
    osId = (await abrir.execute({ clienteId: cliente.id.toValue(), veiculoId: veiculo.id.toValue() })).os.id.toValue();
  });

  it('consulta por id e por número, com a etapa da saga', async () => {
    const consultar = new ConsultarOrdemDeServicoUseCase(c.ordens, c.sagas);
    const porId = await consultar.porId(osId);
    expect(porId.saga.etapa).toBe(EtapaSaga.DIAGNOSTICO);
    expect((await consultar.porNumero(porId.os.numero)).os.id.toValue()).toBe(osId);
    await expect(consultar.porId(INEXISTENTE)).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
    await expect(consultar.porNumero(999)).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });

  it('lista com filtro de status', async () => {
    const listar = new ListarOrdensDeServicoUseCase(c.ordens);
    expect(await listar.execute()).toHaveLength(1);
    expect(await listar.execute(StatusOS.RECEBIDA)).toHaveLength(1);
    expect(await listar.execute(StatusOS.PAGA)).toHaveLength(0);
  });

  it('histórico da OS; inexistente → 404', async () => {
    const historico = new HistoricoDaOrdemUseCase(c.ordens);
    expect(await historico.execute(osId)).toEqual([expect.objectContaining({ para: StatusOS.RECEBIDA })]);
    await expect(historico.execute(INEXISTENTE)).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });
});
