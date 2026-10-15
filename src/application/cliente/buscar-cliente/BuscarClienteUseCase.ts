import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { ensureFound } from '../../ensure-found';
import { Cliente } from '../../../domain/cliente/entities/Cliente';
import { IClienteRepository } from '../../../domain/cliente/repositories/IClienteRepository';
import { UniqueID } from '../../../domain/shared/UniqueID';

@Injectable()
export class BuscarClienteUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.CLIENTE_REPOSITORY)
    private readonly clienteRepository: IClienteRepository,
  ) {}

  async porId(id: string): Promise<Cliente> {
    return ensureFound(await this.clienteRepository.buscarPorId(new UniqueID(id)), 'Cliente');
  }

  async porDocumento(documento: string): Promise<Cliente> {
    return ensureFound(await this.clienteRepository.buscarPorDocumento(documento), 'Cliente');
  }
}
