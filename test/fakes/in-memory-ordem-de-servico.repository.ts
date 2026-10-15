import { ConcorrenciaError } from '../../src/application/errors';
import { ItemOrcamento } from '../../src/domain/ordem-de-servico/entities/ItemOrcamento';
import {
  OrdemDeServico,
  RegistroHistorico,
} from '../../src/domain/ordem-de-servico/entities/OrdemDeServico';
import { IOrdemDeServicoRepository } from '../../src/domain/ordem-de-servico/repositories/IOrdemDeServicoRepository';
import { StatusOS } from '../../src/domain/ordem-de-servico/StatusOS';
import { ParticipanteTransacao } from './fake-transaction.manager';

interface Estado {
  ordens: Map<string, OrdemDeServico>;
  historico: Map<string, RegistroHistorico[]>;
  sequencia: number;
}

/** Guarda cópias com a versão incrementada, como o banco faria. */
export class InMemoryOrdemDeServicoRepository
  implements IOrdemDeServicoRepository, ParticipanteTransacao
{
  private estado: Estado = { ordens: new Map(), historico: new Map(), sequencia: 0 };

  async proximoNumero(): Promise<number> {
    this.estado.sequencia += 1;
    return this.estado.sequencia;
  }

  async salvar(os: OrdemDeServico): Promise<void> {
    const id = os.id.toValue();
    const atual = this.estado.ordens.get(id);
    if (os.versao === 0) {
      if (atual) throw new Error('violação de unicidade em OrdemDeServico');
    } else if (atual?.versao !== os.versao) {
      throw new ConcorrenciaError('Ordem de serviço');
    }
    this.estado.ordens.set(id, copiar(os, os.versao + 1));
    const historico = this.estado.historico.get(id) ?? [];
    this.estado.historico.set(id, [...historico, ...os.historicoPendente]);
    os.confirmarHistorico();
  }

  async buscarPorId(id: string): Promise<OrdemDeServico | null> {
    const os = this.estado.ordens.get(id);
    return os ? copiar(os, os.versao) : null;
  }

  async buscarPorNumero(numero: number): Promise<OrdemDeServico | null> {
    const os = [...this.estado.ordens.values()].find((o) => o.numero === numero);
    return os ? copiar(os, os.versao) : null;
  }

  async listar(filtro: { status?: StatusOS }): Promise<OrdemDeServico[]> {
    return [...this.estado.ordens.values()]
      .filter((o) => !filtro.status || o.status === filtro.status)
      .sort((a, b) => b.numero - a.numero)
      .map((o) => copiar(o, o.versao));
  }

  async historico(osId: string): Promise<RegistroHistorico[]> {
    return [...(this.estado.historico.get(osId) ?? [])];
  }

  snapshot(): unknown {
    return {
      ordens: new Map(this.estado.ordens),
      historico: new Map(this.estado.historico),
      sequencia: this.estado.sequencia,
    };
  }
  restaurar(estado: unknown): void {
    this.estado = estado as Estado;
  }
}

function copiar(os: OrdemDeServico, versao: number): OrdemDeServico {
  return OrdemDeServico.restaurar(
    {
      numero: os.numero,
      clienteId: os.clienteId,
      veiculoId: os.veiculoId,
      status: os.status,
      observacoes: os.observacoes,
      itens: os.itens.map((item) =>
        ItemOrcamento.restaurar(
          {
            tipo: item.tipo,
            referenciaId: item.referenciaId,
            descricao: item.descricao,
            quantidade: item.quantidade,
            valorUnitario: item.valorUnitario,
            criadoEm: item.criadoEm,
            atualizadoEm: item.atualizadoEm,
          },
          item.id,
        ),
      ),
      orcamento: os.orcamento,
      linkPagamento: os.linkPagamento,
      versao,
      criadoEm: os.criadoEm,
      atualizadoEm: os.atualizadoEm,
    },
    os.id,
  );
}
