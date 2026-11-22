import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, map, switchMap } from 'rxjs';
import { API_BASE_URL } from '../api/api-config';
import { LoginRequest, RegisterRequest, TokenResponse, UserResponse } from '../api/api-models';

interface Session {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly user: UserResponse;
}

export type SignOutReason = 'signed-out' | 'expired';

/**
 * Holds the signed-in user's session. The access token is kept **in memory only** (ADR-001), never in localStorage
 * or cookies readable by scripts, so an XSS bug cannot read a stored token. Consequence: reloading the page or
 * letting the 15-minute token expire signs the user out (the backend has no refresh endpoint yet).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiBase = inject(API_BASE_URL);

  private readonly session = signal<Session | null>(null);
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.expiryTimer));
  }

  /** The bearer token for API calls, or null when signed out or expired. */
  accessToken(): string | null {
    const current = this.session();
    if (!current) {
      return null;
    }
    if (Date.now() >= current.expiresAt) {
      this.endSession('expired');
      return null;
    }
    return current.accessToken;
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

  /** Signs out locally. (The contract's /auth/logout revokes refresh cookies, which the backend does not issue yet.) */
  logout(): void {
    this.endSession('signed-out');
  }

  /** Called when the API rejects the token (401). */
  sessionExpired(): void {
    if (this.session()) {
      this.endSession('expired');
    }
  }

  private startSession(response: TokenResponse): void {
    // Expire a few seconds early so a request never leaves with a token that dies in flight.
    const lifetimeMs = Math.max(0, response.expiresIn * 1000 - 5000);
    this.session.set({
      accessToken: response.accessToken,
      expiresAt: Date.now() + lifetimeMs,
      user: response.user,
    });
    clearTimeout(this.expiryTimer);
    this.expiryTimer = setTimeout(() => this.endSession('expired'), lifetimeMs);
  }

  private endSession(reason: SignOutReason): void {
    clearTimeout(this.expiryTimer);
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
