import { Module } from '@nestjs/common';

import { AtualizarClienteUseCase } from '../../application/cliente/atualizar-cliente/AtualizarClienteUseCase';
import { BuscarClienteUseCase } from '../../application/cliente/buscar-cliente/BuscarClienteUseCase';
import { CadastrarClienteUseCase } from '../../application/cliente/cadastrar-cliente/CadastrarClienteUseCase';
import { ListarClientesUseCase } from '../../application/cliente/listar-clientes/ListarClientesUseCase';
import { ClienteController } from './cliente.controller';

@Module({
  controllers: [ClienteController],
  providers: [
    CadastrarClienteUseCase,
    BuscarClienteUseCase,
    AtualizarClienteUseCase,
    ListarClientesUseCase,
  ],
})
export class ClienteModule {}
