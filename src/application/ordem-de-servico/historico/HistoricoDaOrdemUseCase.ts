import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { RegistroHistorico } from '../../../domain/ordem-de-servico/entities/OrdemDeServico';
import { IOrdemDeServicoRepository } from '../../../domain/ordem-de-servico/repositories/IOrdemDeServicoRepository';
import { ensureFound } from '../../ensure-found';

@Injectable()
export class HistoricoDaOrdemUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.ORDEM_DE_SERVICO_REPOSITORY) private readonly ordens: IOrdemDeServicoRepository,
  ) {}

  async execute(osId: string): Promise<RegistroHistorico[]> {
    ensureFound(await this.ordens.buscarPorId(osId), 'Ordem de serviço');
    return this.ordens.historico(osId);
  }
}
