import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AbrirOrdemDeServicoUseCase } from '../../application/ordem-de-servico/abrir-ordem/AbrirOrdemDeServicoUseCase';
import { AdicionarItemUseCase } from '../../application/ordem-de-servico/adicionar-item/AdicionarItemUseCase';
import { ConsultarOrdemDeServicoUseCase } from '../../application/ordem-de-servico/consultar-ordem/ConsultarOrdemDeServicoUseCase';
import { EntregarVeiculoUseCase } from '../../application/ordem-de-servico/entregar-veiculo/EntregarVeiculoUseCase';
import { HistoricoDaOrdemUseCase } from '../../application/ordem-de-servico/historico/HistoricoDaOrdemUseCase';
import { ListarOrdensDeServicoUseCase } from '../../application/ordem-de-servico/listar-ordens/ListarOrdensDeServicoUseCase';
import { PerfilAcesso } from '../../common/auth/perfil';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiAuthResponses, ApiValidationResponses } from '../../common/decorators/swagger';
import { ParseNumeroOsPipe } from '../../common/pipes/parse-numero-os.pipe';
import { AbrirOrdemDeServicoDto } from './dto/abrir-ordem-de-servico.dto';
import { AdicionarItemDto } from './dto/adicionar-item.dto';
import { ListarOrdensQuery } from './dto/listar-ordens.query';
import {
  OrdemDeServicoResponseDto,
  RegistroHistoricoResponseDto,
  ResumoOrdemDeServicoResponseDto,
} from './dto/ordem-de-servico-response.dto';

const FUNCIONARIOS = [PerfilAcesso.ATENDENTE, PerfilAcesso.MECANICO, PerfilAcesso.ADMINISTRADOR];

@ApiTags('Ordens de serviço')
@ApiBearerAuth()
@ApiAuthResponses()
@Controller('ordens-de-servico')
export class OrdemDeServicoController {
  constructor(
    private readonly abrir: AbrirOrdemDeServicoUseCase,
    private readonly adicionarItem: AdicionarItemUseCase,
    private readonly consultar: ConsultarOrdemDeServicoUseCase,
    private readonly listarOrdens: ListarOrdensDeServicoUseCase,
    private readonly historicoDaOrdem: HistoricoDaOrdemUseCase,
    private readonly entregarVeiculo: EntregarVeiculoUseCase,
  ) {}

  @Post()
  @Roles(PerfilAcesso.ATENDENTE, PerfilAcesso.ADMINISTRADOR)
  @ApiOperation({ summary: 'Abre a OS e inicia a saga (pede o diagnóstico ao Execution)' })
  @ApiResponse({ status: 201, type: OrdemDeServicoResponseDto })
  @ApiValidationResponses()
  async criar(@Body() dto: AbrirOrdemDeServicoDto): Promise<OrdemDeServicoResponseDto> {
    return OrdemDeServicoResponseDto.deOrdem(await this.abrir.execute(dto));
  }

  @Get()
  @Roles(...FUNCIONARIOS)
  @ApiOperation({ summary: 'Lista as OS (mais recentes primeiro)' })
  @ApiResponse({ status: 200, type: ResumoOrdemDeServicoResponseDto, isArray: true })
  async listar(@Query() query: ListarOrdensQuery): Promise<ResumoOrdemDeServicoResponseDto[]> {
    return (await this.listarOrdens.execute(query.status)).map(ResumoOrdemDeServicoResponseDto.de);
  }

  @Get('numero/:numero')
  @Roles(...FUNCIONARIOS)
  @ApiOperation({ summary: 'Consulta a OS pelo número' })
  @ApiResponse({ status: 200, type: OrdemDeServicoResponseDto })
  @ApiResponse({ status: 400, description: 'Número fora de 1..2147483647' })
  async porNumero(@Param('numero', ParseNumeroOsPipe) numero: number): Promise<OrdemDeServicoResponseDto> {
    return OrdemDeServicoResponseDto.deOrdem(await this.consultar.porNumero(numero));
  }

  @Get(':id')
  @Roles(...FUNCIONARIOS)
  @ApiOperation({ summary: 'Consulta a OS com itens, orçamento, link de pagamento e etapa da saga' })
  @ApiResponse({ status: 200, type: OrdemDeServicoResponseDto })
  async porId(@Param('id', ParseUUIDPipe) id: string): Promise<OrdemDeServicoResponseDto> {
    return OrdemDeServicoResponseDto.deOrdem(await this.consultar.porId(id));
  }

  @Get(':id/historico')
  @Roles(...FUNCIONARIOS)
  @ApiOperation({ summary: 'Histórico de status da OS' })
  @ApiResponse({ status: 200, type: RegistroHistoricoResponseDto, isArray: true })
  async historico(@Param('id', ParseUUIDPipe) id: string): Promise<RegistroHistoricoResponseDto[]> {
    return (await this.historicoDaOrdem.execute(id)).map(RegistroHistoricoResponseDto.de);
  }

  @Post(':id/itens')
  @Roles(...FUNCIONARIOS)
  @ApiOperation({ summary: 'Inclui serviço ou insumo no diagnóstico (preço do Catalog)' })
  @ApiResponse({ status: 201, type: OrdemDeServicoResponseDto })
  @ApiResponse({ status: 503, description: 'Catalog indisponível' })
  @ApiValidationResponses()
  async incluirItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdicionarItemDto,
    @Headers('authorization') autorizacao: string,
  ): Promise<OrdemDeServicoResponseDto> {
    return OrdemDeServicoResponseDto.deOrdem(
      await this.adicionarItem.execute({ osId: id, ...dto, autorizacao }),
    );
  }

  @Post(':id/entrega')
  @HttpCode(200)
  @Roles(PerfilAcesso.ATENDENTE, PerfilAcesso.ADMINISTRADOR)
  @ApiOperation({ summary: 'Entrega o veículo (só com a OS PAGA)' })
  @ApiResponse({ status: 200, type: ResumoOrdemDeServicoResponseDto })
  async entregar(@Param('id', ParseUUIDPipe) id: string): Promise<ResumoOrdemDeServicoResponseDto> {
    return ResumoOrdemDeServicoResponseDto.de(await this.entregarVeiculo.execute(id));
  }
}
