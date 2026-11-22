import { Component, inject } from '@angular/core';
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
        <button type="button" class="btn btn--ghost btn--small" (click)="auth.logout()">
          Sign out
        </button>
      </div>
    </header>
    <main id="main" class="app-main" tabindex="-1">
      <router-outlet />
    </main>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
}
