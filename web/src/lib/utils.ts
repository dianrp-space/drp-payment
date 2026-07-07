import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format integer IDR dengan pemisah ribuan Indonesia. */
export function formatIDR(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Format angka tanpa simbol mata uang. */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("id-ID").format(n);
}

/** Format ISO date ke format pendek Indonesia (e.g. "06 Jul 2026, 22.30"). */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Relative time: "baru saja", "5 menit lalu", "kemarin". */
export function relativeTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "baru saja";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return formatDateTime(d);
}

/**
 * Sisa waktu menuju sebuah momen di masa depan, atau seberapa lama sudah
 * lewat kalau momen itu sudah lampau.
 *
 * - Masa depan: "dalam 5 menit", "dalam 2 jam", "dalam < 1 menit"
 * - Masa lalu: "lewat 5 menit", "lewat 2 jam", "baru saja lewat"
 * - Negatif besar / > 7 hari: fallback ke formatDateTime
 *
 * Berguna untuk countdown kedaluwarsa transaksi.
 */
export function timeUntil(iso: string | Date | null | undefined): {
  past: boolean;
  label: string;
} {
  if (!iso) return { past: false, label: "—" };
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return { past: false, label: "—" };

  const diff = d.getTime() - Date.now();
  const past = diff <= 0;
  const abs = Math.abs(diff);
  const sec = Math.floor(abs / 1000);

  let label: string;
  if (sec < 60) {
    label = past ? "baru saja lewat" : "dalam < 1 menit";
  } else if (sec < 3600) {
    const min = Math.floor(sec / 60);
    label = past ? `lewat ${min} menit` : `dalam ${min} menit`;
  } else if (sec < 86400) {
    const hr = Math.floor(sec / 3600);
    label = past ? `lewat ${hr} jam` : `dalam ${hr} jam`;
  } else if (sec < 7 * 86400) {
    const day = Math.floor(sec / 86400);
    label = past ? `lewat ${day} hari` : `dalam ${day} hari`;
  } else {
    label = formatDateTime(d);
  }

  return { past, label };
}

/** Singkat ID (cuid/uuid) untuk tampilan: "cmr9dh4…". */
export function shortId(id: string | null | undefined, head = 8): string {
  if (!id) return "—";
  return id.length > head + 1 ? `${id.slice(0, head)}…` : id;
}

/** Copy text ke clipboard dengan fallback. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
