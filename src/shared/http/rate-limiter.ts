import { AppError } from '../errors/app-error.js';

// Rate limit em memória, por instância — evita abuso num único processo. Em ambiente com
// múltiplas instâncias (serverless, réplicas) o limite não é global; é uma barreira, não uma
// garantia — o Apigee assume esse papel quando entrar (quota/spike arrest por tenant).
export class RateLimiter {
  private attempts = new Map<string, { count: number; firstAt: number }>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly errorMessage: string,
    private readonly errorCode: string,
  ) {}

  check(key: string): void {
    const entry = this.attempts.get(key);
    if (!entry) return;
    if (Date.now() - entry.firstAt > this.windowMs) {
      this.attempts.delete(key);
      return;
    }
    if (entry.count >= this.maxAttempts) {
      throw new AppError(this.errorMessage, { code: this.errorCode, statusCode: 429 });
    }
  }

  record(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAt > this.windowMs) {
      this.attempts.set(key, { count: 1, firstAt: now });
      return;
    }
    entry.count += 1;
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}
