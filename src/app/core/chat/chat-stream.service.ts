import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api/api-config';
import { ApiError } from '../api/api-error';
import { Problem, StreamEvent } from '../api/api-models';
import { AuthService } from '../auth/auth.service';
import { SseParser } from './sse-parser';

const KNOWN_EVENTS = new Set(['message.created', 'token', 'citations', 'done', 'error']);

/**
 * Asks a question and streams the answer (API_CONTRACT.yaml askQuestion, ADR-005). Uses fetch + ReadableStream
 * because EventSource cannot send a POST body or an Authorization header. Unsubscribing aborts the request; the
 * backend then stores the partial answer as INTERRUPTED.
 *
 * Errors before the stream opens (404, 409, 400...) are emitted as {@link ApiError}; errors after it opens arrive as
 * an `error` event in the stream.
 */
@Injectable({ providedIn: 'root' })
export class ChatStreamService {
  private readonly auth = inject(AuthService);
  private readonly apiBase = inject(API_BASE_URL);

  ask(conversationId: string, question: string): Observable<StreamEvent> {
    return new Observable<StreamEvent>((subscriber) => {
      const controller = new AbortController();
      const post = (token: string | null) =>
        fetch(`${this.apiBase}/conversations/${encodeURIComponent(conversationId)}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/problem+json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ question }),
          signal: controller.signal,
        });

      (async () => {
        // fetch bypasses the HTTP interceptors, so token refresh is handled here: refresh an expired token first,
        // and retry once with a refreshed token if the API still answers 401.
        let response = await post(await this.auth.validAccessToken());
        if (response.status === 401 && this.auth.isAuthenticated()) {
          response = await post(await this.auth.refreshAccessToken());
        }

        if (!response.ok || !response.body) {
          if (response.status === 401) {
            this.auth.sessionExpired();
          }
          const problem = (await response.json().catch(() => null)) as Partial<Problem> | null;
          throw ApiError.fromProblem(response.status, problem);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseParser();
        for (;;) {
          const { value, done } = await reader.read();
          const raw = done ? parser.end() : parser.feed(decoder.decode(value, { stream: true }));
          for (const event of raw) {
            if (KNOWN_EVENTS.has(event.event)) {
              subscriber.next({ event: event.event, data: JSON.parse(event.data) } as StreamEvent);
            }
          }
          if (done) {
            break;
          }
        }
        subscriber.complete();
      })().catch((error: unknown) => {
        if (controller.signal.aborted) {
          return; // the subscriber cancelled; nothing to report
        }
        subscriber.error(ApiError.from(error));
      });

      return () => controller.abort();
    });
  }
}
