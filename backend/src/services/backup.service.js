import { execFile } from "child_process";
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

const execFileAsync = promisify(execFile);

const BACKUP_DIR = env.BACKUP_DIR || "./backups";

const EXE_SUFFIX = process.platform === "win32" ? ".exe" : "";

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

/**
 * Direktori ber-versi (mis. /usr/lib/postgresql/16/bin), diurutkan versi
 * terbaru dulu. Return [] kalau parent-nya tidak ada.
 */
function versionedBinDirs(parent, prefix = "") {
  try {
    return readdirSync(parent)
      .filter((name) => name.startsWith(prefix))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((name) => path.join(parent, name, "bin"));
  } catch {
    return [];
  }
}

/**
 * Kandidat lokasi binary PostgreSQL. PATH didahulukan, lalu lokasi install
 * umum — process yang dijalankan PM2/systemd sering punya PATH minimal
 * sehingga pg_dump tidak ketemu walaupun terinstall.
 */
function candidateBinDirs() {
  const dirs = [];

  if (env.PG_BIN_DIR) dirs.push(env.PG_BIN_DIR);

  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (dir) dirs.push(dir);
  }

  dirs.push(
    "/www/server/pgsql/bin", // aaPanel
    "/usr/local/pgsql/bin",
    "/usr/bin",
    "/usr/local/bin",
    ...versionedBinDirs("/usr/lib/postgresql"), // Debian/Ubuntu
    ...versionedBinDirs("/usr", "pgsql-"), // RHEL/PGDG
    ...versionedBinDirs("/opt/homebrew/opt", "postgresql@"), // macOS
    "/opt/homebrew/opt/libpq/bin"
  );

  return dirs;
}

const binCache = new Map();

/**
 * Cari path absolut binary PostgreSQL (pg_dump / psql).
 * Throw dengan instruksi perbaikan kalau tidak ketemu di mana pun.
 */
function resolvePgBin(name) {
  const cached = binCache.get(name);
  if (cached) return cached;

  for (const dir of candidateBinDirs()) {
    const full = path.join(dir, name + EXE_SUFFIX);
    if (existsSync(full)) {
      binCache.set(name, full);
      return full;
    }
  }

  throw unprocessable(
    `${name} tidak ditemukan di server. Install PostgreSQL client tools ` +
      `(Debian/Ubuntu: "apt install postgresql-client", RHEL: "yum install postgresql"), ` +
      `atau set PG_BIN_DIR di .env ke folder bin PostgreSQL ` +
      `(aaPanel: /www/server/pgsql/bin), lalu restart service.`
  );
}

/** Sembunyikan password DATABASE_URL yang ikut terbawa di pesan error. */
function redact(message) {
  return String(message || "").replace(
    /(postgres(?:ql)?:\/\/[^:@\s]+:)[^@\s]+@/gi,
    "$1***@"
  );
}

export async function createBackup() {
  ensureDir();

  const ts = timestamp();
  const dbName = filenameFromUrl(env.DATABASE_URL);
  const filename = `drp-backup-${dbName}-${ts}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);
  const pgDump = resolvePgBin("pg_dump");

  try {
    await execFileAsync(pgDump, [
      `--dbname=${env.DATABASE_URL}`,
      "--no-owner",
      "--no-acl",
      "--clean",
      "--if-exists",
      `--file=${filepath}`,
    ]);
  } catch (e) {
    throw unprocessable(
      `Gagal membuat backup: ${redact(e.stderr || e.message)}`
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
  const psql = resolvePgBin("psql");

  // On Error Stop=0 agar psql lanjut walau ada error minor (misal drop object yg
  // sudah tidak ada), tapi tetap reject kalau return code != 0.
  try {
    const { stdout, stderr } = await execFileAsync(
      psql,
      [
        `--dbname=${env.DATABASE_URL}`,
        `--file=${filepath}`,
        "--set",
        "ON_ERROR_STOP=0",
      ],
      { maxBuffer: 10 * 1024 * 1024 } // 10 MB buffer untuk output psql
    );
    // Log output psql untuk debugging
    const output = `${stdout || ""}${stderr || ""}`;
    if (output.includes("ERROR")) {
      console.warn("[backup] psql restore ada error (non-fatal):", output.slice(0, 500));
    }
  } catch (e) {
    throw unprocessable(
      `Gagal merestore backup: ${redact(e.stderr || e.message)}`
    );
  }

  return { ok: true, filename };
}
