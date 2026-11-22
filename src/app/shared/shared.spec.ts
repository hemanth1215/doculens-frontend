import { TestBed } from '@angular/core/testing';
import { Citation } from '../core/api/api-models';
import { CitationList } from './citation-list';
import { formatBytes, formatPages } from './formatting';
import { StatusBadge } from './status-badge';

describe('formatting', () => {
  it('formats sizes and page ranges', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(100 * 1024 * 1024)).toBe('100 MB');
    expect(formatPages(4, 4)).toBe('p. 4');
    expect(formatPages(4, 6)).toBe('pp. 4–6');
  });
});

describe('CitationList', () => {
  const citation = (overrides: Partial<Citation>): Citation => ({
    label: 'S1',
    documentId: 'd1',
    documentName: 'handbook.pdf',
    pageStart: 2,
    pageEnd: 2,
    snippet: 'Vacation policy',
    score: 0.8,
    cited: true,
    ...overrides,
  });

  it('lists cited sources first and renders snippets as text, never HTML', async () => {
    const fixture = TestBed.createComponent(CitationList);
    fixture.componentRef.setInput('citations', [
      citation({
        label: 'S2',
        cited: false,
        documentName: 'other.pdf',
        snippet: '<img src=x onerror=alert(1)>',
      }),
      citation({ label: 'S1' }),
    ]);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    const items = element.querySelectorAll('.citation');
    expect(items[0]!.textContent).toContain('[S1]');
    expect(items[1]!.textContent).toContain('also considered');
    expect(element.querySelector('img')).toBeNull();
    expect(items[1]!.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('explains deleted documents and renders nothing without citations', async () => {
    const fixture = TestBed.createComponent(CitationList);
    fixture.componentRef.setInput('citations', [citation({ documentId: null, snippet: null })]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('document deleted');
    expect(fixture.nativeElement.textContent).toContain('no longer available');

    fixture.componentRef.setInput('citations', []);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.citations')).toBeNull();
  });
});

describe('StatusBadge', () => {
  it('shows the status as text', async () => {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('status', 'PROCESSING');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent.trim()).toBe('Processing');
  });
});
