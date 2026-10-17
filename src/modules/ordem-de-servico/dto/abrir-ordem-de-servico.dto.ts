import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AbrirOrdemDeServicoDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() clienteId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() veiculoId!: string;
  @ApiPropertyOptional({ example: 'Barulho na suspensão dianteira' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;
}
