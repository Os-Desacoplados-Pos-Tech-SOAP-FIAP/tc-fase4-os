import { DestinosComandos } from '../../src/application/ports/destinos-comandos';
import { Cliente, TipoCliente } from '../../src/domain/cliente/entities/Cliente';
import { Veiculo } from '../../src/domain/veiculo/entities/Veiculo';
import { CatalogoEmMemoria } from './catalogo-em-memoria';
import { FakeSagaMetricas } from './fake-saga-metricas';
import { FakeTransactionManager } from './fake-transaction.manager';
import { FakeTravaPorOs } from './fake-trava-por-os';
import { InMemoryClienteRepository } from './in-memory-cliente.repository';
import { InMemoryOrdemDeServicoRepository } from './in-memory-ordem-de-servico.repository';
import { InMemoryOutbox } from './in-memory-outbox';
import { InMemoryProcessedMessageRepository } from './in-memory-processed-message.repository';
import { InMemorySagaRepository } from './in-memory-saga.repository';
import { InMemoryVeiculoRepository } from './in-memory-veiculo.repository';

export const DESTINOS: DestinosComandos = {
  catalog: 'fila-catalog',
  billing: 'fila-billing',
  execution: 'fila-execution',
};

export const TOKEN = 'Bearer token-do-usuario';

/** Todos os fakes; os que participam da transação falsa são desfeitos juntos em caso de erro. */
export function criarCenario() {
  const ordens = new InMemoryOrdemDeServicoRepository();
  const sagas = new InMemorySagaRepository();
  const processadas = new InMemoryProcessedMessageRepository();
  const outbox = new InMemoryOutbox();
  const clientes = new InMemoryClienteRepository();
  const veiculos = new InMemoryVeiculoRepository();
  const catalogo = new CatalogoEmMemoria();
  const transacao = new FakeTransactionManager().participar(ordens, sagas, processadas, outbox);
  const trava = new FakeTravaPorOs(transacao);
  const metricas = new FakeSagaMetricas();

  async function clienteComVeiculoDe(
    documento: string,
    placa: string,
  ): Promise<{ cliente: Cliente; veiculo: Veiculo }> {
    const cliente = Cliente.criar({
      tipo: TipoCliente.PF,
      documento,
      nome: 'Maria Souza',
      email: 'maria@example.com',
    });
    await clientes.salvar(cliente);
    const veiculo = Veiculo.criar({
      placa,
      marca: 'Fiat',
      modelo: 'Argo',
      ano: 2022,
      clienteId: cliente.id.toValue(),
    });
    await veiculos.salvar(veiculo);
    return { cliente, veiculo };
  }

  const clienteComVeiculo = () => clienteComVeiculoDe('529.982.247-25', 'ABC1D23');

  return {
    ordens,
    sagas,
    processadas,
    outbox,
    clientes,
    veiculos,
    trava,
    catalogo,
    transacao,
    metricas,
    clienteComVeiculo,
    clienteComVeiculoDe,
  };
}

export type Cenario = ReturnType<typeof criarCenario>;
