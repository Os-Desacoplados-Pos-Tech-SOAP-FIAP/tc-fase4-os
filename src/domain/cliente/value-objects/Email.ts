import { DomainError } from '../../shared/DomainError';
import { ValueObject } from '../../shared/ValueObject';

interface EmailProps {
  value: string;
}

export class Email extends ValueObject<EmailProps> {
  private static readonly REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  private constructor(props: EmailProps) {
    super(props);
  }

  public static create(input: string): Email {
    const value = (input ?? '').trim().toLowerCase();
    if (!Email.REGEX.test(value)) {
      throw new DomainError(`E-mail inválido: ${input}`, 'EMAIL_INVALIDO');
    }
    return new Email({ value });
  }

  public get value(): string {
    return this.props.value;
  }
}
