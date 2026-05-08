# ai-notes-xyz-shell

A small Node web app (Express + TypeScript) that lets trusted clients:

- upload and download files in a fixed folder on the server, and  
- run shell commands in that same area.

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

- `index.ts` — starts the server.
- `serverCommon.ts` — wires up Express, `/api`, and static files.
- `config/envKeys.ts` — reads the settings above.
- `routes/routesAll.ts` — attaches the API routes.
- `routes/shellEngine/shellEngineAbout.route.ts` — small JSON “about” endpoint.
- `routes/shellEngine/shellEngineFile.route.ts` — file upload and download.
- `routes/shellEngine/shellEngineShell.route.ts` — run shell commands.
- `middleware/middlewareVerifyToken.ts` — checks the `X-API-Token` header.

## API (all under `/api`)

### Open to anyone

- **GET** `/api/` — simple welcome text. No token.

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
- **GET** `/api/shell-engine/file/read?relativePath=...` — download a file. Same path rules as write.

**Run a command** (no shell: `spawn(cmd, args, { shell: false })`)

- **POST** `/api/shell-engine/run-shell/execute` — send JSON:
  - `cmd` — required, any executable name or path resolvable from `cwd` / `PATH` (no allowlist). Legacy `command` string is **not** accepted.
  - `args` — required, array of string arguments (may be empty `[]`). Operators like `&` in URLs are safe because no shell parses this string.
  - `cwd` — optional, folder (relative path under storage) to run the command in.
  - `timeoutMs` — optional, how long to wait in milliseconds (must be ≥ 1; values above **240000** are clamped to that cap). Default **30000**.

Example body:

```json
{
  "cmd": "chromium",
  "args": [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--screenshot=out.png",
    "https://ai-notes.xyz?a=1&b=2"
  ],
  "cwd": "ai-notes-xyz-shell-files/your-thread",
  "timeoutMs": 60000
}
```

When you use the published **Docker** image, the process runs on **Ubuntu 24.04** with **Node.js 24**, **Python 3**, **npm**, **pip**, **apt-get**, **git**, **openssl**, **Chromium**, **ffmpeg**, and other packages from the Dockerfile — suitable for installing extra libraries at runtime when the host has network access.

### Path rules (simple version)

All file paths are **under** `FILE_STORAGE_PATH` (or the default `data` folder). You cannot use absolute paths or `..` to jump outside that area.

For upload and download, the path must contain the folder name **`ai-notes-xyz-shell-files`** so files stay in that subfolder.

If you do not pass `cwd` for a shell command, the command runs in `ai-notes-xyz-shell-files` inside your storage folder (the app creates it if needed).

### Example: successful file write (JSON response)

```json
{
  "message": "File written: ai-notes-xyz-shell-files/example.txt",
  "relativePath": "ai-notes-xyz-shell-files/example.txt",
  "absolutePath": "/full/path/on/the/server/example.txt",
  "size": 1234
}
```

### Example: shell command response (JSON)

You usually get **200** with a body like this (even when the command itself fails; check `exitCode`):

```json
{
  "message": "OK",
  "exitCode": 0,
  "stdout": "",
  "stderr": "",
  "timedOut": false
}
```

If the command hits the time limit, `timedOut` is `true` and `message` may say the command timed out.

### Other URLs

Requests that are not under `/api` may be served from `dist/` if a matching file exists. Otherwise you get a simple “not found” page.

## Docker

The included Docker setup builds the app and listens on port **2000** inside the container. `docker-compose` can pass `API_TOKEN` and map ports.

If you want files to survive container restarts, mount a volume and point `FILE_STORAGE_PATH` at that mounted folder inside the container.
