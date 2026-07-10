import { prisma } from "../config/db.js";
import { logger } from "../config/logger.js";
import { badRequest, notFound } from "../utils/errors.js";

const VALID_STATUSES = ["PENDING", "PAID", "EXPIRED", "FAILED"];

/**
 * Dashboard stats: merchant counts, transaction counts by status,
 * volume (PAID total) today + all time, recent activity.
 */
export async function getDashboardStats() {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  const [
    merchantCount,
    merchantsActive,
    trxByStatus,
    paidTodayAgg,
    paidAllTimeAgg,
    recentPaid,
    recentCreated,
  ] = await Promise.all([
    prisma.merchant.count(),
    prisma.merchant.count({ where: { status: "ACTIVE" } }),
    prisma.transaction.groupBy({
      by: ["status"],
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.transaction.aggregate({
      where: { status: "PAID", paidAt: { gte: startToday } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { status: "PAID" },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.transaction.findMany({
      where: { status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 5,
      include: { merchant: { select: { name: true } } },
    }),
    prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { merchant: { select: { name: true } } },
    }),
  ]);

  const statusCounts = Object.fromEntries(
    VALID_STATUSES.map((s) => [s, { count: 0, volume: 0 }])
  );
  for (const row of trxByStatus) {
    statusCounts[row.status] = {
      count: row._count,
      volume: row._sum.totalAmount ?? 0,
    };
  }

  return {
    merchants: {
      total: merchantCount,
      active: merchantsActive,
      suspended: merchantCount - merchantsActive,
    },
    transactions: statusCounts,
    volume: {
      today: paidTodayAgg._sum.totalAmount ?? 0,
      todayCount: paidTodayAgg._count,
      allTime: paidAllTimeAgg._sum.totalAmount ?? 0,
      allTimeCount: paidAllTimeAgg._count,
    },
    recentPaid: recentPaid.map(serializeAdminTransaction),
    recentCreated: recentCreated.map(serializeAdminTransaction),
  };
}

/**
 * Paginated, filterable list of all transactions across merchants.
 */
export async function listAllTransactions(query) {
  const page = Math.max(1, Math.trunc(Number(query.page ?? 1)));
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit ?? 25))));
  const status = query.status && VALID_STATUSES.includes(query.status) ? query.status : undefined;
  const merchantId = query.merchantId || undefined;
  const q = query.q ? String(query.q).trim() : undefined;

  const where = {
    AND: [
      status ? { status } : {},
      merchantId ? { merchantId } : {},
      q
        ? {
            OR: [
              { referenceId: { contains: q, mode: "insensitive" } },
              { id: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const [total, items] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { merchant: { select: { id: true, name: true } } },
    }),
  ]);

  return {
    items: items.map(serializeAdminTransaction),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Detail view: transaction + merchant snapshot + webhook logs.
 */
export async function getTransactionDetail(id) {
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: {
      merchant: {
        select: { id: true, name: true, email: true, webhookUrl: true },
      },
      webhookLogs: { orderBy: { attempt: "asc" } },
    },
  });
  if (!tx) throw notFound("Transaction not found");
  return serializeAdminTransactionDetail(tx);
}

/**
 * Hard-delete a transaction by its ID.
 */
export async function deleteTransaction(id) {
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) throw notFound("Transaction not found");
  await prisma.transaction.delete({ where: { id } });
  return { ok: true, transactionId: id };
}

/**
 * Audit log: daftar inbound API call (ApiLog), dengan filter sederhana.
 * Berguna untuk debugging & forensik — lihat siapa yang hit endpoint mana,
 * status code, IP, durasi.
 */
export async function listAuditLogs(query) {
  const page = Math.max(1, Math.trunc(Number(query.page ?? 1)));
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit ?? 25))));
  const method = query.method ? String(query.method).toUpperCase() : undefined;
  const statusCodeFrom = query.statusCodeFrom
    ? Math.trunc(Number(query.statusCodeFrom))
    : undefined;
  const statusCodeTo = query.statusCodeTo
    ? Math.trunc(Number(query.statusCodeTo))
    : undefined;
  const merchantId = query.merchantId || undefined;
  const q = query.q ? String(query.q).trim() : undefined;

  const where = {
    AND: [
      method ? { method } : {},
      statusCodeFrom || statusCodeTo
        ? {
            statusCode: {
              ...(statusCodeFrom ? { gte: statusCodeFrom } : {}),
              ...(statusCodeTo ? { lte: statusCodeTo } : {}),
            },
          }
        : {},
      merchantId ? { merchantId } : {},
      q
        ? {
            OR: [
              { path: { contains: q, mode: "insensitive" } },
              { merchantId: { contains: q, mode: "insensitive" } },
              { ip: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const [total, items] = await Promise.all([
    prisma.apiLog.count({ where }),
    prisma.apiLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: items.map((row) => ({
      id: row.id,
      merchantId: row.merchantId,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      ip: row.ip,
      userAgent: row.userAgent,
      durationMs: row.durationMs,
      createdAt: row.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Hapus audit log yang lebih lama dari X hari.
 * @param {number} days - hapus log yang createdAt < (now - days)
 * @returns {Promise<{ deleted: number, cutoff: Date }>}
 */
export async function deleteAuditLogsOlderThan(days) {
  const n = Math.trunc(Number(days));
  if (!Number.isFinite(n) || n < 1) {
    throw badRequest("Days harus angka positif (min 1)");
  }
  const cutoff = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const result = await prisma.apiLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deleted: result.count, cutoff };
}

/**
 * Statistik ringkas audit log: total, tertua, terbaru.
 */
export async function getAuditLogStats() {
  const [total, oldest, newest] = await Promise.all([
    prisma.apiLog.count(),
    prisma.apiLog.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.apiLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return {
    total,
    oldest: oldest?.createdAt ?? null,
    newest: newest?.createdAt ?? null,
  };
}

// ---- Serializers (admin view: includes merchantName) ----

function serializeAdminTransaction(t) {
  return {
    transactionId: t.id,
    merchantId: t.merchantId,
    merchantName: t.merchant?.name ?? null,
    referenceId: t.referenceId,
    status: t.status,
    amount: t.amount,
    fee: t.fee,
    uniqueDigit: t.uniqueDigit,
    totalAmount: t.totalAmount,
    paidAmount: t.paidAmount,
    paidAt: t.paidAt,
    expiresAt: t.expiresAt,
    createdAt: t.createdAt,
    matchedBy: t.matchedBy,
    webhookStatus: t.webhookStatus,
    webhookAttempts: t.webhookAttempts,
  };
}

function serializeAdminTransactionDetail(t) {
  return {
    ...serializeAdminTransaction(t),
    qrisString: t.qrisString,
    qrisImageBase64: t.qrisImageBase64,
    merchant: t.merchant,
    webhookLogs: (t.webhookLogs ?? []).map((l) => ({
      id: l.id,
      attempt: l.attempt,
      eventType: l.eventType,
      statusCode: l.statusCode,
      success: l.success,
      responseBody: l.responseBody,
      errorMessage: l.errorMessage,
      payload: l.payload,
      createdAt: l.createdAt,
    })),
  };
}
