import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TokenResponse } from '../api/api-models';
import { AuthService } from './auth.service';

const TOKEN: TokenResponse = {
  accessToken: 'header.payload.signature',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: { id: 'u1', email: 'me@example.com', displayName: 'Me', createdAt: '2026-01-01T00:00:00Z' },
};

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('signs in and keeps the token in memory only', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    let user: unknown;

    auth.login({ email: 'me@example.com', password: 'pw' }).subscribe((u) => (user = u));
    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'me@example.com', password: 'pw' });
    request.flush(TOKEN);

    expect(user).toEqual(TOKEN.user);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.displayName).toBe('Me');
    expect(auth.accessToken()).toBe(TOKEN.accessToken);
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain(TOKEN.accessToken);
  });

  it('registers and then signs in with the same credentials', () => {
    auth
      .register({
        email: 'new@example.com',
        password: 'Correct-Horse-Battery-9',
        displayName: 'New',
      })
      .subscribe();

    http
      .expectOne('/api/v1/auth/register')
      .flush({ ...TOKEN.user, email: 'new@example.com' }, { status: 201, statusText: 'Created' });
    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.body).toEqual({
      email: 'new@example.com',
      password: 'Correct-Horse-Battery-9',
    });
    login.flush(TOKEN);

    expect(auth.isAuthenticated()).toBe(true);
  });

  it('signs out locally and returns to the sign-in page', () => {
    auth.login({ email: 'me@example.com', password: 'pw' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(TOKEN);

    auth.logout();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.accessToken()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('expires the session when the token lifetime ends', () => {
    vi.useFakeTimers();
    auth.login({ email: 'me@example.com', password: 'pw' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush({ ...TOKEN, expiresIn: 60 });

    vi.advanceTimersByTime(60_000);

    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: expect.objectContaining({ reason: 'expired' }),
    });
  });
});
