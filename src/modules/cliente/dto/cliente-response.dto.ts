import { ApiProperty } from '@nestjs/swagger';

import { Cliente, TipoCliente } from '../../../domain/cliente/entities/Cliente';

export class ClienteResponseDto {
   @ApiProperty() id!: string;
   @ApiProperty({ enum: TipoCliente }) tipo!: TipoCliente;
   @ApiProperty() documento!: string;
   @ApiProperty() nome!: string;
   @ApiProperty() email!: string;
   @ApiProperty({ required: false }) telefone?: string;
   @ApiProperty() criadoEm!: Date;
   @ApiProperty() atualizadoEm!: Date;

   static fromDomain(c: Cliente): ClienteResponseDto {
      return {
         id: c.id.toValue(),
         tipo: c.tipo,
         documento: c.documento.format(),
         nome: c.nome,
         email: c.email.value,
         telefone: c.telefone?.format(),
         criadoEm: c.criadoEm,
         atualizadoEm: c.atualizadoEm,
      };
   }
}
