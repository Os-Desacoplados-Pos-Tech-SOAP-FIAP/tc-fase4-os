import { SagaInstance } from './SagaInstance';

export interface ISagaRepository {
  /** Insere (versão 0) ou atualiza conferindo a versão (conflito lança ConcorrenciaError). */
  salvar(saga: SagaInstance): Promise<void>;
  buscar(osId: string): Promise<SagaInstance | null>;
}
