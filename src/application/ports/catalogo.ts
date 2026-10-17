/** Serviço ou insumo como o OS precisa dele: nome e preço para o snapshot do item. */
export interface ItemDoCatalogo {
  id: string;
  descricao: string;
  valorUnitario: number;
  /** Insumo não tem flag de ativo no Catalog: sempre true. */
  ativo: boolean;
}

/**
 * Consulta síncrona ao Catalog (spec §3), repassando o JWT de quem chamou o OS.
 * `null` = não existe; rede, timeout ou resposta fora do contrato → CatalogoIndisponivelError.
 */
export interface ICatalogo {
  buscarServico(id: string, autorizacao: string): Promise<ItemDoCatalogo | null>;
  buscarInsumo(id: string, autorizacao: string): Promise<ItemDoCatalogo | null>;
}
