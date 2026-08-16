/**
 * Generate dist/openapi.json for production (bundled) deploys.
 * Runtime loads this file so swagger-jsdoc does not need to scan src/routes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Minimal env so swagger.js (via env.js) can load during generate.
process.env.DATABASE_URL ||=
  "postgresql://generate:generate@127.0.0.1:5432/generate";
process.env.INTERNAL_TOKEN ||= "0123456789abcdef";
process.env.NODE_ENV ||= "development";
process.env.APP_URL ||= "https://example.com";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { generateSwaggerSpec } = await import("../src/swagger.js");

mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", "openapi.json");
const spec = generateSwaggerSpec();
writeFileSync(out, JSON.stringify(spec, null, 2));
console.log(`Wrote ${out}`);
