import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

/** The signed-in layout: DocuLens branding, navigation and the current page. */
@Component({
  selector: 'dl-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="app-header">
      <a routerLink="/documents" class="brand" aria-label="DocuLens home">
        <span class="brand__mark" aria-hidden="true">◎</span>
        <span class="brand__text">
          <span class="brand__name">DocuLens</span>
          <span class="brand__tagline">Your documents. Clear answers.</span>
        </span>
      </a>
      <nav class="app-nav" aria-label="Main">
        <a routerLink="/documents" routerLinkActive="is-active" ariaCurrentWhenActive="page"
          >Documents</a
        >
        <a routerLink="/chat" routerLinkActive="is-active" ariaCurrentWhenActive="page">Chat</a>
      </nav>
      <div class="app-user">
        <span class="app-user__name" [title]="auth.user()?.email ?? ''">{{
          auth.user()?.displayName
        }}</span>
        <button
          type="button"
          class="btn btn--ghost btn--small"
          [disabled]="busy()"
          (click)="signOut()"
        >
          Sign out
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--small"
          title="Sign out on every browser and device"
          [disabled]="busy()"
          (click)="signOutEverywhere()"
        >
          Sign out everywhere
        </button>
      </div>
    </header>
    @if (signOutError()) {
      <p class="alert alert--error app-signout-error" role="alert">
        Could not sign out your other devices. Check your connection and try again.
      </p>
    }
    <main id="main" class="app-main" tabindex="-1">
      <router-outlet />
    </main>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly busy = signal(false);
  protected readonly signOutError = signal(false);

  protected async signOut(): Promise<void> {
    this.busy.set(true);
    await this.auth.logout();
    this.busy.set(false);
  }

  protected async signOutEverywhere(): Promise<void> {
    this.busy.set(true);
    this.signOutError.set(false);
    try {
      await this.auth.logoutEverywhere();
    } catch {
      this.signOutError.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
