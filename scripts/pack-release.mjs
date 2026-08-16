import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release");
const backendPkg = require("../backend/package.json");

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

fs.rmSync(release, { recursive: true, force: true });
fs.mkdirSync(path.join(release, "web", "dist"), { recursive: true });
fs.mkdirSync(path.join(release, "backend", "dist"), { recursive: true });

const webDist = path.join(root, "web", "dist");
const backendDist = path.join(root, "backend", "dist");

if (!fs.existsSync(path.join(webDist, "index.html"))) {
  console.error("web/dist is missing. Run: npm run build --prefix web");
  process.exit(1);
}
if (!fs.existsSync(path.join(backendDist, "server.cjs"))) {
  console.error("backend/dist/server.cjs missing. Run: npm run bundle --prefix backend");
  process.exit(1);
}
if (!fs.existsSync(path.join(backendDist, "openapi.json"))) {
  console.error(
    "backend/dist/openapi.json missing. Run: npm run openapi --prefix backend"
  );
  process.exit(1);
}

copyDir(webDist, path.join(release, "web", "dist"));
copyDir(backendDist, path.join(release, "backend", "dist"));
copyDir(path.join(root, "backend", "prisma"), path.join(release, "backend", "prisma"));
fs.copyFileSync(
  path.join(root, "backend", "ecosystem.config.cjs"),
  path.join(release, "backend", "ecosystem.config.cjs")
);

const prismaVersion =
  backendPkg.dependencies?.["@prisma/client"] ||
  backendPkg.devDependencies?.prisma ||
  "6.19.3";
const prismaCliVersion = backendPkg.devDependencies?.prisma || prismaVersion;

const beRelease = path.join(release, "backend");
fs.writeFileSync(
  path.join(beRelease, "package.json"),
  JSON.stringify(
    {
      name: "drp-payment-release",
      private: true,
      type: "module",
      dependencies: {
        "@prisma/client": prismaVersion,
        prisma: prismaCliVersion,
      },
    },
    null,
    2
  )
);

// Always fetch Linux x64 engines the production server needs,
// even if this pack step runs on Windows/macOS.
run(
  "npm",
  ["install", "--omit=dev", "--os=linux", "--cpu=x64", "--libc=glibc"],
  beRelease
);

run("npx", ["prisma", "generate"], beRelease);

fs.rmSync(path.join(beRelease, "package-lock.json"), { force: true });

console.log(`Release packed at ${release}`);
