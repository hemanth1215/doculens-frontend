import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { authGuard, guestGuard } from './auth.guards';
import { AuthService } from './auth.service';

describe('auth guards', () => {
  const auth = { isAuthenticated: vi.fn<() => boolean>() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
  });

  const run = (guard: typeof authGuard, url = '/chat/1') =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );

  it('lets signed-in users through and redirects others to sign in with a return URL', () => {
    auth.isAuthenticated.mockReturnValue(true);
    expect(run(authGuard)).toBe(true);

    auth.isAuthenticated.mockReturnValue(false);
    const redirect = run(authGuard) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(redirect)).toBe('/login?returnUrl=%2Fchat%2F1');
  });

  it('keeps signed-in users away from the sign-in page', () => {
    auth.isAuthenticated.mockReturnValue(false);
    expect(run(guestGuard)).toBe(true);

    auth.isAuthenticated.mockReturnValue(true);
    expect(TestBed.inject(Router).serializeUrl(run(guestGuard) as UrlTree)).toBe('/documents');
  });
});
