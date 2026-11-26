import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

/** The interceptor waits for the token promise, so requests reach the backend one tick later. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const auth = {
    accessToken: vi.fn<() => string | null>(),
    validAccessToken: vi.fn<() => Promise<string | null>>(),
    refreshAccessToken: vi.fn<() => Promise<string>>(),
    isAuthenticated: vi.fn<() => boolean>(),
    sessionExpired: vi.fn(),
  };

  beforeEach(() => {
    Object.values(auth).forEach((mock) => mock.mockReset());
    auth.isAuthenticated.mockReturnValue(true);
    auth.accessToken.mockReturnValue('abc');
    auth.validAccessToken.mockResolvedValue('abc');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('adds the bearer token to API calls', async () => {
    http.get('/api/v1/documents').subscribe();
    await settle();
    expect(backend.expectOne('/api/v1/documents').request.headers.get('Authorization')).toBe(
      'Bearer abc',
    );
  });

  it('never sends the token to other origins', () => {
    http.get('https://example.com/api/v1/documents').subscribe();
    expect(
      backend
        .expectOne('https://example.com/api/v1/documents')
        .request.headers.has('Authorization'),
    ).toBe(false);
    expect(auth.validAccessToken).not.toHaveBeenCalled();
  });

  it('never sends the token to the cookie-based and public auth endpoints', () => {
    for (const path of ['login', 'register', 'refresh', 'logout']) {
      http.post(`/api/v1/auth/${path}`, null).subscribe();
      expect(backend.expectOne(`/api/v1/auth/${path}`).request.headers.has('Authorization')).toBe(
        false,
      );
    }
    expect(auth.validAccessToken).not.toHaveBeenCalled();
  });

  it('sends logout-all with the bearer token', async () => {
    http.post('/api/v1/auth/logout-all', null).subscribe();
    await settle();
    expect(backend.expectOne('/api/v1/auth/logout-all').request.headers.get('Authorization')).toBe(
      'Bearer abc',
    );
  });

  it('sends no header when signed out', async () => {
    auth.validAccessToken.mockResolvedValue(null);
    http.get('/api/v1/documents').subscribe();
    await settle();
    expect(backend.expectOne('/api/v1/documents').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes and retries once when the API answers 401', async () => {
    auth.refreshAccessToken.mockResolvedValue('fresh');
    let body: unknown;
    http.get('/api/v1/documents').subscribe((b) => (body = b));
    await settle();
    backend
      .expectOne('/api/v1/documents')
      .flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });
    await settle();

    const retry = backend.expectOne('/api/v1/documents');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh');
    retry.flush({ items: [] });

    expect(body).toEqual({ items: [] });
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(auth.sessionExpired).not.toHaveBeenCalled();
  });

  it('retries with a token another request already refreshed, without refreshing again', async () => {
    http.get('/api/v1/documents').subscribe();
    await settle();
    auth.accessToken.mockReturnValue('already-fresh');
    backend
      .expectOne('/api/v1/documents')
      .flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });
    await settle();

    expect(backend.expectOne('/api/v1/documents').request.headers.get('Authorization')).toBe(
      'Bearer already-fresh',
    );
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('ends the session when the retry is rejected too', async () => {
    auth.refreshAccessToken.mockResolvedValue('fresh');
    let failed = false;
    http.get('/api/v1/documents').subscribe({ error: () => (failed = true) });
    await settle();
    backend
      .expectOne('/api/v1/documents')
      .flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });
    await settle();
    backend
      .expectOne('/api/v1/documents')
      .flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBe(true);
    expect(auth.sessionExpired).toHaveBeenCalledTimes(1);
  });

  it('passes other errors through without refreshing', async () => {
    let status = 0;
    http
      .get('/api/v1/documents')
      .subscribe({ error: (e: { status: number }) => (status = e.status) });
    await settle();
    backend
      .expectOne('/api/v1/documents')
      .flush({ code: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });

    expect(status).toBe(429);
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('leaves failed sign-in attempts to the form', () => {
    http.post('/api/v1/auth/login', {}).subscribe({ error: () => undefined });
    backend
      .expectOne('/api/v1/auth/login')
      .flush({ code: 'INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
    expect(auth.sessionExpired).not.toHaveBeenCalled();
  });
});
