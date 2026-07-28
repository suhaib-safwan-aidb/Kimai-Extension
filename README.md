# Kimai Jira Search — Chrome Extension

A Chrome extension that lets you search Kimai activities by Jira task key and start/stop timers — directly from your browser, without any backend server.

---

## What you need before starting

- **Google Chrome** browser
- Access to your Kimai instance (e.g. `http://localhost:8001`)
- Your **Kimai API token** (one-time setup, takes about 1 minute)

---

## Step 1 — Get your Kimai API token

1. Open your Kimai instance in Chrome (e.g. `http://localhost:8001`).
2. Click your name/avatar in the top-right corner → **API access** (or go directly to `/en/profile/api-token`).
3. Click **Create token**, give it any name, and copy the long token string.
4. Keep it somewhere safe — you'll paste it into the extension shortly.

---

## Step 2 — Install the extension in Chrome

1. Download or clone this repository to your computer.
2. Open Chrome and go to `chrome://extensions` in the address bar.
3. Turn on **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked**.
5. In the file picker, select the **`extension`** folder inside this project.
6. The **Kimai Jira Search** extension icon will appear in your toolbar.

> If you ever update the extension files, go back to `chrome://extensions` and click the **Reload** button (circular arrow) under the extension card.

---

## Step 3 — Connect the extension to your Kimai

1. Click the extension icon in the Chrome toolbar (or right-click it and choose **Options**).
2. Paste your API token from Step 1 into the **API token** field.
3. Click **Test connection** — you should see a green success message.
4. Click **Save token**.

> The token is stored only for the current browser session. If you close and reopen Chrome, you will need to paste it again. This is intentional for security.

---

## Step 4 — Start tracking time

1. Click the extension icon to open the popup.
2. Pick a **project** from the dropdown.
3. Browse or search for a Jira task (e.g. type `PROJ-123`).
4. Click **Start** next to the task you are working on.
5. Optionally add a short description, then confirm.
6. The extension shows a live timer while the task runs.
7. Click **Stop Task** when you are done — the time entry is saved in Kimai automatically.

---

## Changing the Kimai server URL

If your Kimai is running at a different address (e.g. after a server move), two files need to be updated:

**File 1 — `extension/config.js`**

Open this file in any text editor and change the URL on line 1:

```js
export const KIMAI_BASE_URL = "http://localhost:8001";
```

Replace `http://localhost:8001` with your new Kimai address.

**File 2 — `extension/manifest.json`**

Open this file and update the `host_permissions` line to match the same address (add `/*` at the end):

```json
"host_permissions": ["http://localhost:8001/*"]
```

After saving both files, go to `chrome://extensions` and click **Reload** under the extension.

---

## Troubleshooting

| Problem | What to try |
|---|---|
| "Cannot reach Kimai server" | Make sure your Kimai is running and the URL in `config.js` matches exactly |
| "Unauthorized (401)" | Your API token is wrong or expired — get a new one from Kimai and re-enter it |
| No projects or tasks showing | Make sure your Kimai activities have Jira-style keys in their name (e.g. `PROJ-123`) |
| Extension not updating | Go to `chrome://extensions` and click **Reload** after any file change |
| Token forgotten after browser restart | This is by design — paste your token again via the extension Options page |
