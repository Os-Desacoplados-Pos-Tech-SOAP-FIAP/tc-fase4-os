import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  ConsultarStatusPublicoUseCase,
  StatusPublico,
} from '../../application/ordem-de-servico/status-publico/ConsultarStatusPublicoUseCase';
import { PerfilAcesso } from '../../common/auth/perfil';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsuarioAutenticado } from '../../infrastructure/auth/jwt.strategy';

/** Rotas do cliente final (JWT emitido pela Lambda de CPF, `sub` = id do cliente). */
@ApiTags('Público')
@ApiBearerAuth()
@Controller('publico')
export class PublicoController {
  constructor(private readonly consultarStatus: ConsultarStatusPublicoUseCase) {}

  @Get('os/:numero/status')
  @Roles(PerfilAcesso.CLIENTE)
  @ApiOperation({ summary: 'Status de uma OS do próprio cliente' })
  @ApiResponse({ status: 200, description: 'numero, status, valorTotal e atualizadoEm' })
  @ApiResponse({ status: 404, description: 'OS inexistente ou de outro cliente' })
  status(
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser() cliente: UsuarioAutenticado,
  ): Promise<StatusPublico> {
    return this.consultarStatus.execute(numero, cliente.id);
  }
}
