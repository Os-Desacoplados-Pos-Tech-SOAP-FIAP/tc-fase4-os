import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

import { PerfilAcesso } from '../../../common/auth/perfil';

/** Perfis de funcionário: CLIENTE só existe no token emitido pela Lambda de CPF (E16). */
const PERFIS_DE_FUNCIONARIO = [
  PerfilAcesso.ADMINISTRADOR,
  PerfilAcesso.ATENDENTE,
  PerfilAcesso.MECANICO,
];

export class RegistrarUsuarioDto {
  @ApiProperty({ example: 'Maria Atendente' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nome!: string;

  @ApiProperty({ example: 'maria@oficina.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'senhaSegura123' })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  senha!: string;

  @ApiProperty({ enum: PERFIS_DE_FUNCIONARIO, example: PerfilAcesso.ATENDENTE })
  @IsIn(PERFIS_DE_FUNCIONARIO)
  perfil!: PerfilAcesso;
}
