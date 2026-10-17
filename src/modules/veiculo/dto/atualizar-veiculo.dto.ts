import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AtualizarVeiculoDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  placa?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  marca?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  modelo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1900)
  ano?: number;
}
