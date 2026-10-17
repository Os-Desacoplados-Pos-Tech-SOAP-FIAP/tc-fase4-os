import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Min } from 'class-validator';

export class CriarVeiculoDto {
  @ApiProperty({ example: 'ABC1D23' })
  @IsString()
  placa!: string;

  @ApiProperty({ example: 'Volkswagen' })
  @IsString()
  marca!: string;

  @ApiProperty({ example: 'Gol' })
  @IsString()
  modelo!: string;

  @ApiProperty({ example: 2022 })
  @IsInt()
  @Min(1900)
  ano!: number;

  @ApiProperty({ example: 'uuid-do-cliente' })
  @IsUUID()
  clienteId!: string;
}
