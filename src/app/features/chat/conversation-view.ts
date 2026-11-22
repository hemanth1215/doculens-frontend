import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { QUESTION_MAX_LENGTH } from '../../core/api/api-config';
import { ApiError, friendlyMessage } from '../../core/api/api-error';
import {
  ConversationResponse,
  ErrorCode,
  MessageResponse,
  StreamEvent,
} from '../../core/api/api-models';
import { ConversationsApi } from '../../core/api/conversations-api';
import { ChatStreamService } from '../../core/chat/chat-stream.service';
import { CitationList } from '../../shared/citation-list';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { ErrorAlert } from '../../shared/error-alert';
import { LoadingIndicator } from '../../shared/loading-indicator';
import { StatusBadge } from '../../shared/status-badge';

/** A message as displayed: a stored message, or one being streamed right now. */
export interface ChatItem extends MessageResponse {
  /** User-facing error for FAILED answers. */
  errorMessage?: string;
}

let localIds = 0;

/**
 * One conversation: its document scope, message history with citations, and the question box. Answers stream in
 * token by token; "Stop" aborts the request (the backend keeps the partial answer as INTERRUPTED).
 */
@Component({
  selector: 'dl-conversation-view',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    CitationList,
    ErrorAlert,
    LoadingIndicator,
    StatusBadge,
    ConfirmDialog,
  ],
  templateUrl: './conversation-view.html',
})
export class ConversationView {
  private readonly conversationsApi = inject(ConversationsApi);
  private readonly chatStream = inject(ChatStreamService);

  readonly conversationId = input.required<string>();
  /** Emitted when the conversation's title or activity changed, so the list can refresh. */
  readonly changed = output<void>();
  readonly deleted = output<void>();

  protected readonly maxLength = QUESTION_MAX_LENGTH;
  protected readonly conversation = signal<ConversationResponse | null>(null);
  protected readonly messages = signal<ChatItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly askError = signal<string | null>(null);
  protected readonly streaming = signal(false);
  protected readonly announcement = signal('');
  protected readonly renaming = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly question = inject(NonNullableFormBuilder).control('', [
    Validators.required,
    Validators.maxLength(QUESTION_MAX_LENGTH),
    Validators.pattern(/.*\S.*/s),
  ]);
  protected readonly renameControl = inject(NonNullableFormBuilder).control('', [
    Validators.required,
    Validators.maxLength(200),
    Validators.pattern(/.*\S.*/),
  ]);

  protected readonly unavailableDocuments = computed(
    () => this.conversation()?.documents.filter((d) => d.status !== 'READY').length ?? 0,
  );
  protected readonly questionLength = signal(0);

  private streamSubscription: Subscription | undefined;
  private readonly messageList = viewChild<ElementRef<HTMLElement>>('messageList');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.streamSubscription?.unsubscribe());
    this.question.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.questionLength.set(value.length));

    effect(() => {
      const id = this.conversationId();
      untracked(() => {
        this.stop();
        this.load(id);
      });
    });

    // Keep the newest message in view while an answer streams in.
    effect(() => {
      this.messages();
      const element = this.messageList()?.nativeElement;
      if (element) {
        queueMicrotask(() => element.scrollTo?.({ top: element.scrollHeight }));
      }
    });
  }

  protected load(id: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.askError.set(null);
    forkJoin({
      conversation: this.conversationsApi.get(id),
      messages: this.conversationsApi.messages(id),
    }).subscribe({
      next: ({ conversation, messages }) => {
        this.conversation.set(conversation);
        this.messages.set(messages.items.map((m) => this.withErrorText(m)));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(ApiError.from(error).message);
      },
    });
  }

  protected onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.ask();
    }
  }

  protected ask(text?: string): void {
    const question = (text ?? this.question.value).trim();
    if (!question || question.length > QUESTION_MAX_LENGTH || this.streaming()) {
      this.question.markAsTouched();
      return;
    }
    const conversationId = this.conversationId();
    const now = new Date().toISOString();
    const userId = `local-user-${++localIds}`;
    let answerId = `local-answer-${localIds}`;
    this.messages.update((items) => [
      ...items,
      this.localMessage(userId, 'USER', question, 'COMPLETE', now),
      this.localMessage(answerId, 'ASSISTANT', '', 'STREAMING', now),
    ]);
    this.question.reset('');
    this.askError.set(null);
    this.streaming.set(true);
    this.announcement.set('DocuLens is answering…');

    this.streamSubscription = this.chatStream.ask(conversationId, question).subscribe({
      next: (event) => {
        answerId = this.apply(event, userId, answerId);
      },
      error: (error: unknown) => {
        // Rejected before streaming (for example another answer is in progress): undo the optimistic messages.
        this.messages.update((items) => items.filter((m) => m.id !== userId && m.id !== answerId));
        this.question.setValue(question);
        this.finishStreaming(ApiError.from(error).message);
        this.askError.set(ApiError.from(error).message);
      },
      complete: () => {
        this.updateMessage(answerId, (m) =>
          m.status === 'STREAMING' ? { ...m, status: 'INTERRUPTED' } : m,
        );
        this.finishStreaming();
        this.changed.emit();
      },
    });
  }

  /** Stops the current answer; the partial text stays visible and is stored as INTERRUPTED by the backend. */
  protected stop(): void {
    if (!this.streamSubscription || this.streamSubscription.closed) {
      return;
    }
    this.streamSubscription.unsubscribe();
    this.messages.update((items) =>
      items.map((m) => (m.status === 'STREAMING' ? { ...m, status: 'INTERRUPTED' } : m)),
    );
    this.finishStreaming('Answer stopped.');
    this.changed.emit();
  }

  /** Asks the question of a failed or interrupted answer again. */
  protected retry(answer: ChatItem): void {
    const items = this.messages();
    const index = items.indexOf(answer);
    const question = items
      .slice(0, index)
      .reverse()
      .find((m) => m.role === 'USER');
    if (question) {
      this.ask(question.content);
    }
  }

  protected startRename(): void {
    this.renameControl.setValue(this.conversation()?.title ?? '');
    this.renaming.set(true);
  }

  protected saveRename(): void {
    if (this.renameControl.invalid) {
      this.renameControl.markAsTouched();
      return;
    }
    this.actionError.set(null);
    this.conversationsApi
      .update(this.conversationId(), { title: this.renameControl.value.trim() })
      .subscribe({
        next: (conversation) => {
          this.conversation.set(conversation);
          this.renaming.set(false);
          this.changed.emit();
        },
        error: (error: unknown) => this.actionError.set(ApiError.from(error).message),
      });
  }

  protected confirmDelete(): void {
    this.confirmingDelete.set(false);
    this.stop();
    this.conversationsApi.delete(this.conversationId()).subscribe({
      next: () => this.deleted.emit(),
      error: (error: unknown) => this.actionError.set(ApiError.from(error).message),
    });
  }

  /** Applies one stream event; returns the (possibly server-assigned) id of the answer being streamed. */
  private apply(event: StreamEvent, userId: string, answerId: string): string {
    switch (event.event) {
      case 'message.created': {
        const serverAnswerId = event.data.assistantMessageId;
        this.messages.update((items) =>
          items.map((m) =>
            m.id === userId
              ? { ...m, id: event.data.userMessageId }
              : m.id === answerId
                ? { ...m, id: serverAnswerId }
                : m,
          ),
        );
        return serverAnswerId;
      }
      case 'token':
        this.updateMessage(answerId, (m) => ({ ...m, content: m.content + event.data.delta }));
        return answerId;
      case 'citations':
        this.updateMessage(answerId, (m) => ({
          ...m,
          grounded: event.data.grounded,
          citations: event.data.citations,
        }));
        return answerId;
      case 'done':
        this.updateMessage(answerId, (m) => ({ ...m, status: event.data.status }));
        this.announcement.set('Answer ready.');
        return answerId;
      case 'error':
        this.updateMessage(answerId, (m) => ({
          ...m,
          status: 'FAILED',
          errorCode: event.data.code,
          errorMessage: event.data.message,
        }));
        this.announcement.set(`The answer failed: ${event.data.message}`);
        return answerId;
    }
  }

  private finishStreaming(announcement?: string): void {
    this.streaming.set(false);
    if (announcement) {
      this.announcement.set(announcement);
    }
  }

  private updateMessage(id: string, change: (message: ChatItem) => ChatItem): void {
    this.messages.update((items) => items.map((m) => (m.id === id ? change(m) : m)));
  }

  private withErrorText(message: MessageResponse): ChatItem {
    return message.status === 'FAILED' && message.errorCode
      ? { ...message, errorMessage: friendlyMessage(message.errorCode as ErrorCode) }
      : message;
  }

  private localMessage(
    id: string,
    role: ChatItem['role'],
    content: string,
    status: ChatItem['status'],
    createdAt: string,
  ): ChatItem {
    return { id, role, content, status, grounded: null, errorCode: null, citations: [], createdAt };
  }
}
