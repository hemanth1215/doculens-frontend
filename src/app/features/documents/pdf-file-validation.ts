import { UPLOAD_LIMITS } from '../../core/api/api-config';
import { formatBytes } from '../../shared/formatting';

/**
 * Quick checks before uploading so users get instant feedback. The backend repeats every check (and more: signature,
 * encryption, page count), so these are a convenience, not a guarantee.
 */
export function validatePdfFile(file: File): string | null {
  const isPdfName = file.name.toLowerCase().endsWith('.pdf');
  const isPdfType = file.type === '' || file.type === 'application/pdf';
  if (!isPdfName || !isPdfType) {
    return 'Only PDF files can be uploaded.';
  }
  if (file.size === 0) {
    return 'The file is empty.';
  }
  if (file.size > UPLOAD_LIMITS.maxBytes) {
    return `The file is ${formatBytes(file.size)}; the maximum is ${formatBytes(UPLOAD_LIMITS.maxBytes)}.`;
  }
  return null;
}
