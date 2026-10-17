import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@oficina.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(6)
  senha!: string;
}
