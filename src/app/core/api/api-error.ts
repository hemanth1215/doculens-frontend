import { HttpErrorResponse } from '@angular/common/http';
import { ErrorCode, Problem } from './api-models';

/** A failed API call, normalized from an RFC 9457 problem response or a network failure. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly fieldErrors: Readonly<Record<string, string>> = {},
    readonly existingDocumentId?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromProblem(status: number, problem: Partial<Problem> | null | undefined): ApiError {
    const code = problem?.code ?? (status === 0 ? 'NETWORK_ERROR' : 'INTERNAL_ERROR');
    const fieldErrors: Record<string, string> = {};
    for (const error of problem?.errors ?? []) {
      fieldErrors[error.field] ??= error.message;
    }
    return new ApiError(
      status,
      code,
      friendlyMessage(code, problem?.detail),
      fieldErrors,
      problem?.existingDocumentId,
      problem?.requestId,
    );
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) {
      return error;
    }
    if (error instanceof HttpErrorResponse) {
      const body = isProblem(error.error) ? error.error : null;
      return ApiError.fromProblem(error.status, body);
    }
    return new ApiError(0, 'NETWORK_ERROR', friendlyMessage('NETWORK_ERROR'));
  }
}

function isProblem(value: unknown): value is Partial<Problem> {
  return typeof value === 'object' && value !== null && 'code' in value;
}

/**
 * User-facing text per error code. Server `detail` strings are written to be safe for users, so they are used when
 * no better fixed text exists; internal details are never shown.
 */
export function friendlyMessage(code: ErrorCode | 'NETWORK_ERROR', detail?: string): string {
  switch (code) {
    case 'NETWORK_ERROR':
      return 'Cannot reach DocuLens. Check your connection and try again.';
    case 'INVALID_CREDENTIALS':
      return 'Invalid email or password.';
    case 'UNAUTHORIZED':
      return 'Your session has ended. Please sign in again.';
    case 'RESOURCE_NOT_FOUND':
      return detail ?? 'This item does not exist or you do not have access to it.';
    case 'RATE_LIMITED':
      return 'Too many requests. Please wait a moment and try again.';
    case 'AI_PROVIDER_UNAVAILABLE':
      return detail ?? 'The AI service is unavailable right now. Please try again.';
    case 'INTERNAL_ERROR':
      return 'Something went wrong on our side. Please try again.';
    default:
      return detail ?? 'The request could not be completed.';
  }
}
