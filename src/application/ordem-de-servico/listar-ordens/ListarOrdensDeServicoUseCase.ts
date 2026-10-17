import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { OrdemDeServico } from '../../../domain/ordem-de-servico/entities/OrdemDeServico';
import { IOrdemDeServicoRepository } from '../../../domain/ordem-de-servico/repositories/IOrdemDeServicoRepository';
import { StatusOS } from '../../../domain/ordem-de-servico/StatusOS';

@Injectable()
export class ListarOrdensDeServicoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.ORDEM_DE_SERVICO_REPOSITORY) private readonly ordens: IOrdemDeServicoRepository,
  ) {}

  execute(status?: StatusOS): Promise<OrdemDeServico[]> {
    return this.ordens.listar({ status });
  }
}
