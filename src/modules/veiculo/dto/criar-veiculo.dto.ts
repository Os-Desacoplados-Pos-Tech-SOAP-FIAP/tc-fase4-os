import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CriarVeiculoDto {
  @ApiProperty({ example: 'ABC1D23' })
  @IsString()
  placa!: string;

  @ApiProperty({ example: 'Volkswagen' })
  @IsString()
  @MaxLength(120)
  marca!: string;

  @ApiProperty({ example: 'Gol' })
  @IsString()
  @MaxLength(120)
  modelo!: string;

  @ApiProperty({ example: 2022 })
  @IsInt()
  @Min(1900)
  @Max(2100)
  ano!: number;

  @ApiProperty({ example: 'uuid-do-cliente' })
  @IsUUID()
  clienteId!: string;
}
