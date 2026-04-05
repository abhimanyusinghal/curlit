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
2. Paste the collection JSON
3. Click **Import**

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
