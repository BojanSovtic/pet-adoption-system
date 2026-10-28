import type { ValidationIssue } from '@pet-adoption/models';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: ValidationIssue[],
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

export class UnauthorizedError extends AppError {
  constructor(code: string) {
    super(code, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(code: string) {
    super(code, 403);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(code: string) {
    super(code, 409);
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends AppError {
  constructor(code: string) {
    super(code, 429);
    this.name = 'TooManyRequestsError';
  }
}

export class ValidationError extends AppError {
  constructor(details: ValidationIssue[]) {
    super('VALIDATION_FAILED', 400, details);
    this.name = 'ValidationError';
  }
}
