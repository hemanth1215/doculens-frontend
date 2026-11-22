import { Pipe, PipeTransform } from '@angular/core';

/** 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** "p. 4" or "pp. 4–6". */
export function formatPages(pageStart: number, pageEnd: number): string {
  return pageStart === pageEnd ? `p. ${pageStart}` : `pp. ${pageStart}–${pageEnd}`;
}

@Pipe({ name: 'fileSize' })
export class FileSizePipe implements PipeTransform {
  transform(bytes: number | null | undefined): string {
    return bytes == null ? '' : formatBytes(bytes);
  }
}

@Pipe({ name: 'pages' })
export class PagesPipe implements PipeTransform {
  transform(range: { pageStart: number; pageEnd: number }): string {
    return formatPages(range.pageStart, range.pageEnd);
  }
}
