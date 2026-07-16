# CurlIt

A fast, modern, open-source API testing tool for engineers who build and validate HTTP, GraphQL, and WebSocket APIs. Use it in a browser, with the optional local agent, or as a self-contained Electron desktop app.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Vite](https://img.shields.io/badge/Vite-6-646cff)

## Features

- **Full HTTP Client** -- GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS with color-coded method badges
- **Request Builder** -- Query params, headers, body (JSON, text, XML, multipart files, URL encoded, binary, GraphQL), SSL controls, and auth (Basic, Bearer, API key, OAuth 2.0)
- **Automation** -- Pre-request and test scripts, assertions, chain variables, console output, and sequential collection runs
- **WebSockets** -- Connect with request headers/auth, send messages, inspect text/binary frames, and export message logs
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
- **Desktop App** -- Electron build with main-process HTTP, WebSocket, and OAuth support; no local proxy required
- **Local Agent** -- Route the hosted browser UI through a local binary to reach localhost, VPN, and intranet APIs

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
| Build | Vite 6 |
| Proxy | Express.js |
| Desktop | Electron |

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
| `npm run build:desktop` | Type-check and build the renderer with packaged-app-safe relative asset paths |
| `npm run electron:build` | Build desktop installer(s) for the current platform |
| `npm run electron:package` | Build an unpacked desktop app for a local smoke test |
| `npm run electron:build:win` / `:mac` / `:linux` | Build installer(s) on the matching platform |

## Desktop App

CurlIt ships as an Electron desktop app that bypasses the browser's CORS model entirely. Requests, WebSockets, and OAuth token exchanges run in the Electron main process over IPC — no proxy server to manage.

```bash
# Dev mode (hot reload + DevTools)
npm run electron:dev

# Production installer(s) for your current platform
npm run electron:build

# Unpacked local smoke test
npm run electron:package
```

Installers are emitted to `dist-desktop/`. Build distribution artifacts on their native OS: Windows produces an NSIS installer, macOS produces separate x64 and arm64 DMGs, and Linux produces AppImage and `.deb` packages. GitHub sync inside the desktop app still reads `GITHUB_CLIENT_ID` from the environment, the same way the proxy does.

See [docs/DESKTOP.md](docs/DESKTOP.md) for build/release signing requirements, IPC architecture, and troubleshooting.

The local agent is for the hosted browser UI: it runs the same proxy on `localhost:3001`, allowing requests to private networks that a cloud backend cannot reach. The Electron app does not need the agent because it performs network operations in its own main process. See the [user guide](docs/USER_GUIDE.md#browser-proxy-local-agent-and-desktop-app) for the operating modes and security boundary.

## Testing

CurlIt has coverage across unit, store, component, server, Electron desktop, and end-to-end layers:

| Layer | Tool | What it covers |
|-------|------|----------------|
| Unit and store | Vitest | Utilities, request serialization, URL and header construction, and Zustand state transitions |
| Component | Vitest + React Testing Library | React UI behavior with real store state |
| Server | Vitest + Supertest | Express proxy request forwarding, error handling, and body types |
| Electron desktop | Vitest | IPC validation, navigation and preload security, WebSocket lifecycle, and packaged-app configuration |
| E2E | Playwright | Full browser workflows: requests, collections, cURL import/export, environments, and keyboard shortcuts |

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
