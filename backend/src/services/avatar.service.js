import {
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Jimp } from "jimp";
import { env } from "../config/env.js";
import { prisma } from "../config/db.js";
import { badRequest, notFound } from "../utils/errors.js";

const AVATAR_SIZE = 512;
const PUBLIC_PREFIX = "/uploads/merchants";

export function getUploadRoot() {
  return path.resolve(env.UPLOAD_DIR || "./uploads");
}

export function getMerchantsUploadDir() {
  return path.join(getUploadRoot(), "merchants");
}

function ensureMerchantsDir() {
  const dir = getMerchantsUploadDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function absoluteFromPublicPath(avatarPath) {
  // "/uploads/merchants/x.png" → under UPLOAD_DIR
  if (!avatarPath?.startsWith("/uploads/")) return null;
  const rel = avatarPath.slice("/uploads/".length);
  return path.join(getUploadRoot(), rel);
}

/**
 * Process buffer → square PNG, write to disk, update Merchant.avatarPath.
 * @param {string} merchantId
 * @param {Buffer} buffer
 * @param {string} mime
 */
export async function saveMerchantAvatar(merchantId, buffer, mime) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(mime)) {
    throw badRequest("Format gambar harus JPEG, PNG, atau WebP");
  }
  if (!buffer?.length) throw badRequest("File avatar kosong");

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw notFound("Merchant not found");

  let image;
  try {
    image = await Jimp.read(buffer);
  } catch {
    throw badRequest("File gambar tidak valid / rusak");
  }

  image.cover({ w: AVATAR_SIZE, h: AVATAR_SIZE });

  const dir = ensureMerchantsDir();
  const filename = `${merchantId}.png`;
  const absPath = path.join(dir, filename);
  const publicPath = `${PUBLIC_PREFIX}/${filename}`;

  if (merchant.avatarPath && merchant.avatarPath !== publicPath) {
    const prev = absoluteFromPublicPath(merchant.avatarPath);
    if (prev && existsSync(prev)) {
      try {
        unlinkSync(prev);
      } catch {
        /* ignore */
      }
    }
  }

  const png = await image.getBuffer("image/png");
  writeFileSync(absPath, png);

  return prisma.merchant.update({
    where: { id: merchantId },
    data: { avatarPath: publicPath },
  });
}

export async function deleteMerchantAvatar(merchantId) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw notFound("Merchant not found");

  if (merchant.avatarPath) {
    const abs = absoluteFromPublicPath(merchant.avatarPath);
    if (abs && existsSync(abs)) {
      try {
        unlinkSync(abs);
      } catch {
        /* ignore */
      }
    }
  }

  return prisma.merchant.update({
    where: { id: merchantId },
    data: { avatarPath: null },
  });
}
