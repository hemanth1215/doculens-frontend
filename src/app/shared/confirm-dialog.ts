import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

/**
 * A modal confirmation using the native <dialog> element, which provides focus trapping, Escape to cancel and
 * inert background content.
 */
@Component({
  selector: 'dl-confirm-dialog',
  template: `
    <dialog #dialog class="dialog" [attr.aria-labelledby]="titleId" (cancel)="onCancel($event)">
      <h2 class="dialog__title" [id]="titleId">{{ title() }}</h2>
      <p class="dialog__body">{{ message() }}</p>
      <div class="dialog__actions">
        <button type="button" class="btn btn--secondary" (click)="cancelled.emit()">Cancel</button>
        <button
          type="button"
          class="btn"
          [class.btn--danger]="danger()"
          (click)="confirmed.emit()"
          autofocus
        >
          {{ confirmLabel() }}
        </button>
      </div>
    </dialog>
  `,
})
export class ConfirmDialog {
  private static nextId = 0;

  readonly open = input(false);
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly danger = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly titleId = `dl-confirm-title-${ConfirmDialog.nextId++}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        if (typeof element.showModal === 'function') {
          element.showModal();
        } else {
          element.setAttribute('open', '');
        }
      } else if (!this.open() && element.open) {
        if (typeof element.close === 'function') {
          element.close();
        } else {
          element.removeAttribute('open');
        }
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault(); // keep open/closed state owned by the parent
    this.cancelled.emit();
  }
}
