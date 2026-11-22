import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DocumentResponse } from '../../core/api/api-models';
import { DocumentDetailPage } from './document-detail-page';

const FAILED: DocumentResponse = {
  id: 'd1',
  filename: 'report.pdf',
  sizeBytes: 4096,
  pageCount: 10,
  status: 'FAILED',
  progress: { pagesProcessed: 0, chunkCount: 0, percent: 0 },
  emptyPageCount: 0,
  error: {
    code: 'EMBEDDING_FAILED',
    message: 'The document could not be indexed because the AI service was unavailable.',
    retryable: true,
  },
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  processedAt: null,
};

describe('DocumentDetailPage', () => {
  let fixture: ComponentFixture<DocumentDetailPage>;
  let http: HttpTestingController;
  let element: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [DocumentDetailPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DocumentDetailPage);
    fixture.componentRef.setInput('documentId', 'd1');
    element = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('shows a failed document with its reason and retries it', async () => {
    http.expectOne('/api/v1/documents/d1').flush(FAILED);
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')!.textContent).toContain(
      'AI service was unavailable',
    );
    expect(element.textContent).toContain('Retrying may help');

    const retry = [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Retry processing'),
    )!;
    retry.click();
    http
      .expectOne((r) => r.method === 'POST' && r.url === '/api/v1/documents/d1/retry')
      .flush({
        ...FAILED,
        status: 'UPLOADED',
        error: null,
      });
    http.expectOne('/api/v1/documents/d1').flush({ ...FAILED, status: 'UPLOADED', error: null });
    await fixture.whenStable();

    expect(element.textContent).toContain('Queued for processing');
  });

  it('warns about scanned pages that cannot be searched', async () => {
    http.expectOne('/api/v1/documents/d1').flush({
      ...FAILED,
      status: 'READY',
      error: null,
      emptyPageCount: 2,
      progress: { pagesProcessed: 10, chunkCount: 12, percent: 100 },
    });
    await fixture.whenStable();

    expect(element.textContent).toContain('2 page(s) have little or no selectable text');
    expect(element.textContent).toContain('Ask questions about this document');
  });

  it('shows not-found errors from the API', async () => {
    http
      .expectOne('/api/v1/documents/d1')
      .flush(
        { code: 'RESOURCE_NOT_FOUND', detail: 'Document not found' },
        { status: 404, statusText: 'Not Found' },
      );
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')!.textContent).toContain('Document not found');
  });
});
