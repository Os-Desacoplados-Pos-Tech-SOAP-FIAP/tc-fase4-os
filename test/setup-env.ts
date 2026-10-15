import 'reflect-metadata';
process.env.DATABASE_URL ??= 'postgresql://os:os@localhost:5433/os_test?schema=public';
process.env.JWT_SECRET ??= 'segredo-de-teste';
process.env.INTERNAL_SERVICE_TOKEN ??= 'token-interno-de-teste';
process.env.CATALOG_BASE_URL ??= 'http://catalog.teste/api/catalog';
process.env.MESSAGING_ENABLED = 'false';
process.env.INBOX_QUEUE_URL ??= 'http://localhost:4566/000000000000/oficina-os-inbox.fifo';
process.env.CATALOG_COMMANDS_QUEUE_URL ??=
  'http://localhost:4566/000000000000/oficina-catalog-inbox.fifo';
process.env.BILLING_COMMANDS_QUEUE_URL ??=
  'http://localhost:4566/000000000000/oficina-billing-inbox.fifo';
process.env.EXECUTION_COMMANDS_QUEUE_URL ??=
  'http://localhost:4566/000000000000/oficina-execution-inbox.fifo';
