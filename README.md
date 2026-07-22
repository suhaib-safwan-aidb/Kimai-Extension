# Kimai Extension (Local Flask Usage)

## 1) Run Flask locally

From project root:

```bash
cd flask-kimai
pip3 install -r requirements.txt
python3 app.py
```

Flask must stay running at `http://localhost:5000` while using the extension.

## 2) Upload the extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder from this project.
5. If extension is already loaded, click **Reload** after code changes.

## 3) Use extension with local Flask

1. Open extension **Options**.
2. Paste your Kimai API token.
3. Click **Test connection**.
4. Click **Save token**.
5. Open extension popup.
6. Select a project from the dropdown.
7. Click/search Jira tasks inside that project.

Notes:

- Token is saved only for current browser session (`chrome.storage.session`).
- If you close browser session, add token again.
- Extension uses local Flask APIs on `localhost`.
