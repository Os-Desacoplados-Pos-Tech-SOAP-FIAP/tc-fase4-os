import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AtualizarVeiculoUseCase } from '../../application/veiculo/atualizar-veiculo/AtualizarVeiculoUseCase';
import { BuscarVeiculoUseCase } from '../../application/veiculo/buscar-veiculo/BuscarVeiculoUseCase';
import { CadastrarVeiculoUseCase } from '../../application/veiculo/cadastrar-veiculo/CadastrarVeiculoUseCase';
import { ListarVeiculosUseCase } from '../../application/veiculo/listar-veiculos/ListarVeiculosUseCase';
import { PerfilAcesso } from '../../common/auth/perfil';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiAuthResponses,
  ApiValidationResponses,
} from '../../common/decorators/swagger';
import { AtualizarVeiculoDto } from './dto/atualizar-veiculo.dto';
import { CriarVeiculoDto } from './dto/criar-veiculo.dto';
import { VeiculoResponseDto } from './dto/veiculo-response.dto';

@ApiTags('Veículos')
@ApiBearerAuth()
@Roles(PerfilAcesso.ATENDENTE, PerfilAcesso.ADMINISTRADOR)
@Controller('veiculos')
export class VeiculoController {
  constructor(
    private readonly cadastrar: CadastrarVeiculoUseCase,
    private readonly buscar: BuscarVeiculoUseCase,
    private readonly listar: ListarVeiculosUseCase,
    private readonly atualizar: AtualizarVeiculoUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Cadastra veículo',
    description: 'Cria um veículo vinculado a um cliente. Placa deve ser única.',
  })
  @ApiResponse({ status: 201, description: 'Veículo criado', type: VeiculoResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente informado não encontrado' })
  @ApiResponse({ status: 409, description: 'Placa já cadastrada' })
  @ApiAuthResponses()
  @ApiValidationResponses()
  async create(@Body() dto: CriarVeiculoDto): Promise<VeiculoResponseDto> {
    const veiculo = await this.cadastrar.execute(dto);
    return VeiculoResponseDto.fromDomain(veiculo);
  }

  @Get()
  @ApiOperation({ summary: 'Lista veículos (opcionalmente filtrados por cliente)' })
  @ApiResponse({ status: 200, description: 'Lista retornada', type: VeiculoResponseDto, isArray: true })
  @ApiAuthResponses()
  async list(@Query('clienteId') clienteId?: string): Promise<VeiculoResponseDto[]> {
    const veiculos = await this.listar.execute(clienteId);
    return veiculos.map((v) => VeiculoResponseDto.fromDomain(v));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca veículo por ID' })
  @ApiResponse({ status: 200, description: 'Veículo encontrado', type: VeiculoResponseDto })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  @ApiAuthResponses()
  async getById(@Param('id') id: string): Promise<VeiculoResponseDto> {
    const veiculo = await this.buscar.porId(id);
    return VeiculoResponseDto.fromDomain(veiculo);
  }

  @Get('placa/:placa')
  @ApiOperation({ summary: 'Busca veículo por placa' })
  @ApiResponse({ status: 200, description: 'Veículo encontrado', type: VeiculoResponseDto })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  @ApiAuthResponses()
  async getByPlaca(@Param('placa') placa: string): Promise<VeiculoResponseDto> {
    const veiculo = await this.buscar.porPlaca(placa);
    return VeiculoResponseDto.fromDomain(veiculo);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza veículo' })
  @ApiResponse({ status: 200, description: 'Veículo atualizado', type: VeiculoResponseDto })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  @ApiAuthResponses()
  @ApiValidationResponses()
  async update(
    @Param('id') id: string,
    @Body() dto: AtualizarVeiculoDto,
  ): Promise<VeiculoResponseDto> {
    const veiculo = await this.atualizar.execute({ id, ...dto });
    return VeiculoResponseDto.fromDomain(veiculo);
  }
}
