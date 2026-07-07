import { Jimp } from "jimp";
import jsQR from "jsqr";

export async function parseQrisFromImage(base64Image) {
  const raw = base64Image.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(raw, "base64");

  const image = await Jimp.read(buffer);
  const { data, width, height } = image.bitmap;

  const code = jsQR(data, width, height);
  if (!code) throw new Error("Tidak dapat membaca QR code dari gambar");

  return code.data;
}
