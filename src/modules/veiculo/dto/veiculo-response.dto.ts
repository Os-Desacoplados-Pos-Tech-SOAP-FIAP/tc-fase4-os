import { ApiProperty } from '@nestjs/swagger';

import { Veiculo } from '../../../domain/veiculo/entities/Veiculo';

export class VeiculoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() placa!: string;
  @ApiProperty() marca!: string;
  @ApiProperty() modelo!: string;
  @ApiProperty() ano!: number;
  @ApiProperty() clienteId!: string;
  @ApiProperty() criadoEm!: Date;
  @ApiProperty() atualizadoEm!: Date;

  static fromDomain(v: Veiculo): VeiculoResponseDto {
    return {
      id: v.id.toValue(),
      placa: v.placa.format(),
      marca: v.marca.value,
      modelo: v.modelo.value,
      ano: v.ano.value,
      clienteId: v.clienteId.toValue(),
      criadoEm: v.criadoEm,
      atualizadoEm: v.atualizadoEm,
    };
  }
}
