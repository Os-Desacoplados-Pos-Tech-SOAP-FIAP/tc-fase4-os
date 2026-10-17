import { Injectable } from '@nestjs/common';
import { Veiculo as PrismaVeiculo } from '@prisma/client';

import { UniqueID } from '../../domain/shared/UniqueID';
import { Veiculo } from '../../domain/veiculo/entities/Veiculo';
import { IVeiculoRepository } from '../../domain/veiculo/repositories/IVeiculoRepository';
import { Ano } from '../../domain/veiculo/value-objects/Ano';
import { Marca } from '../../domain/veiculo/value-objects/Marca';
import { Modelo } from '../../domain/veiculo/value-objects/Modelo';
import { Placa } from '../../domain/veiculo/value-objects/Placa';
import { PrismaTransactionManager } from '../database/prisma-transaction.manager';

@Injectable()
export class PrismaVeiculoRepository implements IVeiculoRepository {
  constructor(private readonly db: PrismaTransactionManager) {}

  private toDomain(row: PrismaVeiculo): Veiculo {
    return Veiculo.restaurar(
      {
        placa: Placa.create(row.placa),
        marca: Marca.create(row.marca),
        modelo: Modelo.create(row.modelo),
        ano: Ano.create(row.ano),
        clienteId: new UniqueID(row.clienteId),
        criadoEm: row.criadoEm,
        atualizadoEm: row.atualizadoEm,
      },
      new UniqueID(row.id),
    );
  }

  async salvar(veiculo: Veiculo): Promise<void> {
    const data = {
      placa: veiculo.placa.value,
      marca: veiculo.marca.value,
      modelo: veiculo.modelo.value,
      ano: veiculo.ano.value,
      clienteId: veiculo.clienteId.toValue(),
    };
    await this.db.client.veiculo.upsert({
      where: { id: veiculo.id.toValue() },
      create: { id: veiculo.id.toValue(), ...data },
      update: data,
    });
  }

  async buscarPorId(id: UniqueID): Promise<Veiculo | null> {
    const row = await this.db.client.veiculo.findUnique({ where: { id: id.toValue() } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorPlaca(placa: string): Promise<Veiculo | null> {
    const normalizada = placa.toUpperCase().replace(/[-\s]/g, '');
    const row = await this.db.client.veiculo.findUnique({ where: { placa: normalizada } });
    return row ? this.toDomain(row) : null;
  }

  async listar(): Promise<Veiculo[]> {
    const rows = await this.db.client.veiculo.findMany({ orderBy: { criadoEm: 'desc' } });
    return rows.map((r) => this.toDomain(r));
  }

  async listarPorCliente(clienteId: UniqueID): Promise<Veiculo[]> {
    const rows = await this.db.client.veiculo.findMany({
      where: { clienteId: clienteId.toValue() },
      orderBy: { criadoEm: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }
}
