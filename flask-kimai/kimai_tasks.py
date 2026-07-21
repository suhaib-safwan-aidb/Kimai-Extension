#!/usr/bin/env python3
"""Fetch Kimai tasks (activities) with Jira keys using your API token."""


from __future__ import annotations

import getpass
import json
import re
import ssl
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

AIDB_ALLOWED_HOST = "kimai.k8s.private.aidb"
AIDB_DEFAULT_BASE_URL = f"https://{AIDB_ALLOWED_HOST}"
REQUEST_TIMEOUT_SECONDS = 15
JIRA_KEY_PATTERN = re.compile(r"\b[A-Z][A-Z0-9]+-\d+\b")


class KimaiApiError(Exception):
    """Raised when the Kimai API request fails."""


def kimai_get(
    base_url: str,
    token: str,
    path: str,
    query: dict[str, Any] | None = None,
    insecure: bool = False,
) -> tuple[Any, dict[str, str]]:
    if query:
        path = f"{path}?{urlencode(query)}"

    url = f"{base_url}{path if path.startswith('/') else '/' + path}"
    request = Request(
        url=url,
        method="GET",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )

    context = None
    if insecure:
        context = ssl._create_unverified_context()  # noqa: SLF001

    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS, context=context) as response:
            body = response.read().decode("utf-8")
            data = json.loads(body) if body else None
            headers = {k: v for k, v in response.headers.items()}
            return data, headers
    except HTTPError as error:
        details = ""
        try:
            payload = error.read().decode("utf-8")
            if payload:
                details = f" Response: {payload}"
        except Exception:
            pass
        raise KimaiApiError(f"HTTP {error.code} calling {url}.{details}") from error
    except URLError as error:
        raise KimaiApiError(f"Network error calling {url}: {error.reason}") from error


def fetch_all_activities(base_url: str, token: str, insecure: bool) -> list[dict[str, Any]]:
    all_items: list[dict[str, Any]] = []
    seen_ids: set[int] = set()
    page = 1
    size = 100
    max_pages = 200

    while page <= max_pages:
        data, _headers = kimai_get(
            base_url=base_url,
            token=token,
            path="/api/activities",
            query={"page": page, "size": size, "full": "true"},
            insecure=insecure,
        )

        if not isinstance(data, list):
            raise KimaiApiError("Unexpected API response for /api/activities (expected list).")

        if not data:
            break

        new_items = 0
        for item in data:
            item_id = item.get("id")
            if isinstance(item_id, int):
                if item_id in seen_ids:
                    continue
                seen_ids.add(item_id)
            all_items.append(item)
            new_items += 1

        # Some Kimai setups ignore/loop pagination; stop if a page has no unseen items.
        if new_items == 0 or len(data) < size:
            break

        page += 1

    return all_items


def test_connection(base_url: str, token: str, insecure: bool) -> dict[str, Any]:
    data, _headers = kimai_get(
        base_url=base_url,
        token=token,
        path="/api/version",
        insecure=insecure,
    )
    if not isinstance(data, dict):
        raise KimaiApiError("Unexpected API response for /api/version (expected object).")
    return data


def find_jira_keys(activity: dict[str, Any]) -> list[str]:
    haystack = " ".join(
        str(activity.get(field, "")) for field in ("name", "comment", "description")
    )
    return sorted(set(JIRA_KEY_PATTERN.findall(haystack)))


def filter_jira_activities(activities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [item for item in activities if find_jira_keys(item)]


def print_activity_table(activities: list[dict[str, Any]]) -> None:
    if not activities:
        print("No tasks found.")
        return

    print(f"Found {len(activities)} task(s):")
    for item in activities:
        activity_id = item.get("id", "-")
        name = item.get("name", "-")
        comment = item.get("comment") or "-"
        project = item.get("project")
        jira_keys = ", ".join(find_jira_keys(item)) or "-"

        project_name = "-"
        if isinstance(project, dict):
            project_name = project.get("name", "-")
        elif project is not None:
            project_name = str(project)

        print(
            f"- [{activity_id}] {name} (project: {project_name}, jira: {jira_keys}, comment: {comment})"
        )


def main() -> int:
    base_url = AIDB_DEFAULT_BASE_URL
    insecure = True
    
    token = getpass.getpass("Enter Kimai API token: ").strip()
    if not token:
        print("Error: API token is required.", file=sys.stderr)
        return 1

    try:
        tasks = get_jira_tasks(token)
        print_activity_table(tasks)
    except KimaiApiError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    return 0


def get_jira_tasks(token: str) -> list[dict[str, Any]]:
    """Fetch Jira tasks from Kimai. Raises KimaiApiError on failure."""
    base_url = AIDB_DEFAULT_BASE_URL
    insecure = True
    
    test_connection(base_url, token, insecure)
    activities = fetch_all_activities(base_url, token, insecure)
    return filter_jira_activities(activities)


if __name__ == "__main__":
    raise SystemExit(main())
