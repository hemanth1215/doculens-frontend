import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../api/api-config';
import { AuthService } from './auth.service';

/** Endpoints that never carry the bearer token (refresh and logout use the HttpOnly cookie instead). */
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

/**
 * Adds the bearer token to DocuLens API calls (never to other origins), refreshing it first when it has expired.
 * If the API still answers 401 (the token expired in flight, or the session was refreshed elsewhere), the request is
 * retried once with a refreshed token. A second 401 ends the session. Concurrent requests share one refresh.
 * Failed sign-in attempts (401 on /auth/login) are left to the form.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const apiBase = inject(API_BASE_URL);
  if (!request.url.startsWith(apiBase) || isPublicAuth(request, apiBase)) {
    return next(request);
  }
  const auth = inject(AuthService);
  let sentToken: string | null = null;
  const send = (token: string | null) => {
    sentToken = token;
    return next(
      token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request,
    );
  };

  return from(auth.validAccessToken()).pipe(
    switchMap((token) => send(token)),
    catchError((error: unknown) => {
      if (!isUnauthorized(error) || !auth.isAuthenticated()) {
        return throwError(() => error);
      }
      // Another request may already have refreshed the token while this one was in flight.
      const current = auth.accessToken();
      const retryToken =
        current && current !== sentToken ? Promise.resolve(current) : auth.refreshAccessToken();
      return from(retryToken).pipe(
        switchMap((token) => send(token)),
        catchError((retryError: unknown) => {
          if (isUnauthorized(retryError)) {
            auth.sessionExpired();
          }
          return throwError(() => retryError);
        }),
      );
    }),
  );
};

function isPublicAuth(request: HttpRequest<unknown>, apiBase: string): boolean {
  const path = request.url.slice(apiBase.length).split('?')[0];
  return PUBLIC_AUTH_PATHS.includes(path ?? '');
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}
