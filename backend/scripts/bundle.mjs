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
  banner: {
    // So __dirname-style helpers and CJS interop work in the ESM bundle
    js: `import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);`,
  },
});

console.log("Bundled backend → dist/server.js");
