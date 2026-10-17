import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { LoginUseCase } from '../../application/auth/login/LoginUseCase';
import { RegistrarUsuarioUseCase } from '../../application/auth/registrar-usuario/RegistrarUsuarioUseCase';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '8h', algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [LoginUseCase, RegistrarUsuarioUseCase],
})
export class AuthModule {}
