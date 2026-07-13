# Kimai Jira Search Chrome Extension

A minimal Chrome extension that connects to a Kimai server via API token, searches activities (including Jira task keys in names), and starts a timer when you pick a result.

## Setup

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the [`extension`](extension) folder in this repo.
4. Open the extension **Options** page (right-click the extension icon → Options).
5. Enter your Kimai server URL (e.g. `https://your-kimai.example.com` or `http://your-kimai.example.com`) and API token.
6. Click **Test connection** and allow host access when prompted.
7. After a successful test, click **Save**.

### API token

Create a token in Kimai from your user menu → **API access**. Use the token value with Bearer authentication (not your login password).

## Usage

1. Click the extension icon in the toolbar.
2. Type a Jira key or partial activity name (e.g. `PROJ-123`).
3. Click a result to start a Kimai timer for that activity.

If another timer is already running, it is stopped automatically before the new one starts.

## Project structure

```
extension/
├── manifest.json
├── background/service-worker.js
├── lib/kimai-client.js
├── popup/
├── options/
└── icons/
```

## Switching servers

When your AIDB Kimai URL is ready, update the server URL in the extension Options page. No code changes are required.

## Internal servers with self-signed / untrusted HTTPS certificates

If your Kimai server uses a private CA certificate (e.g. `kimai.k8s.private.aidb`),
the browser's extension service worker enforces TLS and blocks the connection.

### Permanent fix — install the CA certificate once per machine

This is a one-time operation. Once done, the browser works normally with no flags.

**Step 1 — get the CA certificate from your DevOps / k8s admin.**
Ask them to run one of these on the cluster and send you the resulting `.pem` file:

```bash
# Option A — via kubectl (most common)
kubectl get secret -n cert-manager private-aidb-root-ca \
	-o jsonpath='{.data.tls\.crt}' | base64 -d > private-aidb-ca.pem

# Option B — from ClusterIssuer
kubectl get secret -n cert-manager \
	$(kubectl get clusterissuer -o jsonpath='{.items[0].spec.ca.secretName}') \
	-o jsonpath='{.data.ca\.crt}' | base64 -d > private-aidb-ca.pem
```

**Step 2 — run the install script** (once per employee machine):

```bash
bash install-ca.sh private-aidb-ca.pem
```

**Step 3 — fully restart Chrome/Brave** (close all windows, reopen).
The extension will now connect to any `*.private.aidb` server without flags or warnings.

## API endpoints used

- `GET /api/activities?term=...` — search activities
- `GET /api/timesheets/active` — show running timer
- `PATCH /api/timesheets/{id}/stop` — stop current timer
- `POST /api/timesheets` — start a new timer
