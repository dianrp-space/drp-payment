import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await esbuild.build({
  entryPoints: ["src/server.js"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  logLevel: "info",
  // Native / generated — shipped separately in release node_modules
  external: ["@prisma/client", ".prisma/*", ".prisma/client"],
});

console.log("Bundled backend → dist/server.js");
