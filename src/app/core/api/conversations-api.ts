import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-config';
import {
  ConversationResponse,
  ConversationSummary,
  CreateConversationRequest,
  MessageResponse,
  Page,
  UpdateConversationRequest,
} from './api-models';

/** Conversations endpoints of API_CONTRACT.yaml (asking a question streams: see ChatStreamService). */
@Injectable({ providedIn: 'root' })
export class ConversationsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/conversations`;

  create(request: CreateConversationRequest): Observable<ConversationResponse> {
    return this.http.post<ConversationResponse>(this.base, request);
  }

  list(page = 0, size = 50): Observable<Page<ConversationSummary>> {
    return this.http.get<Page<ConversationSummary>>(this.base, {
      params: new HttpParams().set('page', page).set('size', size),
    });
  }

  get(id: string): Observable<ConversationResponse> {
    return this.http.get<ConversationResponse>(`${this.base}/${encodeURIComponent(id)}`);
  }

  update(id: string, request: UpdateConversationRequest): Observable<ConversationResponse> {
    return this.http.patch<ConversationResponse>(`${this.base}/${encodeURIComponent(id)}`, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${encodeURIComponent(id)}`);
  }

  messages(id: string, page = 0, size = 200): Observable<Page<MessageResponse>> {
    return this.http.get<Page<MessageResponse>>(`${this.base}/${encodeURIComponent(id)}/messages`, {
      params: new HttpParams().set('page', page).set('size', size),
    });
  }
}
