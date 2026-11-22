import { Component, input, output } from '@angular/core';

/** An error message announced to assistive technology, with an optional retry action. */
@Component({
  selector: 'dl-error-alert',
  template: `
    <div class="alert alert--error" role="alert">
      <p class="alert__message">{{ message() }}</p>
      @if (retryLabel()) {
        <button type="button" class="btn btn--secondary btn--small" (click)="retry.emit()">
          {{ retryLabel() }}
        </button>
      }
    </div>
  `,
})
export class ErrorAlert {
  readonly message = input.required<string>();
  /** Shows a retry button when set. */
  readonly retryLabel = input<string | null>(null);
  readonly retry = output<void>();
}
