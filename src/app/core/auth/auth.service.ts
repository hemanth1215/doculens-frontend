import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, map, switchMap } from 'rxjs';
import { API_BASE_URL } from '../api/api-config';
import { LoginRequest, RegisterRequest, TokenResponse, UserResponse } from '../api/api-models';

interface Session {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly user: UserResponse;
}

export type SignOutReason = 'signed-out' | 'expired';

/** Required on the cookie-authenticated endpoints (refresh, logout): a CSRF defence, see ADR-045. */
const CLIENT_HEADERS = new HttpHeaders({ 'X-DocuLens-Client': 'web' });
/** Web Locks name: tabs of this browser share the refresh cookie, so they take turns refreshing. */
const REFRESH_LOCK = 'doculens-auth-refresh';
/** A token is treated as expired this long before its real expiry, so it never dies in flight. */
const EXPIRY_MARGIN_MS = 30_000;
const CONFLICT_RETRY_DELAY_MS = 300;

/**
 * The signed-in user's session (ADR-001, ADR-048).
 *
 * - The **access token** lives in memory only (never localStorage), so an XSS bug cannot read a stored token.
 * - The **refresh token** is an HttpOnly cookie that JavaScript cannot read at all. The browser sends it to
 *   `/api/v1/auth/refresh` and `/auth/logout` only.
 * - On start-up the app calls refresh once, so a page reload keeps you signed in.
 * - Expired tokens are refreshed on demand: when a request needs a token, or when the API answers 401. Concurrent
 *   requests share one refresh, and tabs take turns through the Web Locks API, so one refresh cookie is never used
 *   twice at the same time.
 * - When the refresh fails with 401 or 403 (session ended, revoked or expired) you are sent to sign in.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiBase = inject(API_BASE_URL);

  private readonly session = signal<Session | null>(null);
  private refreshing: Promise<string> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  /** True while a sign-in session exists, even if its access token needs refreshing. */
  readonly isAuthenticated = computed(() => this.session() !== null);

  /** Restores the session from the refresh cookie at start-up. Never fails: without a cookie you stay signed out. */
  async restoreSession(): Promise<void> {
    try {
      await this.refreshAccessToken();
    } catch {
      // No cookie, or an expired session: the app starts signed out.
    }
  }

  /** The current access token if it is still valid, otherwise null. No side effects. */
  accessToken(): string | null {
    const current = this.session();
    return current && Date.now() < current.expiresAt ? current.accessToken : null;
  }

  /** A usable access token: the current one, or a refreshed one. Null when signed out. */
  async validAccessToken(): Promise<string | null> {
    const token = this.accessToken();
    if (token || !this.isAuthenticated()) {
      return token;
    }
    return this.refreshAccessToken();
  }

  /**
   * Exchanges the refresh cookie for a new access token. Calls made while a refresh is running share it. A 401 or
   * 403 ends the session; other failures (network, 429, 5xx) are passed on and the session is kept.
   */
  refreshAccessToken(): Promise<string> {
    this.refreshing ??= this.withRefreshLock(() => this.requestRefresh()).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  login(credentials: LoginRequest): Observable<UserResponse> {
    return this.http.post<TokenResponse>(`${this.apiBase}/auth/login`, credentials).pipe(
      map((response) => {
        this.startSession(response);
        return response.user;
      }),
    );
  }

  /** Registers, then signs in with the same credentials (the contract's register returns no token). */
  register(request: RegisterRequest): Observable<UserResponse> {
    return this.http
      .post<UserResponse>(`${this.apiBase}/auth/register`, request)
      .pipe(switchMap(() => this.login({ email: request.email, password: request.password })));
  }

  /** Ends this session on the server (revokes it and clears the cookie), then signs out locally. */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post<void>(`${this.apiBase}/auth/logout`, null, { headers: CLIENT_HEADERS }),
      );
    } catch {
      // Sign out locally anyway; the session still expires on the server.
    }
    this.endSession('signed-out');
  }

  /**
   * Ends every session of this user, on every device. Rejects if the server could not be reached, so the caller can
   * say so; in that case the user stays signed in.
   */
  async logoutEverywhere(): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.apiBase}/auth/logout-all`, null));
    this.endSession('signed-out');
  }

  /** Called when the API keeps rejecting the session (401 even after a refresh). */
  sessionExpired(): void {
    if (this.session()) {
      this.endSession('expired');
    }
  }

  private async requestRefresh(isRetry = false): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post<TokenResponse>(`${this.apiBase}/auth/refresh`, null, {
          headers: CLIENT_HEADERS,
        }),
      );
      this.startSession(response);
      return response.accessToken;
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        // 409 REFRESH_CONFLICT: another tab rotated the cookie a moment ago. The browser now holds the new
        // cookie, so one retry succeeds.
        if (error.status === 409 && !isRetry) {
          await new Promise((resolve) => setTimeout(resolve, CONFLICT_RETRY_DELAY_MS));
          return this.requestRefresh(true);
        }
        if (error.status === 401 || error.status === 403 || error.status === 409) {
          this.endSession('expired');
        }
      }
      throw error;
    }
  }

  private withRefreshLock(refresh: () => Promise<string>): Promise<string> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    return locks ? locks.request(REFRESH_LOCK, refresh) : refresh();
  }

  private startSession(response: TokenResponse): void {
    const lifetimeMs = Math.max(0, response.expiresIn * 1000 - EXPIRY_MARGIN_MS);
    this.session.set({
      accessToken: response.accessToken,
      expiresAt: Date.now() + lifetimeMs,
      user: response.user,
    });
  }

  private endSession(reason: SignOutReason): void {
    const wasSignedIn = this.session() !== null;
    this.session.set(null);
    if (wasSignedIn) {
      const returnUrl =
        this.router.url && !this.router.url.startsWith('/login') ? this.router.url : undefined;
      void this.router.navigate(['/login'], {
        queryParams: { reason: reason === 'expired' ? 'expired' : undefined, returnUrl },
      });
    }
  }
}
