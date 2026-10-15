import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { IOrdemDeServicoRepository } from '../../../domain/ordem-de-servico/repositories/IOrdemDeServicoRepository';
import { StatusOS } from '../../../domain/ordem-de-servico/StatusOS';
import { RecursoNaoEncontradoError } from '../../errors';

export interface StatusPublico {
  numero: number;
  status: StatusOS;
  valorTotal: number;
  atualizadoEm: Date;
}

/** Consulta do cliente (E13): OS de outro cliente responde 404, como se não existisse. */
@Injectable()
export class ConsultarStatusPublicoUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.ORDEM_DE_SERVICO_REPOSITORY) private readonly ordens: IOrdemDeServicoRepository,
  ) {}

  async execute(numero: number, clienteId: string): Promise<StatusPublico> {
    const os = await this.ordens.buscarPorNumero(numero);
    if (os?.clienteId !== clienteId) throw new RecursoNaoEncontradoError('Ordem de serviço');
    return { numero: os.numero, status: os.status, valorTotal: os.valorTotal, atualizadoEm: os.atualizadoEm };
  }
}
