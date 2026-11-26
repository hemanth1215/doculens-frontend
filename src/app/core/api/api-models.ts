/**
 * Types mirroring shared-spec/API_CONTRACT.yaml. Keep in sync with the contract; do not add fields the API does
 * not define.
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'MALFORMED_REQUEST'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'PDF_ENCRYPTED'
  | 'PDF_CORRUPT'
  | 'PDF_EMPTY'
  | 'PDF_TOO_MANY_PAGES'
  | 'NO_EXTRACTABLE_TEXT'
  | 'EMBEDDING_FAILED'
  | 'INGESTION_TIMEOUT'
  | 'DOCUMENT_ALREADY_EXISTS'
  | 'DOCUMENT_NOT_READY'
  | 'ANSWER_IN_PROGRESS'
  | 'REFRESH_CONFLICT'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'REGISTRATION_DISABLED'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'RATE_LIMITED'
  | 'RESOURCE_NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_ACCEPTABLE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'QUOTA_EXCEEDED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'EMPTY_RESPONSE'
  | 'INTERNAL_ERROR';

/** RFC 9457 problem (Problem, ValidationProblem, DuplicateDocumentProblem). */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: ErrorCode;
  requestId?: string;
  errors?: { field: string; message: string }[];
  existingDocumentId?: string;
}

export interface PageMeta {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Page<T> extends PageMeta {
  items: T[];
}

// ---- Auth ----
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserResponse {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserResponse;
}

// ---- Documents ----
export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

export interface DocumentResponse {
  id: string;
  filename: string;
  sizeBytes: number;
  pageCount: number | null;
  status: DocumentStatus;
  progress: { pagesProcessed: number; chunkCount: number; percent: number | null };
  emptyPageCount: number;
  error: { code: ErrorCode; message: string; retryable: boolean } | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

// ---- Conversations ----
export interface CreateConversationRequest {
  title?: string;
  documentIds: string[];
}

export interface UpdateConversationRequest {
  title?: string;
  documentIds?: string[];
}

export interface DocumentRef {
  id: string;
  filename: string;
  status: DocumentStatus;
}

export interface ConversationSummary {
  id: string;
  title: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationResponse extends ConversationSummary {
  documents: DocumentRef[];
}

export type MessageRole = 'USER' | 'ASSISTANT';
export type MessageStatus = 'COMPLETE' | 'STREAMING' | 'INTERRUPTED' | 'FAILED';

export interface Citation {
  label: string;
  documentId: string | null;
  documentName: string;
  pageStart: number;
  pageEnd: number;
  snippet: string | null;
  score: number;
  cited: boolean;
}

export interface MessageResponse {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  grounded: boolean | null;
  errorCode: string | null;
  citations: Citation[];
  createdAt: string;
}

// ---- SSE stream events (StreamEvent) ----
export type StreamEvent =
  | {
      event: 'message.created';
      data: { conversationId: string; userMessageId: string; assistantMessageId: string };
    }
  | { event: 'token'; data: { delta: string } }
  | { event: 'citations'; data: { grounded: boolean; citations: Citation[] } }
  | { event: 'done'; data: { assistantMessageId: string; status: MessageStatus } }
  | {
      event: 'error';
      data: { code: ErrorCode; message: string; assistantMessageId: string | null };
    };
