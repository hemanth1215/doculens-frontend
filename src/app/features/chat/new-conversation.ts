import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MAX_DOCUMENTS_PER_CONVERSATION } from '../../core/api/api-config';
import { ApiError } from '../../core/api/api-error';
import { ConversationResponse, DocumentResponse } from '../../core/api/api-models';
import { ConversationsApi } from '../../core/api/conversations-api';
import { DocumentsApi } from '../../core/api/documents-api';
import { ErrorAlert } from '../../shared/error-alert';
import { LoadingIndicator } from '../../shared/loading-indicator';

/** Starts a conversation: choose which READY documents it may answer from, optionally name it. */
@Component({
  selector: 'dl-new-conversation',
  imports: [FormsModule, RouterLink, ErrorAlert, LoadingIndicator],
  templateUrl: './new-conversation.html',
})
export class NewConversation implements OnInit {
  private readonly documentsApi = inject(DocumentsApi);
  private readonly conversationsApi = inject(ConversationsApi);

  readonly created = output<ConversationResponse>();

  protected readonly max = MAX_DOCUMENTS_PER_CONVERSATION;
  protected readonly documents = signal<DocumentResponse[]>([]);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly createError = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected title = '';

  protected readonly tooMany = computed(() => this.selected().size > this.max);
  protected readonly canCreate = computed(
    () => this.selected().size > 0 && !this.tooMany() && !this.creating(),
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.documentsApi.list(0, 100, ['READY']).subscribe({
      next: (page) => {
        this.documents.set(page.items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(ApiError.from(error).message);
      },
    });
  }

  protected toggle(id: string, checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected create(): void {
    if (!this.canCreate()) {
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    const title = this.title.trim();
    this.conversationsApi
      .create({ documentIds: [...this.selected()], ...(title ? { title } : {}) })
      .subscribe({
        next: (conversation) => {
          this.creating.set(false);
          this.created.emit(conversation);
        },
        error: (error: unknown) => {
          this.creating.set(false);
          this.createError.set(ApiError.from(error).message);
        },
      });
  }
}
