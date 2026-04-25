# CurlIt

A fast, modern, open-source API testing tool built as an alternative to Postman. Test REST APIs, manage collections, configure environments, and import/export cURL commands -- all from your browser.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Vite](https://img.shields.io/badge/Vite-5-646cff)

## Features

- **Full HTTP Client** -- GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS with color-coded method badges
- **Request Builder** -- Query params, headers, body (JSON/Text/XML/Form Data/URL Encoded), and auth (Basic, Bearer, API Key)
- **Response Viewer** -- Syntax-highlighted body (JSON, XML, HTML), headers table, cookies table, status/time/size metrics
- **Collections** -- Organize, save, and reuse requests; import/export as JSON; import Postman collections (v2.1)
- **Environment Variables** -- Define `{{variable}}` placeholders substituted at send time across URL, headers, params, body, and auth
- **Request History** -- Automatically records the last 100 requests, searchable and grouped by date
- **Multi-Tab Interface** -- Work on multiple requests simultaneously with independent state per tab; double-click tab to rename
- **cURL Import/Export** -- Paste a cURL command to create a request, or export any request as cURL
- **Save Workflow** -- `Ctrl+S` saves changes back to the source collection in-place, or prompts to pick a collection for new requests
- **Keyboard Shortcuts** -- `Ctrl+S` save, `Ctrl+N` new tab, `Ctrl+I` import cURL, `Ctrl+E` export cURL, `Ctrl+B` toggle sidebar
- **Resizable Panels** -- Drag to resize the sidebar and request/response split
- **Dark Theme** -- Purpose-built dark UI designed for long sessions
- **Local Persistence** -- Collections, environments, and history are saved to localStorage

## Quick Start

```bash
# Clone the repository
git clone https://github.com/abhimanyusinghal/curlit.git
cd curlit

# Install dependencies
npm install

# Start the dev server (frontend + proxy)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS 4 |
| State | Zustand |
| Editor | CodeMirror 6 |
| Icons | Lucide React |
| Build | Vite 5 |
| Proxy | Express.js |

## Project Structure

```
curlit/
├── docs/                  # Documentation
│   ├── ROADMAP.md
│   ├── ARCHITECTURE.md
│   └── USER_GUIDE.md
├── e2e/                   # Playwright end-to-end tests
├── electron/              # Electron desktop shell
│   ├── main.cjs           # Main process (window + IPC wiring)
│   ├── preload.cjs        # contextBridge exposing window.curlit
│   └── ipc.cjs            # Port of proxy.js logic as IPC handlers
├── server/
│   ├── proxy.js           # Express proxy to bypass CORS (browser build only)
│   └── __tests__/         # Proxy server tests
├── src/
│   ├── components/        # React components
│   │   └── __tests__/     # Component integration tests
│   ├── hooks/             # Custom hooks (resizable panels)
│   ├── store/             # Zustand state management
│   │   └── __tests__/     # Store unit tests
│   ├── test/              # Test setup and utilities
│   ├── types/             # TypeScript type definitions
│   │   └── __tests__/     # Type factory tests
│   ├── utils/             # HTTP client, cURL parser, formatters
│   │   └── __tests__/     # Utility unit tests
│   ├── App.tsx            # Root layout
│   ├── index.css          # Tailwind config & global styles
│   └── main.tsx           # Entry point
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts       # Vitest test configuration
└── playwright.config.ts   # Playwright E2E configuration
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend + proxy server |
| `npm run dev:frontend` | Start Vite dev server only |
| `npm run dev:server` | Start proxy server only |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview production build |
| `npm test` | Run all unit and integration tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with V8 coverage report |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run electron:dev` | Start Vite + the Electron desktop app in dev mode |
| `npm run electron:build` | Build the desktop app for the current platform |
| `npm run electron:build:win` / `:mac` / `:linux` | Build the desktop app for a specific target |

## Desktop App

CurlIt ships as an Electron desktop app that bypasses the browser's CORS model entirely. Requests, WebSockets, and OAuth token exchanges run in the Electron main process over IPC — no proxy server to manage.

```bash
# Dev mode (hot reload + DevTools)
npm run electron:dev

# Production build for your current platform
npm run electron:build
```

Installers are emitted to `dist-desktop/`. GitHub sync inside the desktop app still reads `GITHUB_CLIENT_ID` from the environment, the same way the proxy does.

See [docs/DESKTOP.md](docs/DESKTOP.md) for full build instructions, IPC architecture, and troubleshooting.

## Testing

CurlIt has a comprehensive test suite with **138 automated tests** across five layers:

| Layer | Tool | Tests | What it covers |
|-------|------|-------|----------------|
| Unit | Vitest | 63 | Pure utility functions (URL building, header construction, body serialization, variable substitution, cURL parsing/generation, formatters) and type factory functions |
| Store | Vitest | 37 | Zustand store actions (tabs, requests, collections, history, environments, localStorage persistence) |
| Component | Vitest + React Testing Library | 24 | All 9 React components rendered with real store state |
| Server | Vitest + Supertest | 7 | Express proxy server (request forwarding, error handling, body types) |
| E2E | Playwright | 12 | Full browser workflows (send request, collections, cURL import/export, environments, keyboard shortcuts) |

```bash
# Run unit + integration tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests (requires Chromium -- install with: npx playwright install chromium)
npm run test:e2e
```

## How It Works

In the browser build, CurlIt runs a lightweight Express proxy server alongside the Vite dev server. When you send a request, the frontend POSTs the request configuration to `/api/proxy`, which forwards it to the target API using Node.js `fetch`. This avoids browser CORS restrictions and returns the full response (status, headers, body, cookies) back to the UI.

In the desktop build, the same request payload is sent over Electron IPC to the main process instead -- the Node runtime in Electron has no CORS, so there's no proxy server to run. Everything else (WebSocket relay, OAuth token exchange, GitHub device flow) works identically via IPC.

All data (collections, environments, history, panel sizes) is persisted in `localStorage` -- no database or account required.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Write your code and add tests for new functionality
4. Run `npm test` and `npm run test:e2e` to ensure all tests pass
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the MIT License -- see the [LICENSE](LICENSE) file for details.
