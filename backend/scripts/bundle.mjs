import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

// CJS output (same pattern as drp-portfolio). Express and most deps are CJS;
// ESM bundles hit "Dynamic require of path/fs is not supported" at runtime.
await esbuild.build({
  entryPoints: ["src/server.js"],
  outfile: "dist/server.cjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: false,
  logLevel: "info",
  // Native / generated — shipped separately in release node_modules
  external: ["@prisma/client", ".prisma/*", ".prisma/client"],
});

console.log("Bundled backend → dist/server.cjs");
