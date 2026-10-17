import { randomUUID } from 'node:crypto';

import { ContextoEvento, OrquestradorSaga } from '../../src/application/saga/orquestrador-saga';
import { NovoItemOrcamento, TipoItemOrcamento } from '../../src/domain/ordem-de-servico/entities/ItemOrcamento';
import { OrdemDeServico } from '../../src/domain/ordem-de-servico/entities/OrdemDeServico';
import { EtapaSaga, SagaInstance } from '../../src/domain/saga/SagaInstance';
import { INSUMO_FILTRO, SERVICO_REVISAO } from './catalogo-em-memoria';
import { Cenario, DESTINOS } from './cenario';

export const SERVICO: NovoItemOrcamento = {
  tipo: TipoItemOrcamento.SERVICO,
  referenciaId: SERVICO_REVISAO,
  descricao: 'Revisão geral',
  quantidade: 1,
  valorUnitario: 250,
};

export const INSUMO: NovoItemOrcamento = {
  tipo: TipoItemOrcamento.INSUMO,
  referenciaId: INSUMO_FILTRO,
  descricao: 'Filtro de óleo',
  quantidade: 2,
  valorUnitario: 35.5,
};

export function contexto(osId: string, tipo = 'teste.evento.v1'): ContextoEvento {
  return { messageId: randomUUID(), correlationId: osId, tipo };
}

/** OS RECEBIDA com saga em DIAGNOSTICO, como a abertura deixa. */
export async function osAberta(c: Cenario): Promise<string> {
  const { cliente, veiculo } = await c.clienteComVeiculo();
  const os = OrdemDeServico.abrir({
    numero: await c.ordens.proximoNumero(),
    clienteId: cliente.id.toValue(),
    veiculoId: veiculo.id.toValue(),
  });
  await c.ordens.salvar(os);
  await c.sagas.salvar(SagaInstance.iniciar(os.id.toValue()));
  return os.id.toValue();
}

export async function incluirItens(c: Cenario, osId: string, itens: NovoItemOrcamento[]): Promise<void> {
  const os = (await c.ordens.buscarPorId(osId))!;
  itens.forEach((item) => os.adicionarItem(item));
  await c.ordens.salvar(os);
}

export function criarOrquestrador(c: Cenario): OrquestradorSaga {
  return new OrquestradorSaga(c.transacao, c.processadas, c.trava, c.ordens, c.sagas, c.clientes, c.outbox, DESTINOS);
}

/** Versões gravadas da OS e da saga: iguais antes e depois = nada foi escrito. */
export async function versoes(c: Cenario, osId: string): Promise<{ os: number; saga: number }> {
  return {
    os: (await c.ordens.buscarPorId(osId))!.versao,
    saga: (await c.sagas.buscar(osId))!.versao,
  };
}

/** Põe a saga direto numa etapa (para testar eventos atrasados em cada etapa). */
export async function forcarEtapa(c: Cenario, osId: string, etapa: EtapaSaga): Promise<void> {
  const atual = (await c.sagas.buscar(osId))!;
  await c.sagas.salvar(
    SagaInstance.restaurar({
      osId,
      etapa,
      codigoCompensacao: atual.codigoCompensacao,
      motivoCompensacao: atual.motivoCompensacao,
      versao: atual.versao,
    }),
  );
}
