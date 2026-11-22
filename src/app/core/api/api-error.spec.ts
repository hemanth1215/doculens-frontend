import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, friendlyMessage } from './api-error';

describe('ApiError', () => {
  it('reads code, detail, field errors and duplicate id from a problem response', () => {
    const error = ApiError.from(
      new HttpErrorResponse({
        status: 409,
        error: {
          type: 'https://doculens.dev/problems/document-already-exists',
          title: 'Document already exists',
          status: 409,
          code: 'DOCUMENT_ALREADY_EXISTS',
          detail: 'You have already uploaded this document.',
          existingDocumentId: 'doc-1',
          requestId: 'req-1',
        },
      }),
    );

    expect(error.status).toBe(409);
    expect(error.code).toBe('DOCUMENT_ALREADY_EXISTS');
    expect(error.message).toBe('You have already uploaded this document.');
    expect(error.existingDocumentId).toBe('doc-1');
    expect(error.requestId).toBe('req-1');
  });

  it('maps validation errors by field, keeping the first message per field', () => {
    const error = ApiError.fromProblem(400, {
      code: 'VALIDATION_FAILED',
      errors: [
        { field: 'password', message: 'size must be between 12 and 128' },
        { field: 'password', message: 'second' },
        { field: 'email', message: 'must be a well-formed email address' },
      ],
    });

    expect(error.fieldErrors).toEqual({
      password: 'size must be between 12 and 128',
      email: 'must be a well-formed email address',
    });
  });

  it('uses fixed friendly text for sensitive or technical codes', () => {
    expect(ApiError.fromProblem(401, { code: 'INVALID_CREDENTIALS', detail: 'x' }).message).toBe(
      'Invalid email or password.',
    );
    expect(
      ApiError.fromProblem(500, { code: 'INTERNAL_ERROR', detail: 'NullPointerException at ...' })
        .message,
    ).not.toContain('NullPointer');
  });

  it('treats non-problem failures as network or internal errors', () => {
    expect(ApiError.from(new HttpErrorResponse({ status: 0 })).code).toBe('NETWORK_ERROR');
    expect(
      ApiError.from(new HttpErrorResponse({ status: 502, error: '<html>Bad gateway</html>' })).code,
    ).toBe('INTERNAL_ERROR');
    expect(ApiError.from(new TypeError('Failed to fetch')).message).toBe(
      friendlyMessage('NETWORK_ERROR'),
    );
  });
});
