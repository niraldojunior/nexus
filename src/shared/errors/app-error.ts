export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  public constructor(message: string, options: { code: string; statusCode: number }) {
    super(message);
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.name = 'AppError';
  }
}
