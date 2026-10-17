import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AtualizarClienteUseCase } from '../../application/cliente/atualizar-cliente/AtualizarClienteUseCase';
import { BuscarClienteUseCase } from '../../application/cliente/buscar-cliente/BuscarClienteUseCase';
import { CadastrarClienteUseCase } from '../../application/cliente/cadastrar-cliente/CadastrarClienteUseCase';
import { ListarClientesUseCase } from '../../application/cliente/listar-clientes/ListarClientesUseCase';
import { PerfilAcesso } from '../../common/auth/perfil';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiAuthResponses,
  ApiValidationResponses,
} from '../../common/decorators/swagger';
import { AtualizarClienteDto } from './dto/atualizar-cliente.dto';
import { ClienteResponseDto } from './dto/cliente-response.dto';
import { CriarClienteDto } from './dto/criar-cliente.dto';

@ApiTags('Clientes')
@ApiBearerAuth()
@Roles(PerfilAcesso.ATENDENTE, PerfilAcesso.ADMINISTRADOR)
@Controller('clientes')
export class ClienteController {
  constructor(
    private readonly cadastrar: CadastrarClienteUseCase,
    private readonly buscar: BuscarClienteUseCase,
    private readonly atualizar: AtualizarClienteUseCase,
    private readonly listar: ListarClientesUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Cadastra um novo cliente',
    description: 'Cria um cliente PF (CPF) ou PJ (CNPJ). Documento deve ser único.',
  })
  @ApiResponse({ status: 201, description: 'Cliente criado', type: ClienteResponseDto })
  @ApiResponse({ status: 409, description: 'CPF/CNPJ já cadastrado' })
  @ApiAuthResponses()
  @ApiValidationResponses()
  async create(@Body() dto: CriarClienteDto): Promise<ClienteResponseDto> {
    const cliente = await this.cadastrar.execute(dto);
    return ClienteResponseDto.fromDomain(cliente);
  }

  @Get()
  @ApiOperation({ summary: 'Lista clientes', description: 'Retorna todos os clientes cadastrados.' })
  @ApiResponse({ status: 200, description: 'Lista retornada', type: ClienteResponseDto, isArray: true })
  @ApiAuthResponses()
  async list(): Promise<ClienteResponseDto[]> {
    const clientes = await this.listar.execute();
    return clientes.map((c) => ClienteResponseDto.fromDomain(c));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca cliente por ID' })
  @ApiResponse({ status: 200, description: 'Cliente encontrado', type: ClienteResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  @ApiAuthResponses()
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<ClienteResponseDto> {
    const cliente = await this.buscar.porId(id);
    return ClienteResponseDto.fromDomain(cliente);
  }

  @Get('documento/:documento')
  @ApiOperation({ summary: 'Busca cliente por documento (CPF/CNPJ)' })
  @ApiResponse({ status: 200, description: 'Cliente encontrado', type: ClienteResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  @ApiAuthResponses()
  async getByDocumento(@Param('documento') documento: string): Promise<ClienteResponseDto> {
    const cliente = await this.buscar.porDocumento(documento);
    return ClienteResponseDto.fromDomain(cliente);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza cliente', description: 'Atualiza nome, email ou telefone.' })
  @ApiResponse({ status: 200, description: 'Cliente atualizado', type: ClienteResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  @ApiAuthResponses()
  @ApiValidationResponses()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarClienteDto,
  ): Promise<ClienteResponseDto> {
    const cliente = await this.atualizar.execute({ id, ...dto });
    return ClienteResponseDto.fromDomain(cliente);
  }
}
