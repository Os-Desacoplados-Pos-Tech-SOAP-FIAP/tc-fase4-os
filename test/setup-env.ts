import 'reflect-metadata';
process.env.DATABASE_URL ??= 'postgresql://os:os@localhost:5433/os_test?schema=public';
process.env.JWT_SECRET ??= 'segredo-de-teste';
process.env.MESSAGING_ENABLED = 'false';
process.env.INBOX_QUEUE_URL ??= 'http://localhost:4566/000000000000/oficina-os-inbox.fifo';
