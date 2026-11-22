import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor, unauthorizedInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('auth interceptors', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const auth = { accessToken: vi.fn<() => string | null>(), sessionExpired: vi.fn() };

  beforeEach(() => {
    auth.accessToken.mockReset();
    auth.sessionExpired.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, unauthorizedInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('adds the bearer token to API calls', () => {
    auth.accessToken.mockReturnValue('abc');
    http.get('/api/v1/documents').subscribe();
    expect(backend.expectOne('/api/v1/documents').request.headers.get('Authorization')).toBe(
      'Bearer abc',
    );
  });

  it('never sends the token to other origins', () => {
    auth.accessToken.mockReturnValue('abc');
    http.get('https://example.com/api/v1/documents').subscribe();
    expect(
      backend
        .expectOne('https://example.com/api/v1/documents')
        .request.headers.has('Authorization'),
    ).toBe(false);
  });

  it('sends no header when signed out', () => {
    auth.accessToken.mockReturnValue(null);
    http.get('/api/v1/documents').subscribe();
    expect(backend.expectOne('/api/v1/documents').request.headers.has('Authorization')).toBe(false);
  });

  it('ends the session on 401 from a protected endpoint', () => {
    auth.accessToken.mockReturnValue('expired');
    http.get('/api/v1/documents').subscribe({ error: () => undefined });
    backend
      .expectOne('/api/v1/documents')
      .flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.sessionExpired).toHaveBeenCalledTimes(1);
  });

  it('leaves failed sign-in attempts to the form', () => {
    auth.accessToken.mockReturnValue(null);
    http.post('/api/v1/auth/login', {}).subscribe({ error: () => undefined });
    backend
      .expectOne('/api/v1/auth/login')
      .flush({ code: 'INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.sessionExpired).not.toHaveBeenCalled();
  });
});
