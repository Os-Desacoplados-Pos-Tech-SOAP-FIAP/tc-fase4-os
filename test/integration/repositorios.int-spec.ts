import { ConcorrenciaError } from '../../src/application/errors';
import { PerfilAcesso } from '../../src/common/auth/perfil';
import { Usuario } from '../../src/domain/auth/entities/Usuario';
import { Cliente, TipoCliente } from '../../src/domain/cliente/entities/Cliente';
import { TipoItemOrcamento } from '../../src/domain/ordem-de-servico/entities/ItemOrcamento';
import { OrdemDeServico } from '../../src/domain/ordem-de-servico/entities/OrdemDeServico';
import { StatusOS } from '../../src/domain/ordem-de-servico/StatusOS';
import { EtapaSaga, SagaInstance } from '../../src/domain/saga/SagaInstance';
import { UniqueID } from '../../src/domain/shared/UniqueID';
import { Veiculo } from '../../src/domain/veiculo/entities/Veiculo';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { PrismaTransactionManager } from '../../src/infrastructure/database/prisma-transaction.manager';
import { PrismaClienteRepository } from '../../src/infrastructure/repositories/PrismaClienteRepository';
import { PrismaOrdemDeServicoRepository } from '../../src/infrastructure/repositories/PrismaOrdemDeServicoRepository';
import { PrismaSagaRepository } from '../../src/infrastructure/repositories/PrismaSagaRepository';
import { PrismaUsuarioRepository } from '../../src/infrastructure/repositories/PrismaUsuarioRepository';
import { PrismaVeiculoRepository } from '../../src/infrastructure/repositories/PrismaVeiculoRepository';
import { conectar, limparBanco } from '../helpers/database';

const SERVICO = 'a0000000-0000-4000-8000-000000000001';
const INSUMO = 'b0000000-0000-4000-8000-000000000001';

describe('repositórios Prisma', () => {
  let prisma: PrismaService;
  let tm: PrismaTransactionManager;
  let ordens: PrismaOrdemDeServicoRepository;
  let sagas: PrismaSagaRepository;
  let clientes: PrismaClienteRepository;
  let veiculos: PrismaVeiculoRepository;
  let cliente: Cliente;
  let veiculo: Veiculo;

  beforeAll(async () => {
    prisma = await conectar();
    tm = new PrismaTransactionManager(prisma);
    ordens = new PrismaOrdemDeServicoRepository(tm);
    sagas = new PrismaSagaRepository(tm);
    clientes = new PrismaClienteRepository(tm);
    veiculos = new PrismaVeiculoRepository(tm);
  });

  afterAll(() => prisma.$disconnect());

  beforeEach(async () => {
    await limparBanco(prisma);
    cliente = Cliente.criar({ tipo: TipoCliente.PF, documento: '529.982.247-25', nome: 'Maria Souza', email: 'maria@example.com' });
    await clientes.salvar(cliente);
    veiculo = Veiculo.criar({ placa: 'ABC1D23', marca: 'Fiat', modelo: 'Argo', ano: 2022, clienteId: cliente.id.toValue() });
    await veiculos.salvar(veiculo);
  });

  async function novaOs(): Promise<OrdemDeServico> {
    return OrdemDeServico.abrir({
      numero: await ordens.proximoNumero(),
      clienteId: cliente.id.toValue(),
      veiculoId: veiculo.id.toValue(),
      observacoes: 'barulho',
    });
  }

  it('número vem da sequência e cresce', async () => {
    const a = await ordens.proximoNumero();
    const b = await ordens.proximoNumero();
    expect(b).toBe(a + 1);
  });

  it('grava e lê a OS com itens, orçamento e histórico em ordem', async () => {
    const os = await novaOs();
    await ordens.salvar(os);
    expect(os.historicoPendente).toEqual([]);

    const lida = (await ordens.buscarPorId(os.id.toValue()))!;
    lida.iniciarDiagnostico();
    lida.adicionarItem({ tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO, descricao: 'Revisão', quantidade: 1, valorUnitario: 250 });
    lida.adicionarItem({ tipo: TipoItemOrcamento.INSUMO, referenciaId: INSUMO, descricao: 'Filtro', quantidade: 2, valorUnitario: 35.5 });
    lida.registrarOrcamentoEnviado(321, new Date('2026-10-20T12:00:00Z'));
    await ordens.salvar(lida);

    const relida = (await ordens.buscarPorNumero(os.numero))!;
    expect(relida.versao).toBe(2);
    expect(relida.status).toBe(StatusOS.AGUARDANDO_APROVACAO);
    expect(relida.observacoes).toBe('barulho');
    expect(relida.valorTotal).toBe(321);
    expect(relida.itens.map((i) => [i.tipo, i.quantidade, i.valorUnitario])).toEqual([
      [TipoItemOrcamento.SERVICO, 1, 250],
      [TipoItemOrcamento.INSUMO, 2, 35.5],
    ]);
    expect(typeof relida.itens[1].valorUnitario).toBe('number');
    expect(relida.orcamento).toEqual({ valor: 321, validoAte: new Date('2026-10-20T12:00:00Z') });
    expect((await ordens.historico(os.id.toValue())).map((r) => [r.de, r.para])).toEqual([
      [null, StatusOS.RECEBIDA],
      [StatusOS.RECEBIDA, StatusOS.EM_DIAGNOSTICO],
      [StatusOS.EM_DIAGNOSTICO, StatusOS.AGUARDANDO_APROVACAO],
    ]);
  });

  it('grava e relê link de pagamento e motivo do histórico até a cobrança', async () => {
    const os = await novaOs();
    os.iniciarDiagnostico();
    os.adicionarItem({ tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO, descricao: 'Revisão', quantidade: 1, valorUnitario: 250 });
    os.registrarOrcamentoEnviado(250, new Date('2026-10-20T12:00:00Z'));
    os.aprovarOrcamento();
    os.iniciarExecucao();
    os.finalizarExecucao();
    os.registrarCobranca('https://pagamento.example.com/link/123');
    await ordens.salvar(os);

    const relida = (await ordens.buscarPorId(os.id.toValue()))!;
    expect(relida.status).toBe(StatusOS.FINALIZADA);
    expect(relida.linkPagamento).toBe('https://pagamento.example.com/link/123');

    relida.registrarPagamentoRecusado('cartão negado');
    await ordens.salvar(relida);
    expect((await ordens.buscarPorId(os.id.toValue()))!.linkPagamento).toBeNull();

    const historico = await ordens.historico(os.id.toValue());
    expect(historico.map((r) => r.motivo)).toEqual([
      'OS aberta',
      'Diagnóstico iniciado',
      'Orçamento enviado ao cliente',
      'Orçamento aprovado pelo cliente',
      'Reparo iniciado',
      'Execução concluída',
      'Pagamento recusado: cartão negado',
    ]);
    expect(historico.at(-1)).toEqual(
      expect.objectContaining({ de: StatusOS.FINALIZADA, para: StatusOS.FINALIZADA }),
    );
  });

  it('falha na saga dentro de tm.run desfaz a OS gravada antes (status, versão, itens e histórico)', async () => {
    const os = await novaOs();
    await ordens.salvar(os);
    await sagas.salvar(SagaInstance.iniciar(os.id.toValue()));
    const sagaVelha = (await sagas.buscar(os.id.toValue()))!;
    const sagaAtual = (await sagas.buscar(os.id.toValue()))!;
    sagaAtual.avancar(EtapaSaga.ORCAMENTO);
    await sagas.salvar(sagaAtual);

    const lida = (await ordens.buscarPorId(os.id.toValue()))!;
    lida.iniciarDiagnostico();
    lida.adicionarItem({ tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO, descricao: 'Revisão', quantidade: 1, valorUnitario: 250 });
    sagaVelha.avancar(EtapaSaga.ORCAMENTO);

    await expect(
      tm.run(async () => {
        await ordens.salvar(lida);
        await sagas.salvar(sagaVelha);
      }),
    ).rejects.toBeInstanceOf(ConcorrenciaError);

    const depois = (await ordens.buscarPorId(os.id.toValue()))!;
    expect(depois.status).toBe(StatusOS.RECEBIDA);
    expect(depois.versao).toBe(1);
    expect(depois.itens).toEqual([]);
    expect((await ordens.historico(os.id.toValue())).map((r) => r.para)).toEqual([StatusOS.RECEBIDA]);
  });

  it('atualiza quantidade de item já gravado', async () => {
    const os = await novaOs();
    os.iniciarDiagnostico();
    os.adicionarItem({ tipo: TipoItemOrcamento.INSUMO, referenciaId: INSUMO, descricao: 'Filtro', quantidade: 1, valorUnitario: 35.5 });
    await ordens.salvar(os);
    const lida = (await ordens.buscarPorId(os.id.toValue()))!;
    lida.adicionarItem({ tipo: TipoItemOrcamento.INSUMO, referenciaId: INSUMO, descricao: 'Filtro', quantidade: 4, valorUnitario: 35.5 });
    await ordens.salvar(lida);
    expect((await ordens.buscarPorId(os.id.toValue()))!.itens[0].quantidade).toBe(5);
  });

  it('versão divergente lança ConcorrenciaError e não grava histórico', async () => {
    const os = await novaOs();
    await ordens.salvar(os);
    const a = (await ordens.buscarPorId(os.id.toValue()))!;
    const b = (await ordens.buscarPorId(os.id.toValue()))!;
    a.iniciarDiagnostico();
    await ordens.salvar(a);
    b.iniciarDiagnostico();
    await expect(tm.run(() => ordens.salvar(b))).rejects.toBeInstanceOf(ConcorrenciaError);
    expect(await ordens.historico(os.id.toValue())).toHaveLength(2);
  });

  it('lista mais recentes primeiro, com filtro de status', async () => {
    const primeira = await novaOs();
    await ordens.salvar(primeira);
    const segunda = await novaOs();
    segunda.iniciarDiagnostico();
    await ordens.salvar(segunda);
    expect((await ordens.listar({})).map((o) => o.numero)).toEqual([segunda.numero, primeira.numero]);
    expect((await ordens.listar({ status: StatusOS.EM_DIAGNOSTICO })).map((o) => o.numero)).toEqual([segunda.numero]);
  });

  it('saga: grava, avança e confere a versão', async () => {
    const os = await novaOs();
    await ordens.salvar(os);
    await sagas.salvar(SagaInstance.iniciar(os.id.toValue()));
    const saga = (await sagas.buscar(os.id.toValue()))!;
    const concorrente = (await sagas.buscar(os.id.toValue()))!;
    saga.avancar(EtapaSaga.ORCAMENTO);
    await sagas.salvar(saga);
    concorrente.avancar(EtapaSaga.ORCAMENTO);
    await expect(sagas.salvar(concorrente)).rejects.toBeInstanceOf(ConcorrenciaError);

    const lida = (await sagas.buscar(os.id.toValue()))!;
    expect(lida.etapa).toBe(EtapaSaga.ORCAMENTO);
    expect(lida.versao).toBe(2);
    lida.avancar(EtapaSaga.RESERVA);
    lida.compensar(EtapaSaga.COMPENSANDO_ORCAMENTO, 'Sem estoque');
    await sagas.salvar(lida);
    expect((await sagas.buscar(os.id.toValue()))!.motivoCompensacao).toBe('Sem estoque');
    expect(await sagas.buscar('99999999-9999-4999-8999-999999999999')).toBeNull();
  });

  it('cadastros: usuário, cliente por documento e veículos por placa', async () => {
    const usuarios = new PrismaUsuarioRepository(tm);
    await usuarios.salvar(Usuario.criar({ nome: 'Ana', email: 'ana@oficina.local', senha: 'hash', perfil: PerfilAcesso.MECANICO }));
    expect((await usuarios.buscarPorEmail('ana@oficina.local'))?.perfil).toBe(PerfilAcesso.MECANICO);
    expect((await clientes.buscarPorDocumento('52998224725'))?.id.equals(cliente.id)).toBe(true);
    expect((await veiculos.buscarPorPlaca('ABC1D23'))?.id.equals(veiculo.id)).toBe(true);
    expect(await veiculos.listarPorCliente(new UniqueID(cliente.id.toValue()))).toHaveLength(1);
  });
});
