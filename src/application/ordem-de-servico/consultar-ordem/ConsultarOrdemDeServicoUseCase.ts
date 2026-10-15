import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { OrdemDeServico } from '../../../domain/ordem-de-servico/entities/OrdemDeServico';
import { IOrdemDeServicoRepository } from '../../../domain/ordem-de-servico/repositories/IOrdemDeServicoRepository';
import { ISagaRepository } from '../../../domain/saga/ISagaRepository';
import { ensureFound } from '../../ensure-found';
import { OrdemComSaga } from '../abrir-ordem/AbrirOrdemDeServicoUseCase';

@Injectable()
export class ConsultarOrdemDeServicoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.ORDEM_DE_SERVICO_REPOSITORY) private readonly ordens: IOrdemDeServicoRepository,
    @Inject(INJECTION_TOKENS.SAGA_REPOSITORY) private readonly sagas: ISagaRepository,
  ) {}

  async porId(id: string): Promise<OrdemComSaga> {
    return this.comSaga(ensureFound(await this.ordens.buscarPorId(id), 'Ordem de serviço'));
  }

  async porNumero(numero: number): Promise<OrdemComSaga> {
    return this.comSaga(ensureFound(await this.ordens.buscarPorNumero(numero), 'Ordem de serviço'));
  }

  private async comSaga(os: OrdemDeServico): Promise<OrdemComSaga> {
    const saga = ensureFound(await this.sagas.buscar(os.id.toValue()), 'Saga da ordem de serviço');
    return { os, saga };
  }
}
