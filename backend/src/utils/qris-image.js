import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { Jimp } = require("jimp");
const jsQR = require("jsqr");

/**
 * Decode QR string dari buffer gambar.
 * @param {Buffer} buffer
 * @returns {Promise<string>} QR payload
 */
export async function decodeQRFromImage(buffer) {
  const image = await Jimp.read(buffer);
  const imageData = new Uint8ClampedArray(image.bitmap.data);
  const code = jsQR(imageData, image.bitmap.width, image.bitmap.height);
  if (!code) {
    throw new Error("QR Code not found in image");
  }
  return code.data;
}
