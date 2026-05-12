# ai-notes-xyz-opencode-custom-utils

A small Node web app (Express + TypeScript) that lets trusted clients:

- upload, download, and list files in a fixed folder on the server, and  
- run shell commands on the server.

Access is protected with a secret token. By default, files go under a `data` folder next to where you start the app. You can change that folder with an environment variable. The app can also serve static files from `dist/` if you add them.

## What you need

- Node.js 18 or newer (22 matches the Docker setup)
- npm

## Run it

```bash
npm install
npm run build
npm start
```

Put settings in a `.env` file in the project root if you want (see below). `npm start` loads `.env` automatically.

For local work with auto-reload:

```bash
npm run dev
```

The app listens on port **2001** unless you set `EXPRESS_PORT`.

## Settings (environment variables)

| Name | What it does |
| ---- | ------------- |
| `EXPRESS_PORT` | Port number. Default **2001**. |
| `API_TOKEN` | Secret string. Clients must send it in the header `X-API-Token`. If you leave this empty, protected URLs return **503**. If you set it but the header is wrong or missing, you get **401**. |
| `FILE_STORAGE_PATH` | Where files are stored on disk. If you do not set it, the app uses a `data` folder in the current working directory when the server starts. You can set a full path or a relative path (it is turned into a full path at startup). |

## Project files (short map)

- `src/index.ts` — starts the server.
- `src/serverCommon.ts` — wires up Express, `/api`, and static files.
- `src/config/envKeys.ts` — reads the settings above.
- `src/routes/routesAll.ts` — attaches the API routes.
- `src/routes/shellEngine/shellEngineAbout.route.ts` — small JSON “about” endpoint.
- `src/routes/shellEngine/shellEngineFile.route.ts` — file upload, download, and recursive listing.
- `src/routes/shellEngine/shellEngineShell.route.ts` — run shell commands.
- `src/middleware/middlewareVerifyToken.ts` — checks the `X-API-Token` header.

## API (all under `/api`)

### Open to anyone

- **GET** `/api/` — welcome text: `Welcome to ai notes shell engine.` No token.

### About (app name)

These URLs only return JSON; they do not read or write your file storage.

- **GET** `/api/shell-engine/about` — public. Tells you the app name.

  ```json
  { "app": "ai-notes-xyz-shell" }
  ```

  Example:

  ```bash
  curl -s http://localhost:2001/api/shell-engine/about
  ```

- **GET** `/api/shell-engine/about/private` — needs a valid **`X-API-Token`** header (same value as `API_TOKEN` in `.env`).

  - Missing or wrong token → **401** (`{"message":"Invalid or missing API token"}` from the verifier).
  - `API_TOKEN` unset on the server → **503** (`{"message":"API_TOKEN is not configured"}`).

  On **200**, the body always includes **`validateToken: true`**. That flag means the server accepted your token for this request (same middleware as file upload and shell execute).

  ```json
  { "app": "ai-notes-xyz-shell", "validateToken": true }
  ```

  Examples (port **2001**):

  ```bash
  # Valid token — 200 + JSON above
  curl -s -H "X-API-Token: YOUR_TOKEN_HERE" http://localhost:2001/api/shell-engine/about/private

  # No header — 401
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:2001/api/shell-engine/about/private
  ```

### Needs the token (`X-API-Token: <your API_TOKEN>`)

**File helpers**

- Base URL: `/api/shell-engine/file`
- **POST** `/api/shell-engine/file/write` — send a multipart form with:
  - `file` — the file (one file only),
  - `relativePath` — where to save it, as a path **under** your storage folder (see rules below).
  - Max size **50MB** per upload.
  - On success the server returns **201** with JSON (see example below).
- **GET** `/api/shell-engine/file/list` — list files recursively under a directory. Query parameters:
  - `relativeDir` — optional; directory **under** storage (same path rules as read/write). If omitted, defaults to **`ai-notes-xyz-shell-files`**.
  - `maxFiles` — optional; default **300**, capped at **500**.
  - `maxDepth` — optional; default **24**, capped at **64** (recursion depth from `relativeDir`; `0` means only that directory).
  - Response **200:** `{ "files": [ { "relativePath", "size", "mtimeMs" } ] }`. Symbolic links are skipped; the walk stops when the caps are reached.

  Example:

  ```bash
  curl -s -H "X-API-Token: YOUR_TOKEN_HERE" "http://localhost:2001/api/shell-engine/file/list?relativeDir=ai-notes-xyz-shell-files&maxFiles=50&maxDepth=5"
  ```

- **GET** `/api/shell-engine/file/read?relativePath=...` — download a file. Same path rules as write.

**Run a command** (Node `child_process.exec`)

The server runs your string through a shell, so pipes, redirects, and other shell features apply. Commands are **not** limited to `FILE_STORAGE_PATH`; they run with the server process user and environment.

- **POST** `/api/shell-engine/run-shell/execute` — send JSON:
  - `command` — required, non-empty string (the full command line).
  - `timeoutMs` — optional; wait time in milliseconds. If omitted, default **15000**. If provided, must be ≥ **1**; values above **120000** are clamped to that cap.
  - **200** — `{ "message": "Command executed successfully", "stdout", "stderr" }`.
  - **400** — invalid `command`, or the command failed (non-zero exit, signal, timeout, etc.). Validation errors use `{ "message": "..." }`; execution errors add `"error"`, `"stdout"`, and `"stderr"`.

Example body:

```json
{
  "command": "chromium --headless=new --disable-gpu --no-sandbox --screenshot=out.png 'https://ai-notes.xyz?a=1&b=2'",
  "timeoutMs": 60000
}
```

When you use the published **Docker** image, the process runs on **Ubuntu 24.04** with **Node.js 24**, **Python 3**, **npm**, **pip**, **apt-get**, **git**, **openssl**, **Chromium**, **ffmpeg**, and other packages from the Dockerfile — suitable for installing extra libraries at runtime when the host has network access.

### Path rules (simple version)

All file paths are **under** `FILE_STORAGE_PATH` (or the default `data` folder). You cannot use absolute paths or `..` to jump outside that area.

For upload, download, and listing, the path must contain the folder name **`ai-notes-xyz-shell-files`** so files stay in that subfolder.

### Example: successful file write (JSON response, HTTP **201**)

```json
{
  "message": "File written: ai-notes-xyz-shell-files/example.txt",
  "relativePath": "ai-notes-xyz-shell-files/example.txt",
  "absolutePath": "/full/path/on/the/server/example.txt",
  "size": 1234
}
```

### Example: shell command responses (JSON)

On success (**200**):

```json
{
  "message": "Command executed successfully",
  "stdout": "",
  "stderr": ""
}
```

If the command string is missing or empty, you get **400** with `{ "message": "A non-empty command string is required" }`.

If the command runs but fails (non-zero exit, signal, timeout, etc.), you get **400** with a body like:

```json
{
  "message": "Command execution failed",
  "error": "Command failed: ...",
  "stdout": "",
  "stderr": ""
}
```

Example:

```bash
curl -s -X POST -H "Content-Type: application/json" -H "X-API-Token: YOUR_TOKEN_HERE" \
  -d '{"command":"echo hello","timeoutMs":5000}' \
  http://localhost:2001/api/shell-engine/run-shell/execute
```

### Other URLs

Requests that are not under `/api` may be served from `dist/` if a matching file exists. Otherwise you get a simple “not found” page.

## Docker

The included Docker setup builds the app and listens on port **2000** inside the container. `docker-compose` can pass `API_TOKEN` and map ports.

If you want files to survive container restarts, mount a volume and point `FILE_STORAGE_PATH` at that mounted folder inside the container.
