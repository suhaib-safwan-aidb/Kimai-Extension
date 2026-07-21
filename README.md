# Kimai Jira Search Extension + Local Flask API

This project now has two parts:

- `extension/`: Chrome extension UI for searching Jira-like Kimai tasks.
- `flask-kimai/`: Local Flask API that receives token in request body, calls Kimai, and returns filtered tasks.

The extension does not ask for Kimai URL anymore. It asks for token only, saves it in browser session storage, and calls your local Flask API at `http://localhost:5000`.

## Architecture

1. User opens extension options and pastes API token.
2. Extension tests token by calling local Flask API.
3. Token is saved in `chrome.storage.session` (current browser session only).
4. Popup search calls extension background worker.
5. Background worker calls `POST http://localhost:5000/api/tasks` with `{ "token": "..." }`.
6. Flask API calls Kimai (`https://kimai.k8s.private.aidb`) and returns Jira-like tasks.

## Project Structure

```text
extension/
  manifest.json
  background/
    service-worker.js
  popup/
    popup.html
    popup.js
    popup.css
  options/
    options.html
    options.js
    options.css
  lib/
    kimai-client.js
  icons/

flask-kimai/
  app.py
  kimai_tasks.py
  requirements.txt
  README.md

install-ca.sh
launch-browser.sh
```

## Flask API Setup

From project root:

```bash
cd flask-kimai
pip3 install -r requirements.txt
python3 app.py
```

Server runs on:

- `http://localhost:5000`

Health check:

```bash
curl http://localhost:5000/health
```

Expected response:

```json
{"status":"ok"}
```

## Flask API Endpoints

### `POST /api/tasks`

Fetches Jira-like Kimai tasks using token from request body.

Request body:

```json
{
  "token": "your_kimai_api_token"
}
```

Success response:

```json
{
  "success": true,
  "count": 328,
  "tasks": [
    {
      "id": 122,
      "name": "AI Agent",
      "comment": "ADB-153"
    }
  ]
}
```

Error response example:

```json
{
  "error": "Token is required in request body"
}
```

### `GET /health`

Simple service check.

## Extension Setup

1. Open Chrome: `chrome://extensions`
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `extension/` folder.
4. Keep Flask API running locally (`python3 flask-kimai/app.py`).
5. Open extension **Options**.
6. Paste Kimai API token.
7. Click **Test connection**.
8. Click **Save token**.

Notes:

- Token is saved in browser session storage only.
- When browser session ends, token must be entered again.
- Extension uses local Flask API (`localhost`) and does not call Kimai directly.

## Usage

1. Click extension icon.
2. Search by Jira key or task text (for example `ADB-153`).
3. Select result from list.

## Direct API Test (without extension)

```bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"token":"your_kimai_api_token"}'
```

## Current Behavior Summary

- Token-only input in extension options.
- Session-based token persistence (`chrome.storage.session`).
- Localhost Flask bridge for all task retrieval.
- Kimai URL fixed inside Flask logic (`https://kimai.k8s.private.aidb`).
- Jira-like task filtering handled by Flask `kimai_tasks.py`.
