import { DestinosComandos } from '../application/ports/destinos-comandos';

export interface ConfigCatalogo {
  /** Base da API do Catalog, já com o prefixo (ex.: http://catalog/api/catalog). */
  urlBase: string;
  timeoutMs: number;
}

/** Valores já validados por validarAmbiente no boot. */
export function lerDestinosComandos(env: NodeJS.ProcessEnv): DestinosComandos {
  return {
    catalog: env.CATALOG_COMMANDS_QUEUE_URL ?? '',
    billing: env.BILLING_COMMANDS_QUEUE_URL ?? '',
    execution: env.EXECUTION_COMMANDS_QUEUE_URL ?? '',
  };
}

export function lerConfigCatalogo(env: NodeJS.ProcessEnv): ConfigCatalogo {
  const url = env.CATALOG_BASE_URL ?? '';
  const timeout = env.CATALOG_TIMEOUT_MS;
  return {
    urlBase: url.endsWith('/') ? url.slice(0, -1) : url,
    timeoutMs: timeout === undefined || timeout === '' ? 3000 : Number(timeout),
  };
}
