import { InjectionToken } from '@angular/core';

/**
 * Base path of the DocuLens API. The frontend is always served from the same origin as the API
 * (dev: proxy.conf.json forwards /api to the backend; production: path routing), so this is a relative path and no
 * secrets, hosts or keys live in the frontend (ARCHITECTURE.md section 1).
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

/** Mirrors backend limits so users get feedback before uploading; the server remains the authority. */
export const UPLOAD_LIMITS = {
  maxBytes: 100 * 1024 * 1024,
  maxPages: 1000,
} as const;

export const QUESTION_MAX_LENGTH = 4000;
export const MAX_DOCUMENTS_PER_CONVERSATION = 20;
