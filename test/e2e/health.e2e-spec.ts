import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { criarApp } from '../helpers/app';

describe('Health (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await criarApp()));
  afterAll(() => app.close());

  it('GET /api/os/health é público', async () => {
    await request(app.getHttpServer()).get('/api/os/health').expect(200, { status: 'ok' });
  });

  it('Swagger publicado em /api/os/docs', async () => {
    await request(app.getHttpServer()).get('/api/os/docs').expect(200);
  });
});
