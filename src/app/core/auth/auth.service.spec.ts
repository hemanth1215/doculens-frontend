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
const REFRESHED: TokenResponse = { ...TOKEN, accessToken: 'refreshed.access.token' };

/** Lets pending promise callbacks (and therefore queued HTTP requests) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  function signIn(response: TokenResponse = TOKEN): void {
    auth.login({ email: 'me@example.com', password: 'pw' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(response);
  }

  it('signs in and keeps the access token in memory only', () => {
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

  it('restores the session from the refresh cookie at start-up (a reload stays signed in)', async () => {
    const restored = auth.restoreSession();

    const request = http.expectOne('/api/v1/auth/refresh');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-DocuLens-Client')).toBe('web');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(TOKEN);
    await restored;

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.accessToken()).toBe(TOKEN.accessToken);
  });

  it('starts signed out, without redirecting, when there is no valid refresh cookie', async () => {
    const restored = auth.restoreSession();
    http
      .expectOne('/api/v1/auth/refresh')
      .flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });
    await restored;

    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('shares one refresh between concurrent callers', async () => {
    signIn();
    const first = auth.refreshAccessToken();
    const second = auth.refreshAccessToken();
    await settle();

    http.expectOne('/api/v1/auth/refresh').flush(REFRESHED);

    await expect(first).resolves.toBe(REFRESHED.accessToken);
    await expect(second).resolves.toBe(REFRESHED.accessToken);
  });

  it('returns the current token without a request while it is valid', async () => {
    signIn();

    await expect(auth.validAccessToken()).resolves.toBe(TOKEN.accessToken);
    http.expectNone('/api/v1/auth/refresh');
  });

  it('refreshes an expired access token on demand instead of signing out', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    signIn({ ...TOKEN, expiresIn: 60 });
    vi.setSystemTime(Date.now() + 61_000);

    expect(auth.accessToken()).toBeNull();
    expect(auth.isAuthenticated()).toBe(true);
    const token = auth.validAccessToken();
    await settle();
    http.expectOne('/api/v1/auth/refresh').flush(REFRESHED);

    await expect(token).resolves.toBe(REFRESHED.accessToken);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('retries once when another tab rotated the cookie at the same moment (409)', async () => {
    signIn();
    const token = auth.refreshAccessToken();
    await settle();
    http
      .expectOne('/api/v1/auth/refresh')
      .flush({ code: 'REFRESH_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    await new Promise((resolve) => setTimeout(resolve, 350));

    http.expectOne('/api/v1/auth/refresh').flush(REFRESHED);

    await expect(token).resolves.toBe(REFRESHED.accessToken);
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('ends the session and redirects to sign in when the refresh is rejected', async () => {
    signIn();
    const token = auth.refreshAccessToken();
    await settle();
    http
      .expectOne('/api/v1/auth/refresh')
      .flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });

    await expect(token).rejects.toBeTruthy();
    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: expect.objectContaining({ reason: 'expired' }),
    });
  });

  it('keeps the session when a refresh fails for a temporary reason', async () => {
    signIn();
    const token = auth.refreshAccessToken();
    await settle();
    http
      .expectOne('/api/v1/auth/refresh')
      .flush({ code: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });

    await expect(token).rejects.toBeTruthy();
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('signs out on the server, then locally', async () => {
    signIn();

    const done = auth.logout();
    const request = http.expectOne('/api/v1/auth/logout');
    expect(request.request.headers.get('X-DocuLens-Client')).toBe('web');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await done;

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.accessToken()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('still signs out locally when the server cannot be reached', async () => {
    signIn();

    const done = auth.logout();
    http.expectOne('/api/v1/auth/logout').error(new ProgressEvent('error'));
    await done;

    expect(auth.isAuthenticated()).toBe(false);
  });

  it('signs out everywhere, and stays signed in if that fails', async () => {
    signIn();

    const failed = auth.logoutEverywhere();
    http.expectOne('/api/v1/auth/logout-all').error(new ProgressEvent('error'));
    await expect(failed).rejects.toBeTruthy();
    expect(auth.isAuthenticated()).toBe(true);

    const done = auth.logoutEverywhere();
    http
      .expectOne('/api/v1/auth/logout-all')
      .flush(null, { status: 204, statusText: 'No Content' });
    await done;
    expect(auth.isAuthenticated()).toBe(false);
  });
});
