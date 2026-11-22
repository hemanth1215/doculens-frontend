import { SseParser } from './sse-parser';

describe('SseParser', () => {
  it('parses named events with JSON data', () => {
    const events = new SseParser().feed(
      'event:token\ndata:{"delta":"Hi"}\n\nevent:done\ndata:{"status":"COMPLETE"}\n\n',
    );

    expect(events).toEqual([
      { event: 'token', data: '{"delta":"Hi"}' },
      { event: 'done', data: '{"status":"COMPLETE"}' },
    ]);
  });

  it('handles events split across arbitrary chunks', () => {
    const parser = new SseParser();
    const text = 'event:token\ndata:{"delta":"Hello"}\n\nevent:token\ndata:{"delta":" world"}\n\n';
    const events = [];
    for (const char of text) {
      events.push(...parser.feed(char));
    }

    expect(events.map((e) => JSON.parse(e.data).delta)).toEqual(['Hello', ' world']);
  });

  it('ignores heartbeat comments and unknown fields, and joins multi-line data', () => {
    const events = new SseParser().feed(
      ': ping\n\nid:7\nretry:100\nevent:token\ndata: line one\ndata:line two\n\n',
    );

    expect(events).toEqual([{ event: 'token', data: 'line one\nline two' }]);
  });

  it('accepts CRLF line endings and flushes a final event without a trailing blank line', () => {
    const parser = new SseParser();
    expect(
      parser.feed('event:token\r\ndata:{"delta":"a"}\r\n\r\nevent:done\r\ndata:{}'),
    ).toHaveLength(1);
    expect(parser.end()).toEqual([{ event: 'done', data: '{}' }]);
  });
});
