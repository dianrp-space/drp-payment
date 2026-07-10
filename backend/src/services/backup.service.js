import { exec } from "child_process";
import { promisify } from "util";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import path from "path";
import { env } from "../config/env.js";
import { badRequest, notFound, unprocessable } from "../utils/errors.js";

const execAsync = promisify(exec);

const BACKUP_DIR = env.BACKUP_DIR || "./backups";

function ensureDir() {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Format tanggal untuk nama file: YYYY-MM-DD-HHmmss
 */
function timestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}-${M}-${d}-${h}${m}${s}`;
}

function filenameFromUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, "") || "database";
  } catch {
    return "database";
  }
}

export async function createBackup() {
  ensureDir();

  const ts = timestamp();
  const dbName = filenameFromUrl(env.DATABASE_URL);
  const filename = `drp-backup-${dbName}-${ts}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);

  try {
    await execAsync(
      `pg_dump --dbname="${env.DATABASE_URL}" --no-owner --no-acl --clean --if-exists --file="${filepath}"`
    );
  } catch (e) {
    throw unprocessable(
      `Gagal membuat backup: ${e.stderr || e.message}`
    );
  }

  const stat = statSync(filepath);
  return { filename, size: stat.size, createdAt: new Date().toISOString() };
}

export function listBackups() {
  ensureDir();

  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("drp-backup-") && f.endsWith(".sql"))
    .map((f) => {
      const s = statSync(path.join(BACKUP_DIR, f));
      return {
        filename: f,
        size: s.size,
        createdAt: s.birthtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return files;
}

export function getBackupPath(filename) {
  const resolved = path.resolve(BACKUP_DIR, filename);

  // Protect against path traversal
  if (!resolved.startsWith(path.resolve(BACKUP_DIR))) {
    throw badRequest("Invalid backup filename");
  }

  if (!existsSync(resolved)) {
    throw notFound("Backup file not found");
  }

  return resolved;
}

export function deleteBackup(filename) {
  const filepath = getBackupPath(filename);
  unlinkSync(filepath);
  return { ok: true };
}

export async function restoreBackup(filename) {
  const filepath = getBackupPath(filename);

  // On Error Stop=0 agar psql lanjut walau ada error minor (misal drop object yg
  // sudah tidak ada), tapi tetap reject kalau return code != 0.
  try {
    const { stderr } = await execAsync(
      `psql --dbname="${env.DATABASE_URL}" --file="${filepath}" --set ON_ERROR_STOP=0 2>&1`,
      { maxBuffer: 10 * 1024 * 1024 } // 10 MB buffer untuk output psql
    );
    // Log output psql untuk debugging
    if (stderr && stderr.includes("ERROR")) {
      console.warn("[backup] psql restore ada error (non-fatal):", stderr.slice(0, 500));
    }
  } catch (e) {
    throw unprocessable(
      `Gagal merestore backup: ${e.stderr || e.message}`
    );
  }

  return { ok: true, filename };
}
