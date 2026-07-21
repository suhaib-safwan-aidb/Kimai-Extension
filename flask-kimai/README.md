# Flask Kimai API

Simple Flask API to fetch Jira tasks from Kimai server.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the server:
```bash
python3 app.py
```

Server runs on `http://localhost:5000`

## API Endpoints

### POST /api/tasks
Fetch Jira tasks from Kimai.

**Request:**
```json
{
  "token": "your_kimai_api_token"
}
```

**Response:**
```json
{
  "success": true,
  "count": 328,
  "tasks": [...]
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"token":"your_token_here"}'
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

**Example:**
```bash
curl http://localhost:5000/health
```
