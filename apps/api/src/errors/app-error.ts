export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(code);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(code: string) {
    super(code, 404);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends AppError {
  constructor(code: string) {
    super(code, 400);
    this.name = 'BadRequestError';
  }
}
