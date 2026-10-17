import { ApiProperty } from '@nestjs/swagger';

import { PerfilAcesso } from '../../../common/auth/perfil';

export class UsuarioResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: PerfilAcesso }) perfil!: PerfilAcesso;
}

export class LoginResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ type: UsuarioResponseDto }) usuario!: UsuarioResponseDto;
}
