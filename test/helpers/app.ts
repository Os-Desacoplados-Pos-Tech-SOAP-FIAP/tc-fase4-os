import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ICatalogo } from '../../src/application/ports/catalogo';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/app.setup';
import { INJECTION_TOKENS } from '../../src/common/constants/injection-tokens';
import { CatalogoEmMemoria } from '../fakes/catalogo-em-memoria';

/** App real com Postgres de teste; só o Catalog (REST externo) é substituído. */
export async function criarApp(catalogo: ICatalogo = new CatalogoEmMemoria()): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(INJECTION_TOKENS.CATALOGO)
    .useValue(catalogo)
    .compile();
  const app = modulo.createNestApplication({ logger: false });
  configurarApp(app);
  await app.init();
  return app;
}
