# CurlIt - Implementation Plan & Progress

## Project Overview

CurlIt is a full-featured Postman clone built as a modern web application for API testing and development. It provides a complete HTTP request builder, response viewer, collections management, environment variables, and cURL import/export.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React 19 + TypeScript |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 4 |
| State Management | Zustand |
| Code Editor | CodeMirror 6 (via @uiw/react-codemirror) |
| Icons | Lucide React |
| Backend Proxy | Express.js |
| Persistence | localStorage |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    CurlIt App                    │
├──────────┬──────────────────────────────────────┤
│          │  ┌─────────────────────────────────┐  │
│ Sidebar  │  │         Request Tabs            │  │
│          │  ├─────────────────────────────────┤  │
│ - Colls  │  │  [Method] [URL Input] [Send]    │  │
│ - History│  ├─────────────────────────────────┤  │
│ - Envs   │  │   Params | Headers | Body | Auth │  │
│          │  │   ┌─────────────────────────┐   │  │
│          │  │   │   Key-Value Editor /    │   │  │
│          │  │   │   Code Editor           │   │  │
│          │  │   └─────────────────────────┘   │  │
│          │  ├── ─ ─ resize handle ─ ─ ─ ─ ─ ─┤  │
│          │  │   Body | Headers | Cookies       │  │
│          │  │   ┌─────────────────────────┐   │  │
│          │  │   │   Response Viewer       │   │  │
│          │  │   │   (CodeMirror)          │   │  │
│          │  │   └─────────────────────────┘   │  │
│          │  └─────────────────────────────────┘  │
├──────────┴──────────────────────────────────────┤
│              Status Bar                          │
└─────────────────────────────────────────────────┘
```

## Implementation Status

### Phase 1: Core Infrastructure ✅

- [x] Project scaffolding with Vite + React + TypeScript
- [x] Tailwind CSS 4 integration with custom dark theme
- [x] Zustand state management store
- [x] TypeScript type definitions for all data models
- [x] Custom resizable panel hook

### Phase 2: Request Builder ✅

- [x] HTTP method selector (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- [x] URL input with Enter-to-send
- [x] Send button with loading state
- [x] Query parameters editor (key-value with enable/disable)
- [x] Headers editor (key-value with enable/disable)
- [x] Request body editor with multiple types:
  - [x] None
  - [x] JSON (with syntax highlighting)
  - [x] Plain Text
  - [x] XML (with syntax highlighting)
  - [x] Form Data (key-value)
  - [x] URL Encoded (key-value)
- [x] Authentication configuration:
  - [x] No Auth
  - [x] Basic Auth (username/password)
  - [x] Bearer Token
  - [x] API Key (header or query param)

### Phase 3: Response Viewer ✅

- [x] Status code with color coding (2xx green, 3xx blue, 4xx yellow, 5xx red)
- [x] Response time display
- [x] Response size display
- [x] Response body viewer with syntax highlighting (JSON, XML, HTML)
- [x] Pretty / Raw toggle for response body
- [x] Response headers table
- [x] Cookies table
- [x] Copy response to clipboard
- [x] Download response as file
- [x] Error display for failed requests

### Phase 4: Collections ✅

- [x] Create collections with names
- [x] Save requests to collections
- [x] Open requests from collections
- [x] Delete requests from collections
- [x] Rename collections
- [x] Delete collections
- [x] Export collections as JSON
- [x] Import collections from JSON
- [x] Collapsible collection tree

### Phase 5: Environment Variables ✅

- [x] Create environments with names
- [x] Add/edit/delete variables per environment
- [x] Enable/disable individual variables
- [x] Set active environment
- [x] Variable substitution in URL, headers, params, body, auth
- [x] `{{variable}}` syntax support
- [x] Active environment indicator in header

### Phase 6: Request History ✅

- [x] Automatic recording of all sent requests
- [x] History grouped by date
- [x] Search/filter history
- [x] Open request from history (creates new tab)
- [x] Clear all history
- [x] Status code indicator per entry

### Phase 7: Multi-Tab Support ✅

- [x] Tab bar with method badge and name
- [x] Add new tab (+ button or Ctrl+N)
- [x] Close tabs (always keeps at least one)
- [x] Switch between tabs
- [x] Modified indicator on tabs
- [x] Each tab has independent request/response state

### Phase 8: cURL Integration ✅

- [x] Import cURL commands via modal (Ctrl+I)
- [x] Parses method, URL, headers, body, auth from cURL
- [x] Export current request as cURL command (Ctrl+E)
- [x] Copy cURL command to clipboard

### Phase 9: Proxy Server ✅

- [x] Express.js proxy server to bypass CORS
- [x] Forwards all HTTP methods
- [x] Handles JSON, form data, and text bodies
- [x] Returns response status, headers, body, cookies
- [x] Error handling for network failures
- [x] Vite dev server proxy configuration

### Phase 10: UI Polish ✅

- [x] Dark theme with custom color palette
- [x] Resizable sidebar (drag to resize)
- [x] Resizable request/response panels (drag to resize)
- [x] Keyboard shortcuts (Ctrl+N, Ctrl+I, Ctrl+E, Ctrl+B)
- [x] Custom scrollbars
- [x] Smooth transitions and hover effects
- [x] Status bar with tab count and shortcuts reference
- [x] Collapsible sidebar

### Phase 11: Persistence ✅

- [x] Collections saved to localStorage
- [x] History saved to localStorage (last 100 entries)
- [x] Environments saved to localStorage
- [x] Active environment selection saved
- [x] Panel sizes saved to localStorage

## File Structure

```
curlit/
├── docs/
│   ├── IMPLEMENTATION_PLAN.md    # This file
│   ├── ARCHITECTURE.md           # Architecture details
│   └── USER_GUIDE.md             # User guide
├── server/
│   └── proxy.js                  # Express proxy server
├── src/
│   ├── components/
│   │   ├── CurlExportModal.tsx   # cURL export dialog
│   │   ├── CurlImportModal.tsx   # cURL import dialog
│   │   ├── KeyValueEditor.tsx    # Reusable key-value pair editor
│   │   ├── MethodBadge.tsx       # HTTP method colored badge
│   │   ├── RequestPanel.tsx      # Request configuration (params, headers, body, auth)
│   │   ├── RequestTabs.tsx       # Tab bar for multiple requests
│   │   ├── ResponsePanel.tsx     # Response viewer (body, headers, cookies)
│   │   ├── Sidebar.tsx           # Sidebar (collections, history, environments)
│   │   └── UrlBar.tsx            # URL input with method selector and send button
│   ├── hooks/
│   │   └── useResizable.ts       # Custom hook for resizable panels
│   ├── store/
│   │   └── index.ts              # Zustand store with all state management
│   ├── types/
│   │   └── index.ts              # TypeScript type definitions
│   ├── utils/
│   │   └── http.ts               # HTTP utilities (send, parse cURL, format, etc.)
│   ├── App.tsx                   # Main application layout
│   ├── index.css                 # Global styles and Tailwind config
│   └── main.tsx                  # Entry point
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Key Design Decisions

1. **Zustand over Redux**: Simpler API, less boilerplate, perfect for this app's complexity level.
2. **CodeMirror over Monaco**: Smaller bundle size while still providing excellent syntax highlighting.
3. **Proxy server**: Required to bypass CORS restrictions when testing APIs from a browser.
4. **localStorage**: Simple persistence without needing a database. Suitable for a single-user desktop tool.
5. **Custom resizable panels**: Avoided dependency issues with react-resizable-panels v4 API changes by implementing a lightweight custom hook.
6. **Tailwind CSS 4**: Modern utility-first CSS with custom theme configuration for the dark UI.
