import { SagaInstance } from './SagaInstance';

export interface ISagaRepository {
  /**
   * Insere (versão 0) ou atualiza conferindo a versão (conflito lança ConcorrenciaError).
   * Não reutilize a instância depois de salvar: a versão no banco avança e a instância fica desatualizada.
   */
  salvar(saga: SagaInstance): Promise<void>;
  buscar(osId: string): Promise<SagaInstance | null>;
}
