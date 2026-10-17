import { Injectable } from '@nestjs/common';
import { EtapaSaga as EtapaSagaRow } from '@prisma/client';

import { ConcorrenciaError } from '../../application/errors';
import { ISagaRepository } from '../../domain/saga/ISagaRepository';
import { EtapaSaga, SagaInstance } from '../../domain/saga/SagaInstance';
import { PrismaTransactionManager } from '../database/prisma-transaction.manager';

@Injectable()
export class PrismaSagaRepository implements ISagaRepository {
  constructor(private readonly db: PrismaTransactionManager) {}

  async salvar(saga: SagaInstance): Promise<void> {
    const dados = {
      etapa: EtapaSagaRow[saga.etapa],
      motivoCompensacao: saga.motivoCompensacao,
    };
    if (saga.versao === 0) {
      await this.db.client.sagaInstance.create({ data: { osId: saga.osId, versao: 1, ...dados } });
      return;
    }
    const { count } = await this.db.client.sagaInstance.updateMany({
      where: { osId: saga.osId, versao: saga.versao },
      data: { ...dados, versao: { increment: 1 } },
    });
    if (count === 0) throw new ConcorrenciaError('Saga');
  }

  async buscar(osId: string): Promise<SagaInstance | null> {
    const row = await this.db.client.sagaInstance.findUnique({ where: { osId } });
    return row
      ? SagaInstance.restaurar({
          osId: row.osId,
          etapa: EtapaSaga[row.etapa],
          motivoCompensacao: row.motivoCompensacao,
          versao: row.versao,
        })
      : null;
  }
}
