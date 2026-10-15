import { OrdemDeServico, RegistroHistorico } from '../entities/OrdemDeServico';
import { StatusOS } from '../StatusOS';

export interface IOrdemDeServicoRepository {
  /** Próximo número pela sequência do banco (E15). */
  proximoNumero(): Promise<number>;
  /**
   * Insere (versão 0) ou atualiza conferindo a versão (conflito lança ConcorrenciaError).
   * Grava itens e histórico pendente na mesma operação e chama `confirmarHistorico()`.
   */
  salvar(os: OrdemDeServico): Promise<void>;
  buscarPorId(id: string): Promise<OrdemDeServico | null>;
  buscarPorNumero(numero: number): Promise<OrdemDeServico | null>;
  /** Mais recentes primeiro. */
  listar(filtro: { status?: StatusOS }): Promise<OrdemDeServico[]>;
  /** Histórico gravado, em ordem cronológica. */
  historico(osId: string): Promise<RegistroHistorico[]>;
}
