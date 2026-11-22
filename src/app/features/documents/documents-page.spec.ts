import { HttpEventType, HttpResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DocumentResponse, Page } from '../../core/api/api-models';
import { DocumentsPage } from './documents-page';

function doc(overrides: Partial<DocumentResponse> = {}): DocumentResponse {
  return {
    id: 'd1',
    filename: 'handbook.pdf',
    sizeBytes: 2048,
    pageCount: 3,
    status: 'READY',
    progress: { pagesProcessed: 3, chunkCount: 4, percent: 100 },
    emptyPageCount: 0,
    error: null,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
    processedAt: '2026-11-01T10:00:05Z',
    ...overrides,
  };
}

function page(items: DocumentResponse[]): Page<DocumentResponse> {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length ? 1 : 0,
  };
}

describe('DocumentsPage', () => {
  let fixture: ComponentFixture<DocumentsPage>;
  let http: HttpTestingController;
  let element: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [DocumentsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DocumentsPage);
    element = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  const listRequest = () =>
    http.expectOne((r) => r.url === '/api/v1/documents' && r.method === 'GET');

  it('shows a loading state, then an empty state', async () => {
    expect(element.querySelector('[role="status"]')!.textContent).toContain(
      'Loading your documents',
    );

    listRequest().flush(page([]));
    await fixture.whenStable();

    expect(element.textContent).toContain('No documents yet');
  });

  it('shows an error with a working retry', async () => {
    listRequest().flush({ code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')!.textContent).toContain('Something went wrong');

    (element.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    listRequest().flush(page([doc()]));
    await fixture.whenStable();

    expect(element.textContent).toContain('handbook.pdf');
  });

  it('lists documents with status, size, pages and failure reasons', async () => {
    listRequest().flush(
      page([
        doc(),
        doc({
          id: 'd2',
          filename: 'scan.pdf',
          status: 'FAILED',
          error: {
            code: 'NO_EXTRACTABLE_TEXT',
            message: 'OCR is not supported.',
            retryable: false,
          },
        }),
      ]),
    );
    await fixture.whenStable();

    const rows = element.querySelectorAll('.doc-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('Ready');
    expect(rows[0]!.textContent).toContain('2.0 KB');
    expect(rows[0]!.textContent).toContain('3 pages');
    expect(rows[1]!.textContent).toContain('Failed');
    expect(rows[1]!.textContent).toContain('OCR is not supported.');
    expect(rows[1]!.textContent).not.toContain('Ask questions');
  });

  it('rejects a non-PDF before uploading', async () => {
    listRequest().flush(page([]));
    await fixture.whenStable();

    selectFile(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')!.textContent).toContain('Only PDF files');
    http.expectNone((r) => r.method === 'POST');
  });

  it('uploads a PDF and offers the existing document for duplicates', async () => {
    listRequest().flush(page([]));
    await fixture.whenStable();

    selectFile(new File(['%PDF-1.7'], 'handbook.pdf', { type: 'application/pdf' }));
    const upload = http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/documents');
    expect(upload.request.body).toBeInstanceOf(FormData);
    upload.flush(
      {
        code: 'DOCUMENT_ALREADY_EXISTS',
        detail: 'You have already uploaded this document.',
        existingDocumentId: 'd9',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')!.textContent).toContain('already uploaded');
    expect(element.querySelector('a[href="/documents/d9"]')).not.toBeNull();
  });

  it('shows success after an upload and refreshes the list', async () => {
    listRequest().flush(page([]));
    await fixture.whenStable();

    selectFile(new File(['%PDF-1.7'], 'new.pdf', { type: 'application/pdf' }));
    const upload = http.expectOne((r) => r.method === 'POST');
    upload.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    await fixture.whenStable();
    expect(element.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('50');
    upload.event(
      new HttpResponse({
        status: 202,
        body: doc({ id: 'n1', filename: 'new.pdf', status: 'UPLOADED' }),
      }),
    );
    listRequest().flush(page([doc({ id: 'n1', filename: 'new.pdf', status: 'UPLOADED' })]));
    await fixture.whenStable();

    expect(element.textContent).toContain('“new.pdf” was uploaded');
    expect(element.textContent).toContain('Queued');
  });

  function selectFile(file: File): void {
    const input = element.querySelector<HTMLInputElement>('#pdf-input')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }
});
