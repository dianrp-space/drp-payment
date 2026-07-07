import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../config/db.js";
import { hashApiKey, safeEqualHex } from "../utils/crypto.js";
import { unauthorized, forbidden } from "../utils/errors.js";
import { findByToken as findAdminByToken } from "../services/admin-auth.service.js";

const BEARER_RE = /^Bearer\s+(.+)$/i;

function extractApiKey(req) {
  const header = req.headers["authorization"];
  if (!header) return null;
  const m = header.match(BEARER_RE);
  return m ? m[1].trim() : null;
}

function extractToken(req, headerName) {
  const v = req.headers[headerName.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Merchant API key auth.
 * Attaches `req.merchant` (the merchant row) on success.
 */
export async function requireMerchant(req, _res, next) {
  try {
    const rawKey = extractApiKey(req);
    if (!rawKey) throw unauthorized("Missing Authorization header");

    const hash = hashApiKey(rawKey);
    // Lookup by hash index
    const merchant = await prisma.merchant.findUnique({
      where: { apiKeyHash: hash },
    });
    if (!merchant) throw unauthorized("Invalid API key");
    if (merchant.status !== "ACTIVE") throw forbidden("Merchant suspended");

    req.merchant = merchant;
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Admin auth via X-Admin-Token (lookup in DB).
 */
export async function requireAdmin(req, _res, next) {
  try {
    const token = extractToken(req, "X-Admin-Token");
    if (!token) throw unauthorized("Missing admin token");

    const admin = await findAdminByToken(token);
    if (!admin) throw unauthorized("Invalid admin token");

    req.admin = admin;
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Internal (system-to-system) auth used by payment detector (Macrodroid).
 * Accepts either X-Internal-Token header.
 */
export function requireInternal(req, _res, next) {
  const token = extractToken(req, "X-Internal-Token");
  if (!token || !safeEqualHex(Buffer.from(token, "utf8").toString("hex"), Buffer.from(env.INTERNAL_TOKEN, "utf8").toString("hex"))) {
    return next(unauthorized("Invalid internal token"));
  }
  next();
}
