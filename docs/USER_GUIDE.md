# CurlIt - User Guide

## Getting Started

### Installation

```bash
npm install
```

### Running

```bash
npm run dev
```

This starts both the Vite frontend dev server (port 5173) and the proxy server (port 3001).

Open http://localhost:5173 in your browser.

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` folder. You'll still need the proxy server running for API requests.

---

## Making Requests

### Basic Request

1. Select the HTTP method from the dropdown (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
2. Enter the URL in the input field
3. Click **Send** or press **Enter**

The response will appear in the bottom panel with status code, timing, and size.

### Query Parameters

1. Click the **Params** tab below the URL bar
2. Click **Add** to create a new parameter
3. Enter the key and value
4. Toggle the checkbox to enable/disable individual parameters
5. Parameters are automatically appended to the URL

### Request Headers

1. Click the **Headers** tab
2. Add key-value pairs for custom headers
3. Common headers like `Content-Type` are set automatically based on body type

### Request Body

1. Click the **Body** tab
2. Select the body type:
   - **None**: No request body
   - **JSON**: JSON editor with syntax highlighting
   - **Text**: Plain text editor
   - **XML**: XML editor with syntax highlighting
   - **Form Data**: Key-value pairs sent as multipart form data
   - **URL Encoded**: Key-value pairs sent as URL-encoded form data

### Authentication

1. Click the **Auth** tab
2. Select the auth type:
   - **No Auth**: No authentication
   - **Basic Auth**: Enter username and password (sent as Base64-encoded header)
   - **Bearer Token**: Enter a token (sent as `Authorization: Bearer <token>`)
   - **API Key**: Enter key name and value, choose header or query parameter

---

## Working with Tabs

- Click **+** or press **Ctrl+N** to open a new tab
- Click a tab to switch to it
- **Double-click** a tab name to rename it (press **Enter** to confirm, **Escape** to cancel)
- Click the **X** on a tab to close it (at least one tab always remains)
- The orange dot on a tab indicates unsaved modifications
- Each tab maintains its own independent request and response state

### Saving Requests (Ctrl+S)

- **Collection request** (opened from sidebar): Press **Ctrl+S** to save changes back to the collection in-place. The orange dot clears after saving.
- **New/unsaved request**: Press **Ctrl+S** to open a dialog where you can pick an existing collection or create a new one. After the first save, subsequent **Ctrl+S** presses save directly without a dialog.

---

## Collections

Collections let you organize and save requests for reuse.

### Creating a Collection

1. Click the **Collections** tab in the sidebar
2. Click the **+** button
3. Enter a collection name

### Saving a Request

1. Configure your request
2. Click the **...** menu on a collection
3. Select **Save current request**

### Opening a Saved Request

Click any request in a collection to open it in a new tab.

### Exporting a Collection

1. Click **...** on the collection
2. Select **Export**
3. A JSON file will be downloaded

### Importing a Collection

1. Click the **Import** icon at the top of the Collections panel
2. Paste the collection JSON (supports both CurlIt native format and **Postman v2.1** format)
3. Click **Import**

The import auto-detects the format. To import from Postman, export your Postman collection as **Collection v2.1** JSON, then paste it directly into the import textarea.

### Running a Collection

Execute every request in a collection sequentially and see a pass/fail summary -- the shortest path from a hand-authored suite to an automated smoke test.

1. Click **...** on the collection -> **Run collection**
2. In the runner modal, optionally pick an environment (defaults to the active one), set a per-request delay in ms (0 by default), and toggle **Stop on first failure**
3. Click **Start Run**. Each request row shows its status (pending -> running -> passed / failed / errored / skipped) and can be expanded after completion to see the response and any test results.

**What counts as a failure:**

- **passed** -- request completed and either had no tests or all tests passed
- **failed** -- one or more assertions in `testScript` failed (note: a 4xx/5xx status on its own is *not* a failure -- your tests are authoritative)
- **errored** -- the network call or pre-request script threw before a response could be collected

Chain variables set by `testScript` during the run are visible to later requests in the same run, so setup/teardown chains (login -> call -> cleanup) work naturally. Click **Stop** to abort in-flight -- any remaining requests are marked **skipped**.

---

## Environment Variables

Environments let you define variables that get substituted into your requests.

### Creating an Environment

1. Click the **Environments** tab in the sidebar
2. Click **+** and enter a name

### Adding Variables

1. Expand an environment by clicking on it
2. Add key-value pairs (e.g., key: `base_url`, value: `https://api.example.com`)

### Activating an Environment

Click the **Use** button next to an environment. The active environment shows a green indicator in the header bar.

### Using Variables in Requests

Use `{{variable_name}}` syntax anywhere in your request:

- URL: `{{base_url}}/users/{{user_id}}`
- Headers: `Authorization: Bearer {{api_token}}`
- Body: `{"user": "{{username}}"}`
- Query params: key = `api_key`, value = `{{api_key}}`
- Auth fields: token = `{{token}}`

Variables are resolved just before the request is sent.

---

## Request History

All sent requests are automatically recorded.

- Click the **History** tab in the sidebar to view past requests
- Requests are grouped by date
- Use the search box to filter by URL or method
- Click a history entry to open it in a new tab
- Click **Clear all** to delete all history

History is limited to the last 100 requests.

---

## Backup & Restore

Export all your CurlIt data (collections, environments, history, chain variables, and theme) as a single JSON file, and restore it later or on another machine.

### Exporting a Backup

1. Click **Backup** in the header
2. Review the summary (number of collections, requests, environments, history)
3. Click **Download Backup** -- a file named `curlit-backup-YYYY-MM-DD.json` is saved

### Importing a Backup

1. Click **Backup** in the header and switch to the **Import** tab
2. Choose a backup file with **Choose File**, or paste the JSON
3. Click **Validate** to preview the contents
4. Pick an import mode and confirm:
   - **Merge** (default): append to existing data; incoming collections and environments get fresh IDs so nothing is overwritten
   - **Replace**: discard all current data and restore exactly what's in the backup

Pre-request and test scripts are stripped from imported requests as a safety measure, consistent with collection imports.

---

## Sharing Requests by Link

Encode the current request into a URL you can share in chat, docs, or tickets. The recipient clicks the link and the request opens in a new tab.

### Generating a Share Link

1. Click **Share** in the header
2. By default, the link excludes **auth credentials** and **pre-request / test scripts**
3. Click **Copy Link**

### Including Secrets (Opt-In)

Tick **Include secrets** to embed auth credentials and scripts in the link. The modal shows a warning when this is on -- the encoded payload becomes part of the URL, which means anywhere the link is pasted (chat, tickets, screenshots, browser history) carries those credentials.

Leave this off unless you're sharing with someone you trust over a channel you trust.

### How It Works

- Everything is encoded in the URL fragment (`#share=...`) so the payload never reaches the proxy server or any HTTP logs.
- Form-data file attachments can't travel through a URL; those fields are converted to empty text entries on the recipient side.
- Incoming links always have pre-request / test scripts stripped on the import side, even if the sender opted in.
- Links are capped by whatever your chat/email client will accept. For very large requests the modal shows a warning -- send a backup file instead.

---

## Cloud Sync (GitHub Gist)

Sync your **collections and environments** across devices via a private Gist on your own GitHub account. Only those two are synced -- history, chain variables, and theme stay local.

### One-Time Setup (Maintainer)

The CurlIt maintainer (or self-hoster) needs to register a GitHub OAuth app:

1. Go to https://github.com/settings/developers -> **New OAuth App**
2. Application name: anything (e.g. "CurlIt")
3. Homepage URL: wherever the app is hosted
4. **Enable Device Flow** in the app's settings after creation
5. Copy the **Client ID**, then start the proxy with it in the environment:

   ```bash
   GITHUB_CLIENT_ID=Iv1.xxxxx node server/proxy.js
   ```

If `GITHUB_CLIENT_ID` isn't set, the Sync modal shows a clear "not configured" state and sign-in is hidden.

### Signing In

1. Click **Sync** in the header
2. Click **Sign in with GitHub**
3. A short code appears. Open the GitHub link, paste the code, and authorize CurlIt's `gist` scope
4. The modal flips to the signed-in view showing `@yourhandle` and your data counts

### Syncing

- **Sync Now** pushes the current collections + environments to your Gist (creates one named `curlit-sync.json` on first push; updates it on subsequent pushes).
- **Pull from Cloud** fetches the Gist and shows a preview. Pick **Merge** (default; adds with fresh IDs, nothing is overwritten) or **Replace** (confirmation required; overwrites local collections/envs).
- A second device finds the same Gist automatically by filename -- no Gist URL to copy around.

### Safety Notes

- Environment values are stored **plaintext** in your private Gist. Avoid syncing real production secrets until client-side encryption is added (a follow-up).
- Pre-request and test scripts are stripped on pull, consistent with backup and share-link imports.
- Sign out clears the OAuth token, Gist id, and last-synced timestamp from your local storage. Your Gist on GitHub is left alone -- delete it there if you want to fully revoke.

---

## cURL Integration

### Importing a cURL Command

1. Click **Import cURL** in the header or press **Ctrl+I**
2. Paste your cURL command
3. Click **Import**

CurlIt parses the method, URL, headers, body, and basic auth from the cURL command.

### Exporting as cURL

1. Configure your request
2. Click **Export cURL** in the header or press **Ctrl+E**
3. Copy the generated cURL command

---

## Response Viewer

### Body

- **Pretty**: Formatted with syntax highlighting (auto-detects JSON, XML, HTML)
- **Raw**: Unformatted response text
- **Copy**: Copy response to clipboard
- **Download**: Save response as a file

### Headers

Table view of all response headers.

### Cookies

Table view of cookies received in the response.

### Status Information

The status bar shows:
- **Status code** (color-coded: green=2xx, blue=3xx, yellow=4xx, red=5xx)
- **Response time** in milliseconds
- **Response size** in bytes/KB/MB

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save request to collection |
| `Ctrl+N` | New tab |
| `Ctrl+I` | Import cURL |
| `Ctrl+E` | Export as cURL |
| `Ctrl+B` | Toggle sidebar |
| `Enter` (in URL bar) | Send request |
| `Double-click` tab name | Rename request |

---

## Resizable Panels

- Drag the divider between the sidebar and main content to resize
- Drag the divider between the request and response panels to resize
- Panel sizes are saved automatically
