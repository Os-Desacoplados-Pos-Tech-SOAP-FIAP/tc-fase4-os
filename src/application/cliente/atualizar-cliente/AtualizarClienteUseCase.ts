import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { ensureFound } from '../../ensure-found';
import { Cliente } from '../../../domain/cliente/entities/Cliente';
import { IClienteRepository } from '../../../domain/cliente/repositories/IClienteRepository';
import { UniqueID } from '../../../domain/shared/UniqueID';

interface AtualizarClienteInput {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
}

@Injectable()
export class AtualizarClienteUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.CLIENTE_REPOSITORY)
    private readonly clienteRepository: IClienteRepository,
  ) {}

  async execute(input: AtualizarClienteInput): Promise<Cliente> {
    const cliente = ensureFound(
      await this.clienteRepository.buscarPorId(new UniqueID(input.id)),
      'Cliente',
    );
    cliente.atualizar({ nome: input.nome, email: input.email, telefone: input.telefone });
    await this.clienteRepository.salvar(cliente);
    return cliente;
  }
}
