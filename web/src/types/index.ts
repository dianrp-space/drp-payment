export type TransactionStatus = "PENDING" | "PAID" | "EXPIRED" | "FAILED";
export type MerchantStatus = "ACTIVE" | "SUSPENDED";
export type WebhookStatus = "NONE" | "PENDING" | "SENT" | "FAILED";

export interface Transaction {
  transactionId: string;
  merchantId: string;
  merchantName: string | null;
  referenceId: string;
  status: TransactionStatus;
  amount: number;
  fee: number;
  uniqueDigit: number;
  totalAmount: number;
  paidAmount: number | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
  matchedBy: string | null;
  webhookStatus: WebhookStatus;
  webhookAttempts: number;
}

export interface TransactionDetail extends Transaction {
  qrisString: string;
  qrisImageBase64: string;
  merchant: {
    id: string;
    name: string;
    email: string | null;
    webhookUrl: string | null;
  };
  webhookLogs: WebhookLog[];
}

export interface WebhookLog {
  id: string;
  attempt: number;
  eventType: string;
  statusCode: number | null;
  success: boolean;
  responseBody: string | null;
  errorMessage: string | null;
  payload: unknown;
  createdAt: string;
}

export interface ApiLog {
  id: string;
  merchantId: string | null;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface Merchant {
  id: string;
  name: string;
  email: string | null;
  apiKeyHint: string;
  webhookUrl: string | null;
  status: MerchantStatus;
  createdAt: string;
  _count?: { transactions: number };
}

export interface MerchantDetail extends Merchant {
  webhookSecret: string;
  callbackToken: string | null;
  staticQris: string;
  qrisName: string | null;
  qrisCity: string | null;
  qrisProvider: string | null;
}

export interface MerchantCreated extends Merchant {
  apiKey: string;
  webhookSecret: string;
  callbackToken: string | null;
  notice: string;
}

export interface DashboardStats {
  merchants: { total: number; active: number; suspended: number };
  transactions: Record<
    TransactionStatus,
    { count: number; volume: number }
  >;
  volume: {
    today: number;
    todayCount: number;
    allTime: number;
    allTimeCount: number;
  };
  recentPaid: Transaction[];
  recentCreated: Transaction[];
}

export interface Paginated<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: string;
  code: string;
  details?: Array<{ path: string; message: string }>;
}

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

export interface Branding {
  appName: string;
  appLogoBase64: string | null;
  faviconBase64: string | null;
  appUrl: string;
}
