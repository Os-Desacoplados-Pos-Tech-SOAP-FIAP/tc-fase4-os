import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsUUID, Max, Min } from 'class-validator';

import { TipoItemOrcamento } from '../../../domain/ordem-de-servico/entities/ItemOrcamento';

export class AdicionarItemDto {
  @ApiProperty({ enum: TipoItemOrcamento }) @IsEnum(TipoItemOrcamento) tipo!: TipoItemOrcamento;
  @ApiProperty({ format: 'uuid', description: 'Id do serviço ou insumo no Catalog' })
  @IsUUID()
  referenciaId!: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) @Max(1000) quantidade!: number;
}
