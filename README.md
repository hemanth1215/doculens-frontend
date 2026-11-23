# DocuLens Frontend

**DocuLens — AI Document Intelligence.** *"Your documents. Clear answers."*

The Angular web app for DocuLens. It is an independent application with its own build. It talks to `doculens-backend` only through the HTTP API defined in `../shared-spec/API_CONTRACT.yaml`.

## Features
- **Sign in / create account.** The access token is kept in memory only (see *Security*).
- **Documents:**
  - Upload PDFs (drag and drop or file picker) with instant checks and an upload progress bar.
  - A document list with live processing status that refreshes automatically while documents process.
  - Details, retry of failed documents, a warning for scanned pages, and delete with confirmation.
- **Chat:**
  - Conversations scoped to the documents you choose.
  - Answers stream in word by word, with a **Stop** button.
  - Every answer lists its **sources** (document name, page range, quoted passage).
  - "Not found in your documents" answers are marked clearly.
  - Failed and stopped answers can be retried.
- **States everywhere:** loading, empty, success, error and retry.

## Stack
Angular 22 (standalone components, signals, zoneless change detection, new control flow), strict TypeScript and **strict templates**, Reactive Forms, `HttpClient` with functional interceptors, Vitest + jsdom for unit tests, Prettier. No UI library: the styles are plain SCSS with design tokens and dark mode.

## Prerequisites
- Node.js `^22.22.3 || ^24.15.0 || >=26` (tested with 24.20.0)
- A running `doculens-backend` on `http://localhost:8080` for real data (see its README; the `fake-ai` profile works without an OpenAI key)

## Run locally

```bash
npm install
npm start            # ng serve on http://localhost:4200
```

`proxy.conf.json` forwards `/api/*` to `http://localhost:8080`, so the browser only talks to one origin. There is no CORS setup, and the backend address never appears in the frontend code.

On Windows PowerShell, if `npm` is blocked ("running scripts is disabled"), use `npm.cmd`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

**Whole app in Docker:** from `../doculens-backend`, run `docker compose --profile app up -d --build` and open http://localhost:8088. See `../shared-spec/DEPLOYMENT.md`.

## Build and test

```bash
npm run build                    # production build into dist/doculens-frontend
npx ng test --watch=false        # unit and component tests (Vitest)
npm run format:check             # Prettier (src and e2e)
npm run e2e:stack                # end-to-end test against a running stack (see below)
```

## Docker image
`Dockerfile` builds the production bundle and serves it with unprivileged nginx (`nginx/default.conf.template`).
- **Routing:** nginx proxies `/api/*` to `DOCULENS_BACKEND_ORIGIN` (default `http://backend:8080`), with response buffering off for streamed answers and request buffering off for large uploads. Other paths fall back to `index.html`.
- **Headers:** it sends a Content-Security-Policy (`script-src 'self'`) and the other headers in `nginx/security-headers.conf`. That's why the production build turns off Angular's inline critical CSS: it would add an inline script.
- **Health check:** `GET /healthz`.

## End-to-end test (`e2e/`)
`npm run e2e:stack` runs `e2e/stack-e2e.mjs` against a running stack, through the same origin the browser uses. It needs only Node, no browser. It checks:
- security headers and SPA routing
- sign-up and sign-in rules
- upload validation and asynchronous ingestion
- cross-user isolation (404s for another user's documents and conversations)
- search, streamed answers with citations, history
- deletion, including the vector purge (checked directly in Qdrant)

| Variable | Default |
|---|---|
| `DOCULENS_E2E_BASE_URL` | `http://localhost:8088` |
| `DOCULENS_E2E_QDRANT_URL` | `http://localhost:6333` (if unreachable, the vector checks are skipped) |
| `DOCULENS_E2E_QDRANT_COLLECTION` | `doculens_chunks_fake` |
| `DOCULENS_E2E_LARGE_PAGES` | `0`. Set it to e.g. `1000` to also ingest a large generated PDF. |

The test creates throwaway users (`e2e-…@example.test`) in the target database, so run it against a local or staging stack, never production. `e2e/pdf.mjs` generates the test PDFs.

## Code layout (`src/app`)

| Folder | Contents |
|---|---|
| `core/api` | `API_BASE_URL` and limits (`api-config.ts`), contract types (`api-models.ts`), `ApiError` (problem responses mapped to friendly messages), `DocumentsApi`, `ConversationsApi` |
| `core/auth` | `AuthService` (in-memory session, expiry), `authInterceptor` (bearer token for API calls only), `unauthorizedInterceptor` (401 ends the session), `authGuard` and `guestGuard` |
| `core/chat` | `ChatStreamService` (POST + `fetch` streaming), `SseParser` |
| `layout` | `Shell`: header, navigation, user menu, skip link |
| `features/auth` | Sign-in and registration pages |
| `features/documents` | Documents list and upload, document details, PDF pre-checks |
| `features/chat` | Chat page, new-conversation form, conversation view (history, streaming, citations) |
| `shared` | Status badge, progress bar, error alert, loading indicator, confirm dialog, citation list, formatting pipes |

## Security
- **The token is kept in memory only**, never in `localStorage` or script-readable cookies. A page reload or the 15-minute token expiry signs you out; the backend has no refresh endpoint yet (planned with authentication completion).
- **The token goes only to DocuLens API URLs** (`/api/v1/...`), never to other origins.
- **A 401 ends the session** and returns to sign-in, with a safe same-app return URL.
- **Route guards are only for usability.** The backend authorizes every request.
- **Document text is rendered only through Angular text interpolation**, never as HTML. That covers answers, snippets and filenames.
- **No secrets, keys or backend hosts are in the frontend.** Hosting should add a Content-Security-Policy header (ARCHITECTURE §3.3).

## Streaming
Answers use `POST /api/v1/conversations/{id}/messages` with `Accept: text/event-stream`, read with `fetch` and a stream reader. `EventSource` isn't used because it can't send a request body or an `Authorization` header.
- `SseParser` handles events split across network chunks, and ignores the `: ping` heartbeats.
- **Stop** aborts the request; the backend stores the partial answer as INTERRUPTED.

## Accessibility
- Semantic landmarks and a skip link.
- Every input has a label; errors are linked with `aria-describedby` and marked with `aria-invalid`.
- Errors use `role="alert"`; loading and progress use `role="status"` and `role="progressbar"`.
- A polite live region announces "answering…", "answer ready" and failures, without reading out every streamed word.
- Native `<dialog>` for confirmations.
- Visible focus outlines, honoring reduced-motion settings.
- Layouts work from phone width up.
