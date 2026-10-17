import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import {
  BuscarClientePorCpfUseCase,
  ClienteParaAutenticacao,
} from '../../application/cliente/buscar-cliente-por-cpf/BuscarClientePorCpfUseCase';
import { Public } from '../../common/decorators/public.decorator';
import { InternalTokenGuard } from '../../common/guards/internal-token.guard';

/**
 * Chamadas serviço a serviço (Lambda de autenticação por CPF). Fora do JWT de usuário:
 * protegidas pelo header X-Internal-Token. Fora do Swagger público.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal')
export class InternoController {
  constructor(private readonly buscarPorCpf: BuscarClientePorCpfUseCase) {}

  @Get('clientes/cpf/:cpf')
  cliente(@Param('cpf') cpf: string): Promise<ClienteParaAutenticacao> {
    return this.buscarPorCpf.execute(cpf);
  }
}
