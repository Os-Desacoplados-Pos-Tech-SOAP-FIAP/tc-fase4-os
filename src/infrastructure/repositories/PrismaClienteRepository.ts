import { Injectable } from '@nestjs/common';
import { Cliente as PrismaCliente, TipoCliente as PrismaTipoCliente } from '@prisma/client';

import { Cliente, TipoCliente } from '../../domain/cliente/entities/Cliente';
import { IClienteRepository } from '../../domain/cliente/repositories/IClienteRepository';
import { CNPJ } from '../../domain/cliente/value-objects/CNPJ';
import { CPF } from '../../domain/cliente/value-objects/CPF';
import { Email } from '../../domain/cliente/value-objects/Email';
import { Telefone } from '../../domain/cliente/value-objects/Telefone';
import { UniqueID } from '../../domain/shared/UniqueID';
import { PrismaTransactionManager } from '../database/prisma-transaction.manager';

@Injectable()
export class PrismaClienteRepository implements IClienteRepository {
  constructor(private readonly db: PrismaTransactionManager) {}

  private toDomain(row: PrismaCliente): Cliente {
    const tipo = row.tipo === PrismaTipoCliente.PF ? TipoCliente.PF : TipoCliente.PJ;
    return Cliente.restaurar(
      {
        tipo,
        documento: tipo === TipoCliente.PF ? CPF.create(row.documento) : CNPJ.create(row.documento),
        nome: row.nome,
        email: Email.create(row.email),
        telefone: row.telefone ? Telefone.create(row.telefone) : undefined,
        criadoEm: row.criadoEm,
        atualizadoEm: row.atualizadoEm,
      },
      new UniqueID(row.id),
    );
  }

  async salvar(cliente: Cliente): Promise<void> {
    const data = {
      tipo: cliente.tipo === TipoCliente.PF ? PrismaTipoCliente.PF : PrismaTipoCliente.PJ,
      documento: cliente.documento.value,
      nome: cliente.nome,
      email: cliente.email.value,
      telefone: cliente.telefone?.value ?? null,
    };
    await this.db.client.cliente.upsert({
      where: { id: cliente.id.toValue() },
      create: { id: cliente.id.toValue(), ...data },
      update: data,
    });
  }

  async buscarPorId(id: UniqueID): Promise<Cliente | null> {
    const row = await this.db.client.cliente.findUnique({ where: { id: id.toValue() } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorDocumento(documento: string): Promise<Cliente | null> {
    const cleaned = documento.replace(/\D/g, '');
    const row = await this.db.client.cliente.findUnique({ where: { documento: cleaned } });
    return row ? this.toDomain(row) : null;
  }

  async listar(): Promise<Cliente[]> {
    const rows = await this.db.client.cliente.findMany({ orderBy: { criadoEm: 'desc' } });
    return rows.map((r) => this.toDomain(r));
  }
}
