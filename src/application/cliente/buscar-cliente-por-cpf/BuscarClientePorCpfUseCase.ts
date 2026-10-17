import { Inject, Injectable } from '@nestjs/common';

import { INJECTION_TOKENS } from '../../../common/constants/injection-tokens';
import { TipoCliente } from '../../../domain/cliente/entities/Cliente';
import { IClienteRepository } from '../../../domain/cliente/repositories/IClienteRepository';
import { RecursoNaoEncontradoError } from '../../errors';

export interface ClienteParaAutenticacao {
  id: string;
  nome: string;
  cpf: string;
}

/** Usado pela Lambda de autenticação (E11): só pessoa física entra por CPF. */
@Injectable()
export class BuscarClientePorCpfUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
  ) {}

  async execute(cpf: string): Promise<ClienteParaAutenticacao> {
    const cliente = await this.clientes.buscarPorDocumento(cpf.replace(/\D/g, ''));
    if (cliente?.tipo !== TipoCliente.PF) throw new RecursoNaoEncontradoError('Cliente');
    return { id: cliente.id.toValue(), nome: cliente.nome, cpf: cliente.documento.value };
  }
}
