import { Component, input } from '@angular/core';

/** Accessible progress bar; omit `value` for an indeterminate state. */
@Component({
  selector: 'dl-progress-bar',
  template: `
    <div
      class="progress"
      role="progressbar"
      [attr.aria-label]="label()"
      [attr.aria-valuemin]="value() === null ? null : 0"
      [attr.aria-valuemax]="value() === null ? null : 100"
      [attr.aria-valuenow]="value()"
      [class.progress--indeterminate]="value() === null"
    >
      <div class="progress__bar" [style.width.%]="value() ?? 100"></div>
    </div>
  `,
})
export class ProgressBar {
  readonly value = input<number | null>(null);
  readonly label = input.required<string>();
}
