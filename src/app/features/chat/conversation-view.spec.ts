import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { ConversationResponse, StreamEvent } from '../../core/api/api-models';
import { ChatStreamService } from '../../core/chat/chat-stream.service';
import { ConversationView } from './conversation-view';

const CONVERSATION: ConversationResponse = {
  id: 'c1',
  title: 'Leave questions',
  documentCount: 1,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  documents: [{ id: 'd1', filename: 'handbook.pdf', status: 'READY' }],
};

describe('ConversationView', () => {
  let fixture: ComponentFixture<ConversationView>;
  let http: HttpTestingController;
  let element: HTMLElement;
  let stream: Subject<StreamEvent>;
  const chatStream = { ask: vi.fn() };

  beforeEach(async () => {
    stream = new Subject<StreamEvent>();
    chatStream.ask.mockReset().mockReturnValue(stream);
    TestBed.configureTestingModule({
      imports: [ConversationView],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ChatStreamService, useValue: chatStream },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ConversationView);
    fixture.componentRef.setInput('conversationId', 'c1');
    element = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne('/api/v1/conversations/c1').flush(CONVERSATION);
    http
      .expectOne((r) => r.url === '/api/v1/conversations/c1/messages')
      .flush({ items: [], page: 0, size: 200, totalElements: 0, totalPages: 0 });
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function ask(question: string): Promise<void> {
    const textarea = element.querySelector<HTMLTextAreaElement>('#question-input')!;
    textarea.value = question;
    textarea.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('form.composer')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  async function emit(event: StreamEvent): Promise<void> {
    stream.next(event);
    await fixture.whenStable();
  }

  it('shows the scope and an empty-state prompt', () => {
    expect(element.querySelector('h1')!.textContent).toContain('Leave questions');
    expect(element.textContent).toContain('handbook.pdf');
    expect(element.textContent).toContain('Ask your first question');
  });

  it('streams the answer token by token, then shows citations', async () => {
    await ask('How many vacation days?');
    expect(chatStream.ask).toHaveBeenCalledWith('c1', 'How many vacation days?');
    expect(element.querySelector('.message--user')!.textContent).toContain(
      'How many vacation days?',
    );
    expect(element.textContent).toContain('Searching your documents');
    expect(element.textContent).toContain('Stop');

    await emit({
      event: 'message.created',
      data: { conversationId: 'c1', userMessageId: 'u1', assistantMessageId: 'a1' },
    });
    await emit({ event: 'token', data: { delta: 'Employees get ' } });
    expect(element.querySelector('.message--assistant')!.textContent).toContain('Employees get');
    await emit({ event: 'token', data: { delta: 'twenty days [S1].' } });
    await emit({
      event: 'citations',
      data: {
        grounded: true,
        citations: [
          {
            label: 'S1',
            documentId: 'd1',
            documentName: 'handbook.pdf',
            pageStart: 2,
            pageEnd: 3,
            snippet: 'Vacation policy…',
            score: 0.8,
            cited: true,
          },
        ],
      },
    });
    await emit({ event: 'done', data: { assistantMessageId: 'a1', status: 'COMPLETE' } });
    stream.complete();
    await fixture.whenStable();

    const answer = element.querySelector('.message--assistant')!;
    expect(answer.textContent).toContain('Employees get twenty days [S1].');
    expect(answer.querySelector('.citation')!.textContent).toContain('handbook.pdf');
    expect(answer.querySelector('.citation')!.textContent).toContain('pp. 2–3');
    expect(element.querySelector('[aria-live="polite"]')!.textContent).toContain('Answer ready.');
    expect(element.querySelector('button[type="submit"]')).not.toBeNull(); // composer is back
  });

  it('marks ungrounded answers', async () => {
    await ask('What is the CEO salary?');
    await emit({
      event: 'token',
      data: {
        delta: 'The uploaded documents do not contain enough information to answer this question.',
      },
    });
    await emit({ event: 'citations', data: { grounded: false, citations: [] } });
    await emit({ event: 'done', data: { assistantMessageId: 'a1', status: 'COMPLETE' } });

    expect(element.textContent).toContain('Not found in the selected documents.');
  });

  it('shows a stream error with a retry that asks the same question again', async () => {
    await ask('Vacation days?');
    await emit({ event: 'token', data: { delta: 'Partial ' } });
    await emit({
      event: 'error',
      data: {
        code: 'AI_PROVIDER_UNAVAILABLE',
        message: 'The AI service is unavailable. Please try again.',
        assistantMessageId: 'a1',
      },
    });
    stream.complete();
    await fixture.whenStable();

    const problem = element.querySelector('.message__problem[role="alert"]')!;
    expect(problem.textContent).toContain('The AI service is unavailable');
    expect(element.textContent).toContain('Partial');

    stream = new Subject<StreamEvent>();
    chatStream.ask.mockReturnValue(stream);
    (problem.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(chatStream.ask).toHaveBeenLastCalledWith('c1', 'Vacation days?');
  });

  it('removes the optimistic messages and explains errors raised before streaming', async () => {
    await ask('Another question?');
    stream.error(
      ApiError.fromProblem(409, {
        code: 'ANSWER_IN_PROGRESS',
        detail: 'An answer is still being generated in this conversation.',
      }),
    );
    await fixture.whenStable();

    expect(element.querySelectorAll('.message')).toHaveLength(0);
    expect(element.querySelector('[role="alert"]')!.textContent).toContain('still being generated');
    expect(element.querySelector<HTMLTextAreaElement>('#question-input')!.value).toBe(
      'Another question?',
    );
  });

  it('stops a streaming answer and keeps the partial text', async () => {
    await ask('Long question?');
    await emit({ event: 'token', data: { delta: 'Half an ' } });

    const stop = [...element.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Stop',
    )!;
    stop.click();
    await fixture.whenStable();

    expect(stream.observed).toBe(false); // unsubscribed -> fetch aborted
    expect(element.textContent).toContain('Half an');
    expect(element.textContent).toContain('Answer stopped before it finished.');
  });

  it('does not send blank questions', async () => {
    await ask('   ');
    expect(chatStream.ask).not.toHaveBeenCalled();
  });
});
