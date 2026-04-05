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
