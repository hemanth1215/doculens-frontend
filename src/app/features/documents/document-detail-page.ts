import { DatePipe } from '@angular/common';
import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { DocumentResponse } from '../../core/api/api-models';
import { ConversationsApi } from '../../core/api/conversations-api';
import { DocumentsApi } from '../../core/api/documents-api';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { ErrorAlert } from '../../shared/error-alert';
import { FileSizePipe } from '../../shared/formatting';
import { LoadingIndicator } from '../../shared/loading-indicator';
import { ProgressBar } from '../../shared/progress-bar';
import { StatusBadge } from '../../shared/status-badge';

const POLL_INTERVAL_MS = 3000;

/** One document: processing status and progress, errors with retry, delete. */
@Component({
  selector: 'dl-document-detail-page',
  imports: [
    RouterLink,
    DatePipe,
    FileSizePipe,
    StatusBadge,
    ProgressBar,
    ErrorAlert,
    LoadingIndicator,
    ConfirmDialog,
  ],
  templateUrl: './document-detail-page.html',
})
export class DocumentDetailPage {
  private readonly documentsApi = inject(DocumentsApi);
  private readonly conversationsApi = inject(ConversationsApi);
  private readonly router = inject(Router);

  /** Route parameter (router input binding). */
  readonly documentId = input.required<string>();

  protected readonly document = signal<DocumentResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);
  protected readonly busy = signal(false);

  private pollTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pollTimer));
    effect(() => {
      const id = this.documentId();
      untracked(() => this.load(id));
    });
  }

  protected load(id: string, quiet = false): void {
    clearTimeout(this.pollTimer);
    if (!quiet) {
      this.loading.set(true);
      this.loadError.set(null);
    }
    this.documentsApi.get(id).subscribe({
      next: (document) => {
        this.document.set(document);
        this.loading.set(false);
        if (document.status === 'UPLOADED' || document.status === 'PROCESSING') {
          this.pollTimer = setTimeout(() => this.load(id, true), POLL_INTERVAL_MS);
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.document.set(null);
        this.loadError.set(ApiError.from(error).message);
      },
    });
  }

  protected retry(): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.documentsApi.retry(this.documentId()).subscribe({
      next: (document) => {
        this.busy.set(false);
        this.document.set(document);
        this.load(document.id, true);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(ApiError.from(error).message);
      },
    });
  }

  protected askQuestions(): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.conversationsApi.create({ documentIds: [this.documentId()] }).subscribe({
      next: (conversation) => void this.router.navigate(['/chat', conversation.id]),
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(ApiError.from(error).message);
      },
    });
  }

  protected confirmDelete(): void {
    this.confirmingDelete.set(false);
    this.busy.set(true);
    this.documentsApi.delete(this.documentId()).subscribe({
      next: () => void this.router.navigate(['/documents']),
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(ApiError.from(error).message);
      },
    });
  }
}
