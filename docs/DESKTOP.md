# CurlIt Desktop App

CurlIt ships as an Electron desktop app. Unlike the browser build, it does not
need the Express proxy: HTTP requests, WebSocket connections, OAuth token
exchanges, and GitHub device-flow sign-in run in Electron's main process.

The renderer remains the React application. At runtime,
[`isDesktop()`](../src/utils/desktop.ts) chooses IPC for the packaged app and
the Express proxy for the browser app.

## Development

Use Node.js 22.12 or newer, then install the locked dependency set:

```bash
npm ci
npm run electron:dev
```

This starts Vite on `http://localhost:5173` and then launches Electron. Changes
under `src/` hot-reload; restart the command after changing files in
`electron/`.

## Build and smoke-test a package

Every desktop build runs TypeScript checking before Vite and electron-builder.

```bash
# Installer(s) for the current host platform
npm run electron:build

# Package an unpacked app only; useful for a local launch smoke test
npm run electron:package
```

The platform-specific commands are available when you are running on the
matching platform:

| Platform | Command | Release output |
|---|---|---|
| Windows x64 | `npm run electron:build:win` | NSIS `.exe` installer |
| macOS x64 and arm64 | `npm run electron:build:mac` | Separate `.dmg` images for each architecture |
| Linux x64 | `npm run electron:build:linux` | `AppImage` and `.deb` |

Artifacts are written to `dist-desktop/` with names like
`CurlIt-1.4.0-win-x64.exe`. Unpacked smoke-test apps are also placed there
(for example, `win-unpacked/`).

Build distribution artifacts on their native OS. electron-builder can perform
some cross-platform packaging, but native Windows/macOS runners are required
for signing and notarization and avoid platform-toolchain surprises. In
particular, the macOS target produces two architecture-specific DMGs; it is not
a universal DMG.

The build uses `build/icons/icon.png`; electron-builder converts it to each
platform's required icon format. Production dependencies listed in
`package.json` are collected into `app.asar`, including the `undici` and `ws`
modules used by the main process.

## Release pipeline

Pushing a `v*` tag runs [Release CurlIt](../.github/workflows/release-agent.yml).
It verifies the focused Electron lint/test suite, builds the agent binaries and
desktop artifacts, then publishes them with a `SHA256SUMS.txt` file on the
GitHub release. The tag must exactly match `v` plus the version in
`package.json` (for example, package version `1.4.0` requires tag `v1.4.0`),
or the workflow stops before building release assets.

Tagged Windows and macOS releases deliberately fail rather than publish
unsigned installers. Configure these repository secrets before creating a
release tag:

| Target | Required GitHub Actions secrets |
|---|---|
| Windows | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |
| macOS signing | `CSC_LINK`, `CSC_KEY_PASSWORD` |
| macOS notarization | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

`*_CSC_LINK` values are supplied to electron-builder as certificate locations
or base64 certificate data, as supported by electron-builder. The macOS job
uses hardened runtime and the checked-in Electron entitlements before it
submits the signed app for notarization. Linux artifacts are not platform-code
signed; verify their published SHA-256 checksums.

A manual workflow dispatch builds unsigned artifacts for testing and does not
create a GitHub release. Pull requests also run the desktop CI on Windows,
macOS, and Linux, build the real unsigned distribution artifacts, and retain
them as workflow artifacts for seven days.

## Architecture

```
electron/
├── main.cjs        Main process: BrowserWindow lifecycle and IPC wiring
├── preload.cjs     Narrow contextBridge API exposed as window.curlit
└── ipc.cjs         HTTP, OAuth, GitHub, and WebSocket IPC handlers
```

The renderer talks to the main process through `window.curlit`, defined in
[`src/utils/desktop.ts`](../src/utils/desktop.ts):

| Method | Replaces |
|---|---|
| `http(payload)` | `POST /api/proxy` |
| `oauthToken(payload)` | `POST /api/oauth/token` |
| `githubStatus()` | `GET /api/github/status` |
| `githubDeviceCode()` | `POST /api/github/device-code` |
| `githubDeviceToken(code)` | `POST /api/github/device-token` |
| `wsConnect / wsSend / wsClose / onWsEvent` | `ws://.../api/ws-proxy` relay |

Payload shapes intentionally match the Express endpoints, so call sites change
only transport.

The packaged app uses an ASAR archive and Electron fuses that disable
`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and Node inspector arguments. It also
enables Electron's cookie encryption and ASAR integrity/loading protections.
Its renderer is served from the restricted `curlit://app/index.html` custom
scheme rather than `file://`, and the renderer document defines a restrictive
Content Security Policy.

## Configuring GitHub sync in the desktop build

The desktop GitHub handlers read `process.env.GITHUB_CLIENT_ID`, as does the
browser proxy. Set it before launching the app if GitHub sync is needed. For
example on macOS:

```bash
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxxxxx open -a CurlIt
```

If it is not set, the GitHub sync UI reports `GITHUB_CLIENT_ID not configured`;
the rest of the app remains available.

## Troubleshooting

**The window is blank after packaging.** Confirm `dist/index.html` exists and
use one of the Electron scripts rather than calling Vite directly. Those scripts
build with `--base=./`, which keeps renderer assets relative to the packaged
`curlit://app` origin.

**The package cannot load `undici` or `ws`.** Rebuild after `npm ci`; do not
add a `node_modules` exclusion to `electron-builder.yml`. Production
dependencies are intentionally included in the ASAR archive.

**Requests hang in development.** Vite may not be ready yet. `electron:dev`
waits for port 5173; if Electron was started manually, start Vite first.

**`app is undefined` when running Electron manually in development.**
`ELECTRON_RUN_AS_NODE` is set in that shell. `npm run electron:dev` removes it
automatically; if you invoke Electron yourself, unset it first. Packaged
release builds ignore that variable by design.

**A local macOS build is unsigned or not notarized.** This is expected without
the release credentials. Use the tagged GitHub Actions workflow for
distributable macOS artifacts.
