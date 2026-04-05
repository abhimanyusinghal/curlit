# CurlIt - Architecture Documentation

## System Architecture

CurlIt is a client-server application with a React frontend and a minimal Express.js proxy backend.

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
│   │   └── AuthTab → form fields
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
  → sendRequest() 
  → POST /api/proxy (to backend)
  → Backend forwards to target API
  → Response returned to frontend
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

## Key Utilities

### HTTP Module (`src/utils/http.ts`)

- `sendRequest()` - Sends HTTP request via proxy server
- `resolveVariables()` - Substitutes `{{var}}` placeholders
- `parseCurlCommand()` - Parses cURL string into request config
- `generateCurlCommand()` - Generates cURL from request config
- `getMethodColor()` / `getStatusColor()` - UI color helpers
- `formatBytes()` / `formatTime()` - Display formatters
- `tryFormatJson()` - Safe JSON pretty-printing

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
| Playwright | Browser-based end-to-end tests |
| jsdom | DOM environment for Vitest component tests |

### Test Layers

```
 E2E (Playwright)         -- Full browser workflows
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
