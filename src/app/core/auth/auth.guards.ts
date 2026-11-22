import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Sends signed-out users to the sign-in page. This is a usability measure only: the backend authorizes every request
 * (CLAUDE.md security guardrail 6).
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.accessToken() !== null
    ? true
    : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps signed-in users away from the sign-in and registration pages. */
export const guestGuard: CanActivateFn = () => {
  return inject(AuthService).accessToken() === null
    ? true
    : inject(Router).createUrlTree(['/documents']);
};
