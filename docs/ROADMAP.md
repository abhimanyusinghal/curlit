# CurlIt - Roadmap

## v1.0.0 -- Foundation (Released)

- [x] Full HTTP client (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- [x] Request builder with query params, headers, and body editor
- [x] Body types: JSON, Text, XML (syntax-highlighted), Form Data, URL Encoded
- [x] Authentication: Basic Auth, Bearer Token, API Key (header or query)
- [x] Syntax-highlighted response viewer (JSON, XML, HTML) with Pretty/Raw toggle
- [x] Response headers table and cookies table
- [x] Status code, response time, and response size metrics
- [x] Copy response to clipboard and download as file
- [x] Collections -- create, rename, delete, save/open/remove requests
- [x] Collection import/export as JSON
- [x] Environment variables with `{{placeholder}}` substitution across URL, headers, params, body, and auth
- [x] Active environment indicator in header
- [x] Request history -- last 100 entries, searchable, grouped by date
- [x] Multi-tab interface with independent state per tab
- [x] cURL import (Ctrl+I) and export (Ctrl+E)
- [x] Keyboard shortcuts: Ctrl+N (new tab), Ctrl+B (toggle sidebar)
- [x] Dark theme with custom color palette
- [x] Resizable sidebar and request/response panels (drag to resize)
- [x] Express.js proxy server to bypass CORS
- [x] All data persisted locally via localStorage
- [x] Automated test suite tests across unit, store, component, server, and E2E layers (Vitest + React Testing Library + Supertest + Playwright)

---

## Roadmap

### v1.1 -- Developer Experience

- [ ] Light theme / theme toggle
- [x] Postman collection import (JSON v2.1 format)
- [ ] OpenAPI / Swagger import -- auto-generate requests from a spec
- [ ] Request name editing directly in the tab bar
- [ ] Duplicate request (Ctrl+D)
- [ ] Bulk edit mode for headers and params (raw text editor)
- [ ] Response search (Ctrl+F within response body)

### v1.2 -- Advanced Request Features

- [ ] File upload support in Form Data body type
- [ ] Binary body support
- [ ] GraphQL mode with query/variables editor and schema introspection
- [ ] OAuth 2.0 authentication flow (authorization code, client credentials)
- [ ] Pre-request scripts (JavaScript, runs before send)
- [ ] Post-response tests (assertions on status, body, headers)
- [ ] Request chaining -- use values from one response in the next request
- [ ] WebSocket support

### v1.3 -- Collaboration & Sync

- [ ] Export/import all data (full backup as single JSON)
- [ ] Shareable request links (encoded in URL)
- [ ] Optional cloud sync via GitHub Gist or a self-hosted backend
- [ ] Team workspaces with shared collections
- [ ] Real-time collaboration (conflict-free editing)

### v1.4 -- Performance & Testing

- [ ] Collection runner -- execute all requests in a collection sequentially
- [ ] Performance benchmarking -- run a request N times, report avg/p95/p99
- [ ] Response diffing -- compare two responses side-by-side
- [ ] Mock server -- define mock responses for endpoints
- [ ] Response schema validation (JSON Schema)
- [ ] Automated test reports (exportable)

### v1.5 -- Platform & Ecosystem

- [ ] Electron or Tauri desktop app (no proxy server needed)
- [ ] CLI tool (`curlit run collection.json`) for CI/CD pipelines
- [ ] VS Code extension
- [ ] Plugin system for community extensions
- [ ] Proxy authentication support (corporate proxies)
- [ ] Certificate management (custom CA, client certs)

### v2.0 -- Long-term Vision

- [ ] gRPC support
- [ ] Server-Sent Events (SSE) support
- [ ] MQTT support
- [ ] API monitoring -- scheduled health checks with alerts
- [ ] API documentation generator from collections
- [ ] AI-assisted request building -- describe what you want in plain English

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS 4 |
| State Management | Zustand |
| Code Editor | CodeMirror 6 (via @uiw/react-codemirror) |
| Icons | Lucide React |
| Build Tool | Vite 5 |
| Proxy Server | Express.js |
| Persistence | localStorage |

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Zustand over Redux | Simpler API, less boilerplate, right fit for this scale |
| CodeMirror over Monaco | Significantly smaller bundle while still providing excellent syntax highlighting |
| Express proxy server | Required to bypass browser CORS restrictions when testing third-party APIs |
| localStorage for persistence | Zero setup, no database needed -- perfect for a local-first tool |
| Custom resizable panels | Lightweight hook avoids third-party API compatibility issues |
| Tailwind CSS 4 | Utility-first styling with custom dark theme via `@theme` |

## Contributing

Pick any unchecked item from the roadmap, open an issue to discuss your approach, and submit a PR. See [ARCHITECTURE.md](ARCHITECTURE.md) for codebase details and [USER_GUIDE.md](USER_GUIDE.md) for feature documentation.

Smaller contributions are equally welcome -- bug fixes, docs improvements, accessibility, and performance optimizations all make a difference.
