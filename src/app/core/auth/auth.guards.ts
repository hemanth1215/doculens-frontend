import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Sends signed-out users to the sign-in page. The session was restored from the refresh cookie at start-up
 * (`AuthService.restoreSession`), so a reload does not sign the user out. This is a usability measure only: the
 * backend authorizes every request (CLAUDE.md security guardrail 6).
 */
export const authGuard: CanActivateFn = (_route, state) => {
  return inject(AuthService).isAuthenticated()
    ? true
    : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps signed-in users away from the sign-in and registration pages. */
export const guestGuard: CanActivateFn = () => {
  return inject(AuthService).isAuthenticated()
    ? inject(Router).createUrlTree(['/documents'])
    : true;
};
