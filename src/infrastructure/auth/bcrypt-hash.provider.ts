import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { IHashProvider } from '../../application/ports/hash-provider';

@Injectable()
export class BcryptHashProvider implements IHashProvider {
  private readonly saltRounds = 12;

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  compare(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }
}
