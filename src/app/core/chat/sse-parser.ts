/** One Server-Sent Event as received: the `event:` name and the joined `data:` lines. */
export interface RawSseEvent {
  event: string;
  data: string;
}

/**
 * Incremental parser for a `text/event-stream` body (WHATWG SSE format). Feed it text chunks as they arrive; chunks may
 * split lines or events anywhere. Comment lines (`: ping` heartbeats) and fields other than `event`/`data` are ignored.
 */
export class SseParser {
  private buffer = '';
  private eventName = '';
  private dataLines: string[] = [];

  feed(chunk: string): RawSseEvent[] {
    this.buffer += chunk;
    const events: RawSseEvent[] = [];
    let newline: number;
    while ((newline = this.buffer.search(/\r\n|\r|\n/)) >= 0) {
      const line = this.buffer.slice(0, newline);
      const separatorLength = this.buffer.startsWith('\r\n', newline) ? 2 : 1;
      this.buffer = this.buffer.slice(newline + separatorLength);
      const event = this.processLine(line);
      if (event) {
        events.push(event);
      }
    }
    return events;
  }

  /** Flushes a final event that was not followed by a blank line. */
  end(): RawSseEvent[] {
    const events = this.buffer.length > 0 ? this.feed('\n') : [];
    const last = this.processLine('');
    return last ? [...events, last] : events;
  }

  private processLine(line: string): RawSseEvent | null {
    if (line === '') {
      if (this.dataLines.length === 0 && this.eventName === '') {
        return null;
      }
      const event = { event: this.eventName || 'message', data: this.dataLines.join('\n') };
      this.eventName = '';
      this.dataLines = [];
      return event;
    }
    if (line.startsWith(':')) {
      return null; // comment (heartbeat)
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    if (field === 'event') {
      this.eventName = value;
    } else if (field === 'data') {
      this.dataLines.push(value);
    }
    return null;
  }
}
