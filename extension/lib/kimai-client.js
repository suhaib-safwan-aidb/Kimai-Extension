const REQUEST_TIMEOUT_MS = 10000;

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
  return trimmed;
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

        // On a network error (e.g. http→https redirect + untrusted cert), probe without
        // following the redirect to distinguish "server alive" from "truly unreachable".
        if (versionError?.code === "NETWORK_ERROR") {
          const probeUrl = `${normalizedBaseUrl}/api/version`;
          const probeCtrl = new AbortController();
          const probeTimeout = setTimeout(() => probeCtrl.abort(), 8000);
          try {
            const probe = await fetch(probeUrl, {
              redirect: "manual",
              signal: probeCtrl.signal,
            });
            clearTimeout(probeTimeout);
            // opaqueredirect means the server is alive but redirects to HTTPS
            if (probe.type === "opaqueredirect" || probe.status === 0) {
              const httpsUrl = normalizedBaseUrl.replace(/^http:/i, "https:");
              throw new KimaiApiError(
                `Server is reachable but its HTTPS certificate is not trusted by this browser. ` +
                  `Fix: open ${httpsUrl} in a new tab → click Advanced → Proceed → then click Test connection again.`,
                { code: "CERT_NOT_TRUSTED", details: { httpsUrl } }
              );
            }
          } catch (probeError) {
            clearTimeout(probeTimeout);
            if (probeError instanceof KimaiApiError) throw probeError;
            // probe also failed — server is genuinely unreachable
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
