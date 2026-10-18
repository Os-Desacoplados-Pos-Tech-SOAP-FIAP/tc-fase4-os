import {
  INSUMO_FILTRO,
  SERVICO_INATIVO,
  SERVICO_REVISAO,
} from '../../../../test/fakes/catalogo-em-memoria';
import { Cenario, criarCenario, DESTINOS, TOKEN } from '../../../../test/fakes/cenario';
import { TipoItemOrcamento } from '../../../domain/ordem-de-servico/entities/ItemOrcamento';
import { EtapaSaga } from '../../../domain/saga/SagaInstance';
import { CatalogoIndisponivelError, RecursoNaoEncontradoError } from '../../errors';
import { AbrirOrdemDeServicoUseCase } from '../abrir-ordem/AbrirOrdemDeServicoUseCase';
import { AdicionarItemUseCase } from './AdicionarItemUseCase';

describe('AdicionarItemUseCase', () => {
  let c: Cenario;
  let useCase: AdicionarItemUseCase;
  let osId: string;

  async function abrirEmDiagnostico(): Promise<string> {
    const { cliente, veiculo } = await c.clienteComVeiculo();
    const abrir = new AbrirOrdemDeServicoUseCase(c.transacao, c.ordens, c.sagas, c.clientes, c.veiculos, c.outbox, DESTINOS, c.metricas);
    const { os } = await abrir.execute({ clienteId: cliente.id.toValue(), veiculoId: veiculo.id.toValue() });
    const salva = (await c.ordens.buscarPorId(os.id.toValue()))!;
    salva.iniciarDiagnostico();
    await c.ordens.salvar(salva);
    return os.id.toValue();
  }

  beforeEach(async () => {
    c = criarCenario();
    useCase = new AdicionarItemUseCase(c.transacao, c.trava, c.ordens, c.sagas, c.catalogo);
    osId = await abrirEmDiagnostico();
  });

  it('inclui serviço com nome e preço do Catalog, repassando o JWT e travando a OS', async () => {
    const { os } = await useCase.execute({ osId, tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO_REVISAO, quantidade: 1, autorizacao: TOKEN });
    expect(os.itens).toHaveLength(1);
    expect(os.itens[0]).toEqual(expect.objectContaining({ descricao: 'Revisão geral', valorUnitario: 250, quantidade: 1 }));
    expect(c.catalogo.autorizacoes).toEqual([TOKEN]);
    expect(c.trava.travadas).toEqual([osId]);
    expect((await c.ordens.buscarPorId(osId))?.itens).toHaveLength(1);
  });

  it('inclui insumo e soma quantidade quando repetido', async () => {
    await useCase.execute({ osId, tipo: TipoItemOrcamento.INSUMO, referenciaId: INSUMO_FILTRO, quantidade: 1, autorizacao: TOKEN });
    const { os } = await useCase.execute({ osId, tipo: TipoItemOrcamento.INSUMO, referenciaId: INSUMO_FILTRO, quantidade: 2, autorizacao: TOKEN });
    expect(os.itens[0].quantidade).toBe(3);
  });

  it('item inexistente no Catalog → 404; serviço inativo → 422', async () => {
    await expect(
      useCase.execute({ osId, tipo: TipoItemOrcamento.SERVICO, referenciaId: INSUMO_FILTRO, quantidade: 1, autorizacao: TOKEN }),
    ).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
    await expect(
      useCase.execute({ osId, tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO_INATIVO, quantidade: 1, autorizacao: TOKEN }),
    ).rejects.toEqual(expect.objectContaining({ code: 'ITEM_INATIVO_NO_CATALOGO' }));
  });

  it('Catalog fora do ar → propaga CatalogoIndisponivelError (503)', async () => {
    c.catalogo.fora();
    await expect(
      useCase.execute({ osId, tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO_REVISAO, quantidade: 1, autorizacao: TOKEN }),
    ).rejects.toBeInstanceOf(CatalogoIndisponivelError);
  });

  it('OS inexistente → 404', async () => {
    await expect(
      useCase.execute({ osId: '99999999-9999-4999-8999-999999999999', tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO_REVISAO, quantidade: 1, autorizacao: TOKEN }),
    ).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
  });

  it('OS inexistente → 404 mesmo com o Catalog fora do ar (não consulta o Catalog)', async () => {
    c.catalogo.fora();
    await expect(
      useCase.execute({ osId: '99999999-9999-4999-8999-999999999999', tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO_REVISAO, quantidade: 1, autorizacao: TOKEN }),
    ).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
    expect(c.catalogo.autorizacoes).toEqual([]);
  });

  it('recusa item depois que o orçamento foi pedido (saga fora do diagnóstico)', async () => {
    const saga = (await c.sagas.buscar(osId))!;
    saga.avancar(EtapaSaga.ORCAMENTO);
    await c.sagas.salvar(saga);
    await expect(
      useCase.execute({ osId, tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO_REVISAO, quantidade: 1, autorizacao: TOKEN }),
    ).rejects.toEqual(expect.objectContaining({ code: 'OS_ORCAMENTO_JA_SOLICITADO' }));
  });

  it('recusa item com a OS ainda RECEBIDA (diagnóstico não começou)', async () => {
    const { cliente, veiculo } = await c.clienteComVeiculoDe('111.444.777-35', 'XYZ9A87');
    const abrir = new AbrirOrdemDeServicoUseCase(c.transacao, c.ordens, c.sagas, c.clientes, c.veiculos, c.outbox, DESTINOS, c.metricas);
    const { os } = await abrir.execute({ clienteId: cliente.id.toValue(), veiculoId: veiculo.id.toValue() });
    await expect(
      useCase.execute({ osId: os.id.toValue(), tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO_REVISAO, quantidade: 1, autorizacao: TOKEN }),
    ).rejects.toEqual(expect.objectContaining({ code: 'OS_ITEM_FORA_DO_DIAGNOSTICO' }));
  });
});
