import { Component, computed, input } from '@angular/core';
import { DocumentStatus } from '../core/api/api-models';

const LABELS: Record<DocumentStatus, string> = {
  UPLOADED: 'Queued',
  PROCESSING: 'Processing',
  READY: 'Ready',
  FAILED: 'Failed',
};

/** A document's processing status, shown as text plus color (never color alone). */
@Component({
  selector: 'dl-status-badge',
  template: `<span class="badge" [class]="'badge badge--' + status().toLowerCase()">{{
    label()
  }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<DocumentStatus>();
  protected readonly label = computed(() => LABELS[this.status()]);
}
