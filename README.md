# CurlIt

A fast, modern, open-source API testing tool built as an alternative to Postman. Test REST APIs, manage collections, configure environments, and import/export cURL commands -- all from your browser.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Vite](https://img.shields.io/badge/Vite-5-646cff)

## Live Demo

Try CurlIt in your browser: **[abhimanyusinghal.github.io/curlit](https://abhimanyusinghal.github.io/curlit/)**

> The demo runs entirely in the browser. To make API requests, you'll need to run the proxy server locally (see [Proxy Server](#proxy-server) below).

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
├── server/
│   ├── proxy.js           # Express proxy to bypass CORS
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

CurlIt runs a lightweight Express proxy server alongside the Vite dev server. When you send a request, the frontend POSTs the request configuration to `/api/proxy`, which forwards it to the target API using Node.js `fetch`. This avoids browser CORS restrictions and returns the full response (status, headers, body, cookies) back to the UI.

All data (collections, environments, history, panel sizes) is persisted in `localStorage` -- no database or account required.

## Proxy Server

CurlIt needs a proxy server to make HTTP requests from the browser (to bypass CORS). The proxy is a standalone Express server in `server/proxy.js`.

**Option 1: Run locally**

```bash
git clone https://github.com/abhimanyusinghal/curlit.git
cd curlit && npm install
npm run dev:server    # starts proxy on http://localhost:3001
```

**Option 2: Deploy your own**

The proxy server (`server/proxy.js`) can be deployed to any Node.js hosting platform (Railway, Render, Fly.io, etc.). It has minimal dependencies: `express` and `cors`.

Once deployed, open the Settings (gear icon) in CurlIt and set your proxy URL (e.g., `https://my-curlit-proxy.railway.app/api/proxy`).

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
