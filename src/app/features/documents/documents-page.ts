import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UPLOAD_LIMITS } from '../../core/api/api-config';
import { ApiError } from '../../core/api/api-error';
import { DocumentResponse, PageMeta } from '../../core/api/api-models';
import { ConversationsApi } from '../../core/api/conversations-api';
import { DocumentsApi } from '../../core/api/documents-api';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { ErrorAlert } from '../../shared/error-alert';
import { FileSizePipe } from '../../shared/formatting';
import { LoadingIndicator } from '../../shared/loading-indicator';
import { ProgressBar } from '../../shared/progress-bar';
import { StatusBadge } from '../../shared/status-badge';
import { validatePdfFile } from './pdf-file-validation';

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 3000;

interface UploadState {
  fileName: string;
  percent: number | null;
}

interface UploadProblem {
  message: string;
  existingDocumentId?: string;
}

/** Upload PDFs and manage them: list with live status, open, ask about, delete. */
@Component({
  selector: 'dl-documents-page',
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
  templateUrl: './documents-page.html',
})
export class DocumentsPage implements OnInit {
  private readonly documentsApi = inject(DocumentsApi);
  private readonly conversationsApi = inject(ConversationsApi);
  private readonly router = inject(Router);

  protected readonly maxSize = UPLOAD_LIMITS.maxBytes;
  protected readonly documents = signal<DocumentResponse[]>([]);
  protected readonly pageMeta = signal<PageMeta | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly upload = signal<UploadState | null>(null);
  protected readonly uploadProblem = signal<UploadProblem | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly dragging = signal(false);
  protected readonly pendingDelete = signal<DocumentResponse | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly hasActiveProcessing = computed(() =>
    this.documents().some((d) => d.status === 'UPLOADED' || d.status === 'PROCESSING'),
  );

  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private currentPage = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pollTimer));
  }

  ngOnInit(): void {
    this.load(0);
  }

  protected load(page: number, quiet = false): void {
    clearTimeout(this.pollTimer);
    this.currentPage = page;
    if (!quiet) {
      this.loading.set(true);
      this.loadError.set(null);
    }
    this.documentsApi.list(page, PAGE_SIZE).subscribe({
      next: (result) => {
        this.documents.set(result.items);
        this.pageMeta.set(result);
        this.loading.set(false);
        this.loadError.set(null);
        this.schedulePoll();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        if (!quiet) {
          this.loadError.set(ApiError.from(error).message);
        } else {
          this.schedulePoll(); // a failed background refresh retries quietly
        }
      },
    });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow selecting the same file again
    if (file) {
      this.startUpload(file);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.startUpload(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected startUpload(file: File): void {
    this.notice.set(null);
    this.uploadProblem.set(null);
    const problem = validatePdfFile(file);
    if (problem) {
      this.uploadProblem.set({ message: problem });
      return;
    }
    this.upload.set({ fileName: file.name, percent: 0 });
    this.documentsApi.upload(file).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.upload.set({
            fileName: file.name,
            percent: event.total ? Math.round((event.loaded / event.total) * 100) : null,
          });
        } else if (event.type === HttpEventType.Response) {
          this.upload.set(null);
          this.notice.set(`“${file.name}” was uploaded. Processing has started.`);
          this.load(0, true);
        }
      },
      error: (error: unknown) => {
        this.upload.set(null);
        const apiError = ApiError.from(error);
        this.uploadProblem.set({
          message: apiError.message,
          existingDocumentId: apiError.existingDocumentId,
        });
      },
    });
  }

  protected askAbout(document: DocumentResponse): void {
    this.actionError.set(null);
    this.conversationsApi.create({ documentIds: [document.id] }).subscribe({
      next: (conversation) => void this.router.navigate(['/chat', conversation.id]),
      error: (error: unknown) => this.actionError.set(ApiError.from(error).message),
    });
  }

  protected confirmDelete(): void {
    const document = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!document) {
      return;
    }
    this.actionError.set(null);
    this.documentsApi.delete(document.id).subscribe({
      next: () => {
        this.documents.update((list) => list.filter((d) => d.id !== document.id));
        this.notice.set(`“${document.filename}” was deleted.`);
        this.load(this.currentPage, true);
      },
      error: (error: unknown) => this.actionError.set(ApiError.from(error).message),
    });
  }

  private schedulePoll(): void {
    if (this.hasActiveProcessing()) {
      this.pollTimer = setTimeout(() => this.load(this.currentPage, true), POLL_INTERVAL_MS);
    }
  }
}
