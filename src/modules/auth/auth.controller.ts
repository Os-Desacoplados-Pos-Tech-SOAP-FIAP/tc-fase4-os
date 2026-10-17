import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { LoginUseCase } from '../../application/auth/login/LoginUseCase';
import { RegistrarUsuarioUseCase } from '../../application/auth/registrar-usuario/RegistrarUsuarioUseCase';
import { PerfilAcesso } from '../../common/auth/perfil';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiAuthResponses,
  ApiValidationResponses,
} from '../../common/decorators/swagger';
import { LoginResponseDto, UsuarioResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly registrarUsuarioUseCase: RegistrarUsuarioUseCase,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Autentica usuário e retorna token JWT',
    description: 'Valida credenciais (email/senha) e devolve o token de acesso.',
  })
  @ApiResponse({ status: 200, description: 'Token JWT retornado com sucesso', type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas ou usuário inativo' })
  @ApiValidationResponses()
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.loginUseCase.execute(dto.email, dto.senha);
  }

  @Post('registrar')
  @Roles(PerfilAcesso.ADMINISTRADOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Registra um novo usuário',
    description: 'Exige JWT com perfil ADMINISTRADOR. O primeiro administrador vem do seed.',
  })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso', type: UsuarioResponseDto })
  @ApiResponse({ status: 409, description: 'Email já cadastrado' })
  @ApiAuthResponses()
  @ApiValidationResponses()
  async registrar(@Body() dto: RegistrarUsuarioDto): Promise<UsuarioResponseDto> {
    return this.registrarUsuarioUseCase.execute(dto);
  }
}
