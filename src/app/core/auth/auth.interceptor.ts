import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../api/api-config';
import { AuthService } from './auth.service';

/** Adds the bearer token to DocuLens API calls only (never to third-party URLs). */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const apiBase = inject(API_BASE_URL);
  if (!request.url.startsWith(apiBase)) {
    return next(request);
  }
  const token = inject(AuthService).accessToken();
  return next(
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request,
  );
};

/**
 * A 401 from a protected API call means the token is missing, expired or revoked: end the session so the user is sent
 * to sign in. Failed sign-in attempts (also 401) are left to the form to display.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (request, next) => {
  const apiBase = inject(API_BASE_URL);
  const auth = inject(AuthService);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        request.url.startsWith(apiBase) &&
        !request.url.startsWith(`${apiBase}/auth/`)
      ) {
        auth.sessionExpired();
      }
      return throwError(() => error);
    }),
  );
};
