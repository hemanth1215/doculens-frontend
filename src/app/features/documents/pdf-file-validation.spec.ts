import { validatePdfFile } from './pdf-file-validation';

function file(name: string, type: string, size: number): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validatePdfFile', () => {
  it('accepts PDFs within the size limit', () => {
    expect(validatePdfFile(file('report.PDF', 'application/pdf', 2048))).toBeNull();
    expect(validatePdfFile(file('report.pdf', '', 2048))).toBeNull(); // some browsers send no type
  });

  it('rejects other file types', () => {
    expect(validatePdfFile(file('notes.txt', 'text/plain', 10))).toContain('Only PDF');
    expect(validatePdfFile(file('fake.pdf', 'image/png', 10))).toContain('Only PDF');
  });

  it('rejects empty and oversized files', () => {
    expect(validatePdfFile(file('empty.pdf', 'application/pdf', 0))).toContain('empty');
    expect(validatePdfFile(file('huge.pdf', 'application/pdf', 101 * 1024 * 1024))).toContain(
      'maximum is 100 MB',
    );
  });
});
