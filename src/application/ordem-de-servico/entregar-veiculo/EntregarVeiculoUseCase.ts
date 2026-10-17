import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { OrdemDeServico } from '../../../domain/ordem-de-servico/entities/OrdemDeServico';
import { IOrdemDeServicoRepository } from '../../../domain/ordem-de-servico/repositories/IOrdemDeServicoRepository';
import { ensureFound } from '../../ensure-found';
import { ITransactionManager } from '../../ports/transaction-manager';
import { ITravaPorOs } from '../../ports/trava-por-os';

/** Passo 11 da saga (spec §4.3): só a partir de PAGA. Encerra a OS sem comando. */
@Injectable()
export class EntregarVeiculoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.TRANSACTION_MANAGER) private readonly transacao: ITransactionManager,
    @Inject(INJECTION_TOKENS.TRAVA_POR_OS) private readonly trava: ITravaPorOs,
    @Inject(INJECTION_TOKENS.ORDEM_DE_SERVICO_REPOSITORY) private readonly ordens: IOrdemDeServicoRepository,
  ) {}

  execute(osId: string): Promise<OrdemDeServico> {
    return this.transacao.run(async () => {
      await this.trava.travar(osId);
      const os = ensureFound(await this.ordens.buscarPorId(osId), 'Ordem de serviço');
      os.entregar();
      await this.ordens.salvar(os);
      return os;
    });
  }
}
