import { TestBed } from '@angular/core/testing';
import { StreamEvent } from '../api/api-models';
import { ApiError } from '../api/api-error';
import { AuthService } from '../auth/auth.service';
import { ChatStreamService } from './chat-stream.service';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('ChatStreamService', () => {
  const auth = { accessToken: vi.fn(() => 'token-123'), sessionExpired: vi.fn() };
  let service: ChatStreamService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    auth.sessionExpired.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
    service = TestBed.inject(ChatStreamService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('posts the question with the bearer token and emits parsed events in order', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'event:message.created\ndata:{"conversationId":"c1","userMessageId":"u1","assistantMessageId":"a1"}\n\n',
        ': ping\n\nevent:token\ndata:{"delta":"Twenty "}\n\nevent:tok',
        'en\ndata:{"delta":"days [S1]."}\n\n',
        'event:citations\ndata:{"grounded":true,"citations":[]}\n\nevent:done\ndata:{"assistantMessageId":"a1","status":"COMPLETE"}\n\n',
      ]),
    );

    const events = await collect(service, 'c1', 'How many days?');

    expect(events.map((e) => e.event)).toEqual([
      'message.created',
      'token',
      'token',
      'citations',
      'done',
    ]);
    expect(
      events
        .filter((e) => e.event === 'token')
        .map((e) => (e as Extract<StreamEvent, { event: 'token' }>).data.delta),
    ).toEqual(['Twenty ', 'days [S1].']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/conversations/c1/messages');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ question: 'How many days?' }));
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token-123');
  });

  it('turns a problem response before streaming into an ApiError', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ status: 409, code: 'ANSWER_IN_PROGRESS', detail: 'Still answering.' }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      ),
    );

    const error = await collect(service, 'c1', 'q').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('ANSWER_IN_PROGRESS');
    expect((error as ApiError).message).toBe('Still answering.');
  });

  it('ends the session on 401', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 }),
    );

    await collect(service, 'c1', 'q').catch(() => undefined);

    expect(auth.sessionExpired).toHaveBeenCalled();
  });

  it('aborts the request when the subscriber unsubscribes', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    const subscription = service.ask('c1', 'q').subscribe();
    const signal = (fetchMock.mock.calls[0] as [string, RequestInit])[1].signal as AbortSignal;
    subscription.unsubscribe();

    expect(signal.aborted).toBe(true);
  });
});

function collect(service: ChatStreamService, id: string, question: string): Promise<StreamEvent[]> {
  return new Promise((resolve, reject) => {
    const events: StreamEvent[] = [];
    service.ask(id, question).subscribe({
      next: (event) => events.push(event),
      error: reject,
      complete: () => resolve(events),
    });
  });
}
