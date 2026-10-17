import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_URL ??= 'postgresql://os:os@localhost:5433/os_test?schema=public';
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
