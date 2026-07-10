import type {
  ApiError,
  ApiLog,
  Branding,
  DashboardStats,
  Merchant,
  MerchantCreated,
  MerchantDetail,
  Paginated,
  Transaction,
  TransactionDetail,
  TransactionStatus,
} from "@/types";

const TOKEN_KEY = "drp-admin-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class HttpError extends Error {
  status: number;
  body: ApiError | null;
  constructor(status: number, message: string, body: ApiError | null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, headers = {} } = opts;

  let url = path;
  if (query) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };
  if (body !== undefined && !headers["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) finalHeaders["X-Admin-Token"] = token;

  const init: RequestInit = { method, headers: finalHeaders };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new HttpError(0, "Tidak bisa terhubung ke server", null);
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      /* not JSON */
    }
  }

  if (!res.ok) {
    const apiErr = (parsed as ApiError | null) ?? null;
    const message = apiErr?.error ?? `HTTP ${res.status}`;
    throw new HttpError(res.status, message, apiErr);
  }

  return parsed as T;
}

// ---- API surface ----

export const api = {
  health: () => request<{ status: string; timestamp: string }>("/health"),

  // Branding (public — tidak butuh auth)
  getBranding: () => request<{ branding: Branding }>("/api/branding"),

  // Auth
  login: (email: string, password: string) =>
    request<{ apiToken: string; email: string; name: string }>("/admin/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  verifyToken: () => request<{ ok: true; email: string; name: string }>("/admin/auth/verify"),
  updateCredentials: (data: {
    name?: string;
    email?: string;
    oldPassword?: string;
    newPassword?: string;
  }) =>
    request<{ email: string; name: string; ok: true }>("/admin/auth/credentials", {
      method: "PATCH",
      body: data,
    }),

  // Dashboard
  getStats: () => request<DashboardStats>("/admin/stats"),

  // Merchants
  listMerchants: () => request<{ merchants: Merchant[] }>("/admin/merchants"),
  getMerchant: (id: string) =>
    request<{ merchant: MerchantDetail }>(`/admin/merchants/${id}`),
  updateMerchant: (id: string, data: {
    name?: string;
    email?: string | null;
    staticQris?: string;
  }) =>
    request<{ merchant: Merchant }>(`/admin/merchants/${id}`, {
      method: "PATCH",
      body: data,
    }),
  createMerchant: (data: {
    name: string;
    email?: string;
    staticQris?: string;
    qrisImageBase64?: string;
    webhookUrl?: string;
  }) =>
    request<{ merchant: MerchantCreated }>(
      "/admin/merchants",
      { method: "POST", body: data }
    ),
  deleteMerchant: (id: string) =>
    request<{ ok: true }>(`/admin/merchants/${id}`, { method: "DELETE" }),
  getMerchantQrImage: (id: string) =>
    request<{ qrImageBase64: string }>(`/admin/merchants/${id}/qr-image`),
  revealMerchantApiKey: (id: string) =>
    request<{ apiKey: string; apiKeyHint: string }>(
      `/admin/merchants/${id}/api-key`
    ),
  updateWebhook: (id: string, webhookUrl: string | null) =>
    request<{ merchant: Merchant }>(`/admin/merchants/${id}/webhook`, {
      method: "PATCH",
      body: { webhookUrl },
    }),
  rotateApiKey: (id: string) =>
    request<{ apiKey: string }>(
      `/admin/merchants/${id}/rotate-api-key`,
      { method: "POST" }
    ),
  rotateWebhookSecret: (id: string) =>
    request<{ webhookSecret: string }>(
      `/admin/merchants/${id}/rotate-webhook-secret`,
      { method: "POST" }
    ),
  rotateCallbackToken: (id: string) =>
    request<{ callbackToken: string }>(
      `/admin/merchants/${id}/rotate-callback-token`,
      { method: "POST" }
    ),
  setMerchantStatus: (id: string, status: "ACTIVE" | "SUSPENDED") =>
    request<{ merchant: Merchant }>(`/admin/merchants/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),

  testMerchantWebhook: (id: string) =>
    request<{
      success: boolean;
      statusCode: number | null;
      responseBody: string | null;
      errorMessage: string | null;
      payload: unknown;
      signature: string;
    }>(`/admin/merchants/${id}/test-webhook`, { method: "POST" }),

  // Transactions
  listTransactions: (params: {
    page?: number;
    limit?: number;
    status?: TransactionStatus;
    merchantId?: string;
    q?: string;
  } = {}) =>
    request<Paginated<Transaction>>("/admin/transactions", { query: params }),
  getTransaction: (id: string) =>
    request<TransactionDetail>(`/admin/transactions/${id}`),
  retryWebhook: (id: string) =>
    request<{ ok: boolean; message: string }>(
      `/admin/transactions/${id}/retry-webhook`,
      { method: "POST" }
    ),

  // Settings — branding
  getAdminBranding: () =>
    request<{ branding: Branding }>("/admin/settings/branding"),
  updateBranding: (data: {
    appName?: string | null;
    appLogoBase64?: string | null;
    faviconBase64?: string | null;
  }) =>
    request<{ branding: Branding }>("/admin/settings/branding", {
      method: "PATCH",
      body: data,
    }),

  // Audit log (inbound API calls)
  listAuditLogs: (params: {
    page?: number;
    limit?: number;
    method?: ApiLog["method"];
    statusCodeFrom?: number;
    statusCodeTo?: number;
    merchantId?: string;
    q?: string;
  } = {}) => request<Paginated<ApiLog>>("/admin/audit-logs", { query: params }),

  getAuditStats: () =>
    request<{ total: number; oldest: string | null; newest: string | null }>(
      "/admin/audit-logs/stats"
    ),

  cleanupAuditLogs: (days: number) =>
    request<{ deleted: number; cutoff: string }>("/admin/audit-logs/cleanup", {
      method: "POST",
      body: { days },
    }),

  getAuditCleanupSettings: () =>
    request<{ settings: { enabled: boolean; retentionDays: number; intervalHours: number } }>(
      "/admin/settings/audit-cleanup"
    ),

  updateAuditCleanupSettings: (data: {
    enabled?: boolean;
    retentionDays?: number;
    intervalHours?: number;
  }) =>
    request<{ settings: { enabled: boolean; retentionDays: number; intervalHours: number } }>(
      "/admin/settings/audit-cleanup",
      { method: "PATCH", body: data }
    ),
};
