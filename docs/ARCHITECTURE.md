# CurlIt - Architecture Documentation

## System Architecture

CurlIt uses one React renderer with three network transports: an Express cloud/development proxy, the same proxy bundled as an optional local agent, and a hardened Electron main process for the desktop app. Browser code selects cloud or local proxy URLs; desktop code detects the preload bridge and uses IPC. A standalone Node CLI runs the shared collection executor with a direct HTTP transport.

### Frontend (React + TypeScript)

The frontend is a single-page application built with React 19 and TypeScript. It handles all UI rendering, state management, and user interactions.

#### Component Hierarchy

```
App
├── Header (branding, sidebar toggle, cURL import/export, env indicator)
├── Sidebar (resizable)
│   ├── CollectionsPanel
│   │   └── CollectionItem (expandable, with requests)
│   ├── HistoryPanel (searchable, grouped by date)
│   └── EnvironmentsPanel (expandable, with variable editor)
├── Main Content
│   ├── RequestTabs (tab bar with method badges)
│   ├── UrlBar (method select, URL input, send button)
│   ├── RequestPanel (resizable height)
│   │   ├── ParamsTab → KeyValueEditor
│   │   ├── HeadersTab → KeyValueEditor
│   │   ├── BodyTab → CodeMirror / KeyValueEditor
│   │   ├── AuthTab → form fields
│   │   └── SchemaTab → ResponseSchemaEditor
│   └── ResponsePanel
│       ├── BodyTab → CodeMirror (read-only)
│       ├── HeadersTab → table
│       └── CookiesTab → table
├── Footer (status bar)
└── Modals
    ├── CurlImportModal
    └── CurlExportModal
```

#### State Management (Zustand)

Single store manages all application state:

- **Tabs**: Array of open tabs with active tab tracking
- **Requests**: Map of request configurations keyed by ID
- **Responses**: Map of response data keyed by request ID
- **Loading**: Map of loading states keyed by request ID
- **Collections**: Array of collections with nested requests
- **History**: Array of history entries (limited to 100)
- **Environments**: Array of environments with variables
- **UI State**: Sidebar view, sidebar open/closed

#### Data Flow

```
User Action → Store Action → State Update → React Re-render
                  ↓
         localStorage Save (for persistent data)
```

For HTTP requests:
```
Send Button Click
  → resolveRequestVariables() (substitute {{vars}})
  → executeRequest() runs pre-request script and builds body/auth
  → Browser: POST /api/proxy to cloud or local agent
    OR Desktop: invoke curlit:http through the preload bridge
  → Selected trusted process forwards to target API
  → Response returned to frontend
  → optional response schema validation runs in a worker
  → test script runs; assertions/logs/chain variables are stored
  → Store updated with response
  → History entry created
  → UI re-renders with response data
```

### Backend (Express.js Proxy)

The proxy server exists solely to bypass browser CORS restrictions. It:

1. Receives POST requests at `/api/proxy` with request configuration
2. Forwards the request to the target URL using Node.js `fetch`
3. Returns the response (status, headers, body, cookies) to the frontend

This allows CurlIt to make requests to any API without CORS issues.

### Local Agent

`npm run package:agent` bundles the Express proxy into Windows x64, macOS x64, and Linux x64 executables. It listens on loopback port 3001 and exposes health, HTTP, OAuth, GitHub device-flow, GraphQL introspection, and WebSocket proxy endpoints. The hosted UI switches to it through the Agent modal. It is not required by a local browser development session that already runs `server/proxy.js`, or by Electron.

### Electron Desktop

`electron/main.cjs` creates a renderer with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. `electron/preload.cjs` exposes only the typed `window.curlit` methods. `electron/ipc.cjs` validates trusted senders, bounds payloads/concurrency, and performs HTTP, OAuth, GitHub, GraphQL, and WebSocket work. Navigation and new-window requests are denied except allow-listed external HTTP(S) URLs opened by the operating system.

Production uses the `curlit://app` scheme, CSP, ASAR integrity, Electron fuses, hardened macOS runtime, and platform signing in tagged CI releases. See [DESKTOP.md](DESKTOP.md).

#### Proxy Request Format

```json
{
  "method": "GET",
  "url": "https://api.example.com/data",
  "headers": { "Authorization": "Bearer ..." },
  "body": "...",
  "bodyType": "json"
}
```

#### Proxy Response Format

```json
{
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "application/json" },
  "body": "{ ... }",
  "cookies": [{ "name": "session", "value": "..." }],
  "time": 150
}
```

### CLI and Run Reports

`cli/index.ts` loads and validates collection/environment JSON, applies explicit variable overrides, and calls the shared `runCollection()` loop with an executor. `requestExecutorCore.ts` accepts runtime adapters for sending requests, executing scripts, and validating schemas. `requestExecutor.ts` supplies the browser/desktop defaults; the CLI imports the core directly and uses Node fetch with per-request Undici agents, cancellation, and timeouts.

`prepareRequest()` supplies common URL, authentication, body, and header handling. CLI file attachments are loaded into the same in-memory file store from explicit paths relative to the collection JSON. No UI storage is needed. Each CLI run starts with fresh chain variables.

The CLI runs the shared script engine inside a VM context in a worker, with JSON-only input/output, execution timeouts, and a heap limit. Host Node APIs and the process environment are not passed into the VM. This is execution containment for trusted collections, not a security boundary for hostile code. A worker is terminated after each script.

`src/utils/runReport.ts` collects runner events into a versioned report shared by the CLI and the collection runner modal. JSON preserves assertion detail; JUnit produces one test case per request. Reports intentionally omit request payloads, credentials, response bodies, and script logs. CLI failures map to exit codes; UI results can be downloaded after completion or stopping.

`npm run build:cli` type-checks and bundles the CLI and workers into an independently installable `dist-cli/` package. See [CLI.md](CLI.md).

### Response Schema Validation

Requests optionally store `responseSchema: { enabled, schema }`, retaining schema text even while it is incomplete or disabled. Existing requests need no migration. `ResponseSchemaEditor` supplies a JSON editor; the shared executor runs enabled validation before test scripts and combines both sets of assertions. Configuration/worker errors retain the original HTTP response and produce an errored run; constraint violations produce a failed run.

`src/utils/responseSchema.ts` uses Ajv and ajv-formats for draft-07 validation without coercion, defaults, property removal, or network schema loading. It returns JSON Pointer paths and caps displayed errors. The browser and Electron renderer use a Vite module worker, loaded only when validation is enabled. The CLI uses `cli/schema-worker.ts` in a Node worker with a 64 MB heap limit. Each adapter waits for worker readiness (up to ten seconds), then enforces a two-second processing budget and terminates the worker on completion, error, timeout, or cancellation. The validator has no dependency on the UI or transport.

### Benchmarks and HTTP Timing

`src/utils/benchmark.ts` runs bounded sequential warm-up and measured iterations through the shared request executor. It snapshots inputs, starts fresh chain variables each iteration, records assertions without response payloads, and calculates interpolated latency percentiles and failure rates. Thresholds are evaluated independently for each request. `benchmarkReport.ts` exports JSON or converts execution/threshold results to the existing JUnit serializer. Ordinary collection run reports remain unchanged.

`BenchmarkModal` is opened for a request from the URL bar or for a collection from the sidebar. `curlit bench` injects the same Node execution adapter used by `curlit run`. Both pass a per-request network timeout through `ExecuteContext.requestTimeoutMs`, separate from script/schema budgets. Interrupted runs preserve completed measurements and skipped counts.

`ResponseData.httpTimeMs` carries target HTTP timing from the trusted transport. The proxy, Electron main process, and CLI measure with a monotonic clock from immediately before fetch through body download, before formatting or assertions. The renderer's existing `time` field still records its transport round trip. Missing timing is an explicit benchmark error rather than a fabricated zero sample. Reports contain both HTTP time and overall execution duration.

Browser cancellation closes the proxy connection, which aborts the upstream fetch. Desktop requests optionally carry a request ID; the renderer calls the narrow `curlit:http-cancel` IPC method on abort. The main process validates the ID and trusted sender, then looks up the controller only within that renderer's active requests. Request completion removes the controller. CLI fetch uses the existing combined abort/timeout signal.

### Persistence Layer

All data is persisted in the browser's localStorage:

| Key | Data | Limit |
|-----|------|-------|
| `curlit_collections` | Collections array | No hard limit |
| `curlit_history` | History entries | 100 entries max |
| `curlit_environments` | Environments array | No hard limit |
| `curlit_active_env` | Active environment ID | Single value |
| `curlit-sidebar-width` | Sidebar width in px | Single value |
| `curlit-request-height` | Request panel height in px | Single value |

Additional keys store theme, proxy mode, sync metadata, chain variables, and workspace state. OAuth tokens and environment secrets are localStorage data, not encrypted application vault entries.

## Key Utilities

### HTTP Module (`src/utils/http.ts`)

- `sendRequest()` - Sends HTTP request via proxy server
- `resolveVariables()` - Substitutes `{{var}}` placeholders
- `parseCurlCommand()` - Parses cURL string into request config
- `generateCurlCommand()` - Generates cURL from request config
- `getMethodColor()` / `getStatusColor()` - UI color helpers
- `formatBytes()` / `formatTime()` - Display formatters
- `tryFormatJson()` - Safe JSON pretty-printing

Other focused modules cover request execution/scripts, GraphQL introspection, WebSocket lifecycle, backup/restore, share links, GitHub Gist sync, OpenAPI import, and Electron transport selection.

### Postman Import Module (`src/utils/postman.ts`)

- `isPostmanCollection()` - Detects whether JSON is a Postman v2.1 collection (checks for `info.name` + `item` array)
- `parsePostmanCollection()` - Converts a Postman v2.1 collection into CurlIt's `{ name, requests }` format
- Handles: URL objects (raw + parts), headers, body modes (raw/json/xml/formdata/urlencoded), auth (basic/bearer/apikey), and nested folders (flattened)

### Custom Hooks

- `useResizable()` - Mouse-drag resizable panel behavior with localStorage persistence

## Test Architecture

CurlIt uses a layered testing strategy to catch regressions at the earliest and cheapest level.

### Test Stack

| Tool | Role |
|------|------|
| Vitest | Test runner for unit, store, component, and server tests |
| React Testing Library | Component rendering and user interaction simulation |
| Supertest | HTTP assertions for Express proxy server |
| Playwright | Browser workflows and a real Electron launch/IPC request |
| jsdom | DOM environment for Vitest component tests |

### Test Layers

```
 E2E (Playwright)         -- Full browser workflows and Electron runtime smoke test
 Component (RTL)          -- React components with real store, mocked network
 Store (Vitest)           -- Zustand actions with localStorage
 Unit (Vitest)            -- Pure functions, zero dependencies
 Server (Supertest)       -- Express proxy in isolation
```

### Test File Structure

Tests are co-located with source in `__tests__/` directories:

```
src/utils/__tests__/http.test.ts         # Utility function unit tests
src/types/__tests__/index.test.ts        # Type factory tests
src/store/__tests__/index.test.ts        # Store action tests
src/components/__tests__/*.test.tsx      # Component integration tests
src/test/setup.ts                        # Global test setup (cleanup, polyfills)
src/test/test-utils.tsx                  # Custom render helpers
server/__tests__/proxy.test.js           # Proxy server tests
e2e/*.spec.ts                            # Playwright E2E tests
```

### Configuration

- `vitest.config.ts` -- Vitest configuration (jsdom environment, setup files, coverage)
- `playwright.config.ts` -- Playwright configuration (Chromium, auto-starts dev + proxy servers)

### Running Tests

```bash
npm test              # All Vitest tests (unit + store + component + server)
npm run test:watch    # Watch mode for development
npm run test:coverage # With V8 coverage report
npm run test:e2e      # Playwright E2E tests in Chromium
```
