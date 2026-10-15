import { Cenario, criarCenario, DESTINOS } from '../../../test/fakes/cenario';
import { StatusOS } from '../../domain/ordem-de-servico/StatusOS';
import { RecursoNaoEncontradoError } from '../errors';
import { AbrirOrdemDeServicoUseCase } from './abrir-ordem/AbrirOrdemDeServicoUseCase';
import { EntregarVeiculoUseCase } from './entregar-veiculo/EntregarVeiculoUseCase';
import { ConsultarStatusPublicoUseCase } from './status-publico/ConsultarStatusPublicoUseCase';
import { TipoItemOrcamento } from '../../domain/ordem-de-servico/entities/ItemOrcamento';
import { SERVICO_REVISAO } from '../../../test/fakes/catalogo-em-memoria';

describe('entrega e status público', () => {
  let c: Cenario;
  let osId: string;
  let clienteId: string;
  let numero: number;

  beforeEach(async () => {
    c = criarCenario();
    const { cliente, veiculo } = await c.clienteComVeiculo();
    clienteId = cliente.id.toValue();
    const abrir = new AbrirOrdemDeServicoUseCase(c.transacao, c.ordens, c.sagas, c.clientes, c.veiculos, c.outbox, DESTINOS);
    const { os } = await abrir.execute({ clienteId, veiculoId: veiculo.id.toValue() });
    osId = os.id.toValue();
    numero = os.numero;
  });

  async function levarAtePaga(): Promise<void> {
    const os = (await c.ordens.buscarPorId(osId))!;
    os.iniciarDiagnostico();
    os.adicionarItem({ tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO_REVISAO, descricao: 'Revisão', quantidade: 1, valorUnitario: 250 });
    os.registrarOrcamentoEnviado(250, new Date());
    os.aprovarOrcamento();
    os.iniciarExecucao();
    os.finalizarExecucao();
    os.confirmarPagamento();
    await c.ordens.salvar(os);
  }

  it('entrega a OS paga, travando a OS', async () => {
    await levarAtePaga();
    const os = await new EntregarVeiculoUseCase(c.transacao, c.trava, c.ordens).execute(osId);
    expect(os.status).toBe(StatusOS.ENTREGUE);
    expect(c.trava.travadas).toEqual([osId]);
  });

  it('não entrega antes de PAGA', async () => {
    await expect(new EntregarVeiculoUseCase(c.transacao, c.trava, c.ordens).execute(osId)).rejects.toEqual(
      expect.objectContaining({ code: 'OS_TRANSICAO_INVALIDA' }),
    );
  });

  it('status público só para o dono da OS', async () => {
    const consultar = new ConsultarStatusPublicoUseCase(c.ordens);
    expect(await consultar.execute(numero, clienteId)).toEqual({
      numero,
      status: StatusOS.RECEBIDA,
      valorTotal: 0,
      atualizadoEm: expect.any(Date),
    });
    await expect(consultar.execute(numero, '99999999-9999-4999-8999-999999999999')).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
    await expect(consultar.execute(999, clienteId)).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });
});
