import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { DocumentResponse, DocumentStatus, Page } from './api-models';

/** Documents endpoints of API_CONTRACT.yaml. */
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/documents`;

  list(page = 0, size = 20, statuses: DocumentStatus[] = []): Observable<Page<DocumentResponse>> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const status of statuses) {
      params = params.append('status', status);
    }
    return this.http.get<Page<DocumentResponse>>(this.base, { params });
  }

  get(id: string): Observable<DocumentResponse> {
    return this.http.get<DocumentResponse>(`${this.base}/${encodeURIComponent(id)}`);
  }

  /** Multipart upload with progress events (202 Accepted; processing continues in the background). */
  upload(file: File): Observable<HttpEvent<DocumentResponse>> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<DocumentResponse>(this.base, body, {
      reportProgress: true,
      observe: 'events',
    });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${encodeURIComponent(id)}`);
  }

  retry(id: string): Observable<DocumentResponse> {
    return this.http.post<DocumentResponse>(`${this.base}/${encodeURIComponent(id)}/retry`, null);
  }
}
