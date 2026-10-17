import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AtualizarVeiculoDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  placa?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  marca?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  ano?: number;
}
