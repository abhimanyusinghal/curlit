# CurlIt Desktop App

CurlIt ships as an Electron desktop app. Unlike the browser build, the desktop
app needs no proxy server -- HTTP requests, WebSocket connections, OAuth token
exchanges, and the GitHub device-flow sign-in all run inside the Electron main
process (Node.js), which has no CORS restrictions.

The renderer (the React UI) is the same code as the browser build. A small
runtime check (`isDesktop()` in [`src/utils/desktop.ts`](../src/utils/desktop.ts))
decides whether to dispatch over IPC or to the Express proxy.

## Run in development

```bash
npm install
npm run electron:dev
```

This starts Vite on `http://localhost:5173` and launches Electron pointing at
that URL via `CURLIT_DEV_URL`. DevTools open in detached mode automatically.
Hot-reload works for the renderer; if you change anything in `electron/`,
restart the script.

## Build a desktop installer

```bash
# Current platform
npm run electron:build

# Or target a specific OS
npm run electron:build:win
npm run electron:build:mac
npm run electron:build:linux
```

Installers are emitted to `dist-desktop/`:

- **Windows** -- NSIS installer (`.exe`) with desktop shortcut + custom install
  path
- **macOS** -- universal `.dmg` (x64 + arm64)
- **Linux** -- `AppImage` and `.deb`

Cross-platform builds work from any host but require platform-specific signing
toolchains for distribution. For local testing the unsigned binary in
`dist-desktop/<platform>-unpacked/` runs as-is.

## Architecture

```
electron/
├── main.cjs        Main process: BrowserWindow + IPC wiring
├── preload.cjs     contextBridge exposing window.curlit to the renderer
└── ipc.cjs         Handlers ported from server/proxy.js
```

The renderer talks to the main process through a single object,
`window.curlit`, defined in [`src/utils/desktop.ts`](../src/utils/desktop.ts):

| Method | Replaces |
|---|---|
| `http(payload)` | `POST /api/proxy` |
| `oauthToken(payload)` | `POST /api/oauth/token` |
| `githubStatus()` | `GET /api/github/status` |
| `githubDeviceCode()` | `POST /api/github/device-code` |
| `githubDeviceToken(code)` | `POST /api/github/device-token` |
| `wsConnect / wsSend / wsClose / onWsEvent` | `ws://.../api/ws-proxy` relay |

Payload shapes are intentionally identical to what the Express endpoints accept,
so the call sites only differ in transport.

## Configuring GitHub sync in the desktop build

The desktop `githubStatus`/`githubDeviceCode`/`githubDeviceToken` handlers read
`process.env.GITHUB_CLIENT_ID` -- same as the proxy server. To enable GitHub
sync in the packaged app, launch it with the env var set, e.g. on macOS:

```bash
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxxxxx open -a CurlIt
```

If the env var is unset, the GitHub sync UI gracefully reports
"GITHUB_CLIENT_ID not configured" and the rest of the app works normally.

## Why Electron and not Tauri

Tauri produces a smaller binary (~10 MB vs Electron's ~200 MB), but CurlIt
already has a mature Node.js proxy (Express + undici + `ws` + manual multipart
construction with proper boundary handling). Porting that to Rust would have
been a multi-week rewrite for cosmetic gains. Electron lets the same code run
in both environments with a thin transport-shim, which is the right trade for
a v1.

## Troubleshooting

**Desktop window opens but the page is blank.** Check that `dist/index.html`
exists. The desktop build expects a production renderer bundle; run
`npm run electron:build` (which calls `vite build --base=./` first) rather than
`vite build` -- the relative base path is required so assets resolve under the
`file://` protocol.

**Requests hang or show "Failed to fetch" in dev mode.** Vite is probably not
running yet. The `electron:dev` script waits on TCP 5173 before launching
Electron; if you launched Electron manually, start Vite first.

**`app is undefined` when launching `electron electron/main.cjs`.** The shell
has `ELECTRON_RUN_AS_NODE=1` set in its environment, which forces Electron to
run as plain Node. Unset it (`unset ELECTRON_RUN_AS_NODE`) and retry.
