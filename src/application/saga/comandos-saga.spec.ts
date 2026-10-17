import { InMemoryOutbox } from '../../../test/fakes/in-memory-outbox';
import { TipoItemOrcamento } from '../../domain/ordem-de-servico/entities/ItemOrcamento';
import { OrdemDeServico } from '../../domain/ordem-de-servico/entities/OrdemDeServico';
import { comandos, enviarComandos } from './comandos-saga';

const SERVICO = '33333333-3333-4333-8333-333333333333';
const INSUMO = '44444444-4444-4444-8444-444444444444';
const DESTINOS = { catalog: 'fila-catalog', billing: 'fila-billing', execution: 'fila-execution' };

function osComItens(): OrdemDeServico {
  const os = OrdemDeServico.abrir({
    numero: 12,
    clienteId: '11111111-1111-4111-8111-111111111111',
    veiculoId: '22222222-2222-4222-8222-222222222222',
  });
  os.iniciarDiagnostico();
  os.adicionarItem({ tipo: TipoItemOrcamento.SERVICO, referenciaId: SERVICO, descricao: 'Alinhamento', quantidade: 1, valorUnitario: 90 });
  os.adicionarItem({ tipo: TipoItemOrcamento.INSUMO, referenciaId: INSUMO, descricao: 'Filtro', quantidade: 2, valorUnitario: 35.5 });
  return os;
}

describe('comandos da saga', () => {
  it('enfileirar-diagnostico leva o número da OS para o Execution', () => {
    expect(comandos.enfileirarDiagnostico(osComItens())).toEqual({
      destino: 'execution',
      type: 'execution.enfileirar-diagnostico.v1',
      payload: { numeroOs: 12 },
    });
  });

  it('gerar-orcamento leva cliente e itens com valores numéricos', () => {
    const os = osComItens();
    const comando = comandos.gerarOrcamento(os, { nome: 'Ana', email: 'ana@x.com' });
    expect(comando.destino).toBe('billing');
    expect(comando.type).toBe('billing.gerar-orcamento.v1');
    expect(comando.payload).toEqual({
      numeroOs: 12,
      cliente: { nome: 'Ana', email: 'ana@x.com' },
      itens: [
        { itemId: os.itens[0].id.toValue(), tipo: 'SERVICO', referenciaId: SERVICO, descricao: 'Alinhamento', quantidade: 1, valorUnitario: 90 },
        { itemId: os.itens[1].id.toValue(), tipo: 'INSUMO', referenciaId: INSUMO, descricao: 'Filtro', quantidade: 2, valorUnitario: 35.5 },
      ],
    });
    expect(typeof comando.payload.itens[1].valorUnitario).toBe('number');
  });

  it('reservar-insumos leva só insumos; enfileirar-execucao leva só serviços', () => {
    const os = osComItens();
    expect(comandos.reservarInsumos(os).payload).toEqual({ itens: [{ insumoId: INSUMO, quantidade: 2 }] });
    expect(comandos.enfileirarExecucao(os).payload).toEqual({
      itens: [{ itemId: os.itens[0].id.toValue(), servicoId: SERVICO, descricao: 'Alinhamento' }],
    });
  });

  it('comandos sem dados levam payload vazio', () => {
    expect(comandos.reabrirDiagnostico()).toEqual({ destino: 'execution', type: 'execution.reabrir-diagnostico.v1', payload: {} });
    expect(comandos.liberarReservas()).toEqual({ destino: 'catalog', type: 'catalog.liberar-reservas.v1', payload: {} });
    expect(comandos.baixarReservas()).toEqual({ destino: 'catalog', type: 'catalog.baixar-reservas.v1', payload: {} });
    expect(comandos.gerarCobranca()).toEqual({ destino: 'billing', type: 'billing.gerar-cobranca.v1', payload: {} });
    expect(comandos.cancelarOrcamento('Sem estoque')).toEqual({
      destino: 'billing',
      type: 'billing.cancelar-orcamento.v1',
      payload: { motivo: 'Sem estoque' },
    });
  });

  it('enviarComandos grava na outbox, em ordem, com correlação = OS e causa', async () => {
    const outbox = new InMemoryOutbox();
    await enviarComandos(outbox, DESTINOS, 'os-1', [comandos.baixarReservas(), comandos.gerarCobranca()], 'msg-origem');
    expect(outbox.enviadas.map((m) => [m.destino, m.envelope.type, m.envelope.correlationId, m.envelope.causationId])).toEqual([
      ['fila-catalog', 'catalog.baixar-reservas.v1', 'os-1', 'msg-origem'],
      ['fila-billing', 'billing.gerar-cobranca.v1', 'os-1', 'msg-origem'],
    ]);
    expect(outbox.enviadas[0].envelope.messageId).not.toBe(outbox.enviadas[1].envelope.messageId);
  });
});
