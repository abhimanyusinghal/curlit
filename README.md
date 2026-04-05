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
- **Collections** -- Organize, save, and reuse requests; import/export as JSON
- **Environment Variables** -- Define `{{variable}}` placeholders substituted at send time across URL, headers, params, body, and auth
- **Request History** -- Automatically records the last 100 requests, searchable and grouped by date
- **Multi-Tab Interface** -- Work on multiple requests simultaneously with independent state per tab
- **cURL Import/Export** -- Paste a cURL command to create a request, or export any request as cURL
- **Keyboard Shortcuts** -- `Ctrl+N` new tab, `Ctrl+I` import cURL, `Ctrl+E` export cURL, `Ctrl+B` toggle sidebar
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
│   ├── IMPLEMENTATION_PLAN.md
│   ├── ARCHITECTURE.md
│   └── USER_GUIDE.md
├── server/
│   └── proxy.js           # Express proxy to bypass CORS
├── src/
│   ├── components/        # React components
│   ├── hooks/             # Custom hooks (resizable panels)
│   ├── store/             # Zustand state management
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # HTTP client, cURL parser, formatters
│   ├── App.tsx            # Root layout
│   ├── index.css          # Tailwind config & global styles
│   └── main.tsx           # Entry point
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend + proxy server |
| `npm run dev:frontend` | Start Vite dev server only |
| `npm run dev:server` | Start proxy server only |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview production build |

## How It Works

CurlIt runs a lightweight Express proxy server alongside the Vite dev server. When you send a request, the frontend POSTs the request configuration to `/api/proxy`, which forwards it to the target API using Node.js `fetch`. This avoids browser CORS restrictions and returns the full response (status, headers, body, cookies) back to the UI.

All data (collections, environments, history, panel sizes) is persisted in `localStorage` -- no database or account required.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License -- see the [LICENSE](LICENSE) file for details.
