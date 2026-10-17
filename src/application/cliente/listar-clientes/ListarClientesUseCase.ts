import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { Cliente } from '../../../domain/cliente/entities/Cliente';
import { IClienteRepository } from '../../../domain/cliente/repositories/IClienteRepository';

@Injectable()
export class ListarClientesUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.CLIENTE_REPOSITORY)
    private readonly clienteRepository: IClienteRepository,
  ) {}

  async execute(): Promise<Cliente[]> {
    return this.clienteRepository.listar();
  }
}
