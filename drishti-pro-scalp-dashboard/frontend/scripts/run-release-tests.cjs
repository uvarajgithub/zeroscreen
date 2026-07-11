#!/usr/bin/env node
/** Compiles and runs the CC-009 release-readiness regression tests. Mirrors scripts/run-business-tests.cjs. */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, ".test-output-release");

fs.rmSync(outDir, { recursive: true, force: true });

try {
  execSync(
    `npx tsc --module commonjs --target ES2020 --esModuleInterop --outDir "${outDir}" ` +
      `"${path.join(root, "src/command-center/business/__tests__/cc009ReleaseReadiness.test.ts")}"`,
    { stdio: "inherit", cwd: root },
  );
  fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }));
  execSync(`node "${path.join(outDir, "business/__tests__/cc009ReleaseReadiness.test.js")}"`, { stdio: "inherit", cwd: root });
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
