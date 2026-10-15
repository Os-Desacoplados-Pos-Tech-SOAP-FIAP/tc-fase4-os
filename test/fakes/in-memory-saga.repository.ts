import { ConcorrenciaError } from '../../src/application/errors';
import { ISagaRepository } from '../../src/domain/saga/ISagaRepository';
import { SagaInstance } from '../../src/domain/saga/SagaInstance';
import { ParticipanteTransacao } from './fake-transaction.manager';

export class InMemorySagaRepository implements ISagaRepository, ParticipanteTransacao {
  private sagas = new Map<string, SagaInstance>();

  async salvar(saga: SagaInstance): Promise<void> {
    const atual = this.sagas.get(saga.osId);
    if (saga.versao === 0) {
      if (atual) throw new Error('violação de unicidade em SagaInstance');
    } else if (atual?.versao !== saga.versao) {
      throw new ConcorrenciaError('Saga');
    }
    this.sagas.set(saga.osId, copiar(saga, saga.versao + 1));
  }

  async buscar(osId: string): Promise<SagaInstance | null> {
    const saga = this.sagas.get(osId);
    return saga ? copiar(saga, saga.versao) : null;
  }

  snapshot(): unknown {
    return new Map(this.sagas);
  }
  restaurar(estado: unknown): void {
    this.sagas = estado as Map<string, SagaInstance>;
  }
}

function copiar(saga: SagaInstance, versao: number): SagaInstance {
  return SagaInstance.restaurar({
    osId: saga.osId,
    etapa: saga.etapa,
    motivoCompensacao: saga.motivoCompensacao,
    versao,
  });
}
