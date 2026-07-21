const REQUEST_TIMEOUT_MS = 10000;
export const AIDB_ALLOWED_HOST = "kimai.k8s.private.aidb";
export const AIDB_ALLOWED_HTTPS_BASE_URL = `https://${AIDB_ALLOWED_HOST}`;

export class KimaiApiError extends Error {
  constructor(message, { code = "UNKNOWN_ERROR", status, details } = {}) {
    super(message);
    this.name = "KimaiApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeBaseUrl(url) {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new KimaiApiError("Kimai server URL is required.", { code: "INVALID_URL" });
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new KimaiApiError("Kimai server URL must start with http:// or https://", {
      code: "INVALID_URL",
    });
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new KimaiApiError("Kimai server URL is invalid.", { code: "INVALID_URL" });
  }

  if (parsed.host.toLowerCase() !== AIDB_ALLOWED_HOST) {
    throw new KimaiApiError(
      `This extension is dedicated to AIDB. Use ${AIDB_ALLOWED_HTTPS_BASE_URL} only.`,
      {
        code: "UNSUPPORTED_HOST",
        details: { allowedHost: AIDB_ALLOWED_HOST },
      }
    );
  }

  return parsed.origin;
}

export function createKimaiClient(baseUrl, apiToken) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!apiToken?.trim()) {
    throw new KimaiApiError("API token is required.", { code: "INVALID_TOKEN" });
  }


  async function kimaiFetch(path, options = {}) {
    const activeBase = options.overrideBaseUrl ?? normalizedBaseUrl;
    const url = `${activeBase}${path.startsWith("/") ? path : `/${path}`}`;
    const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${apiToken.trim()}`,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new KimaiApiError("Connection timeout. Kimai server is not responding.", {
          code: "TIMEOUT",
          details: { url, path, timeoutMs },
        });
      }
      throw new KimaiApiError("Cannot reach Kimai server. Check URL and network connection.", {
        code: "NETWORK_ERROR",
        details: { url, path, reason: error?.message || String(error) },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message =
        (typeof data === "object" && data?.message) ||
        (typeof data === "string" && data) ||
        `Request failed with status ${response.status}`;
      const code =
        response.status >= 500
          ? "HTTP_5XX"
          : response.status === 401
            ? "HTTP_401"
            : response.status === 404
              ? "HTTP_404"
              : `HTTP_${response.status}`;
      throw new KimaiApiError(message, {
        code,
        status: response.status,
        details: { url, path },
      });
    }

    return data;
  }

  return {
    async testConnection() {
      try {
        await kimaiFetch("/api/version");
      } catch (versionError) {
        if (["HTTP_404", "HTTP_405"].includes(versionError?.code)) {
          await kimaiFetch("/api/activities?size=1");
          return { effectiveBaseUrl: normalizedBaseUrl };
        }

        // On network errors, probe whether HTTP is redirecting to HTTPS and cert trust is the blocker.
        if (versionError?.code === "NETWORK_ERROR") {
          const httpsUrl = normalizedBaseUrl.replace(/^http:/i, "https:");
          const httpUrl = normalizedBaseUrl.replace(/^https:/i, "http:");

          const redirectProbeCtrl = new AbortController();
          const redirectProbeTimeout = setTimeout(() => redirectProbeCtrl.abort(), 8000);
          try {
            const redirectProbe = await fetch(`${httpUrl}/api/version`, {
              redirect: "manual",
              signal: redirectProbeCtrl.signal,
            });
            clearTimeout(redirectProbeTimeout);

            if (
              redirectProbe.type === "opaqueredirect" ||
              [301, 302, 307, 308].includes(redirectProbe.status)
            ) {
              throw new KimaiApiError(
                `Server redirects HTTP to HTTPS. Plain HTTP cannot be used. ` +
                  `If HTTPS is untrusted, ask IT to install the AIDB root CA. URL: ${httpsUrl}`,
                { code: "HTTP_FORCES_HTTPS", details: { httpsUrl } }
              );
            }

            // If no redirect and the endpoint answers over plain HTTP, use HTTP directly.
            if ([200, 401, 403, 404, 405].includes(redirectProbe.status)) {
              return { effectiveBaseUrl: httpUrl };
            }
          } catch (probeError) {
            clearTimeout(redirectProbeTimeout);
            if (probeError instanceof KimaiApiError) throw probeError;

            // If HTTPS itself is unreachable and HTTP probe is inconclusive, treat it as trust issue first.
            if (/^https:/i.test(normalizedBaseUrl)) {
              throw new KimaiApiError(
                `Cannot establish trusted HTTPS connection to ${httpsUrl}. ` +
                  `Ask IT to install the AIDB root CA on this machine, then restart browser and test again.`,
                { code: "CERT_NOT_TRUSTED", details: { httpsUrl } }
              );
            }
          }
        }

        throw versionError;
      }
      return { effectiveBaseUrl: normalizedBaseUrl };
    },

    async searchActivities(term) {
      const params = new URLSearchParams({
        term: term.trim(),
        size: "20",
        full: "true",
      });
      const data = await kimaiFetch(`/api/activities?${params.toString()}`);
      return Array.isArray(data) ? data : [];
    },

    async getActiveTimesheets() {
      const data = await kimaiFetch("/api/timesheets/active");
      return Array.isArray(data) ? data : [];
    },

    async stopTimesheet(id) {
      return kimaiFetch(`/api/timesheets/${id}/stop`, { method: "PATCH" });
    },

    async startTimesheet(projectId, activityId) {
      return kimaiFetch("/api/timesheets", {
        method: "POST",
        body: {
          project: projectId,
          activity: activityId,
        },
      });
    },

    async startTimerForActivity(activity) {
      const projectId = activity.project?.id ?? activity.project;
      const activityId = activity.id ?? activity.activity?.id ?? activity.activity;

      if (!projectId || !activityId) {
        throw new Error("Activity is missing project or activity ID.");
      }

      const activeTimesheets = await this.getActiveTimesheets();
      for (const timesheet of activeTimesheets) {
        await this.stopTimesheet(timesheet.id);
      }

      return this.startTimesheet(projectId, activityId);
    },
  };
}

export async function loadKimaiClient() {
  const { kimaiBaseUrl, apiToken } = await chrome.storage.local.get([
    "kimaiBaseUrl",
    "apiToken",
  ]);

  if (!kimaiBaseUrl || !apiToken) {
    throw new KimaiApiError("Configure your Kimai server URL and API token in extension options.", {
      code: "MISSING_SETTINGS",
    });
  }

  return createKimaiClient(kimaiBaseUrl, apiToken);
}
