import { Module } from '@nestjs/common';

import { BuscarClientePorCpfUseCase } from '../../application/cliente/buscar-cliente-por-cpf/BuscarClientePorCpfUseCase';
import { InternoController } from './interno.controller';

@Module({
  controllers: [InternoController],
  providers: [BuscarClientePorCpfUseCase],
})
export class InternoModule {}
