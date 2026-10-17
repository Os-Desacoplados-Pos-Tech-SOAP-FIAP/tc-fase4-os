import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { StatusOS } from '../../../domain/ordem-de-servico/StatusOS';

export class ListarOrdensQuery {
  @ApiPropertyOptional({ enum: StatusOS }) @IsOptional() @IsEnum(StatusOS) status?: StatusOS;
}
