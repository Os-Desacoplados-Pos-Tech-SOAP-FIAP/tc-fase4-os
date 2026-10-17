import { Module } from '@nestjs/common';

import { ConsultarStatusPublicoUseCase } from '../../application/ordem-de-servico/status-publico/ConsultarStatusPublicoUseCase';
import { PublicoController } from './publico.controller';

@Module({
  controllers: [PublicoController],
  providers: [ConsultarStatusPublicoUseCase],
})
export class PublicoModule {}
