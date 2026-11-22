import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { ConversationResponse, ConversationSummary } from '../../core/api/api-models';
import { ConversationsApi } from '../../core/api/conversations-api';
import { ErrorAlert } from '../../shared/error-alert';
import { LoadingIndicator } from '../../shared/loading-indicator';
import { ConversationView } from './conversation-view';
import { NewConversation } from './new-conversation';

/** Chat: the conversation list next to the selected conversation (or the new-conversation form). */
@Component({
  selector: 'dl-chat-page',
  imports: [RouterLink, DatePipe, ErrorAlert, LoadingIndicator, ConversationView, NewConversation],
  templateUrl: './chat-page.html',
})
export class ChatPage implements OnInit {
  private readonly conversationsApi = inject(ConversationsApi);
  private readonly router = inject(Router);

  /** Route parameter (router input binding); absent on /chat. */
  readonly conversationId = input<string>();

  protected readonly conversations = signal<ConversationSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly creatingNew = signal(false);
  protected readonly showNewForm = computed(() => this.creatingNew() || !this.conversationId());

  ngOnInit(): void {
    this.loadConversations();
  }

  protected loadConversations(): void {
    this.loadError.set(null);
    this.conversationsApi.list().subscribe({
      next: (page) => {
        this.conversations.set(page.items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadError.set(ApiError.from(error).message);
      },
    });
  }

  protected startNew(): void {
    this.creatingNew.set(true);
    void this.router.navigate(['/chat']);
  }

  protected onCreated(conversation: ConversationResponse): void {
    this.creatingNew.set(false);
    this.loadConversations();
    void this.router.navigate(['/chat', conversation.id]);
  }

  protected onDeleted(): void {
    this.loadConversations();
    void this.router.navigate(['/chat']);
  }
}
