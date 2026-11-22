import { Component, input } from '@angular/core';

/** A polite "loading" status for screen readers plus a visible spinner. */
@Component({
  selector: 'dl-loading',
  template: `
    <div class="loading" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <span>{{ label() }}</span>
    </div>
  `,
})
export class LoadingIndicator {
  readonly label = input('Loading…');
}
