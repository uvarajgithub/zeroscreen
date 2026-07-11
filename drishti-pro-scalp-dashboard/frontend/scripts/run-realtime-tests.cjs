#!/usr/bin/env node
/**
 * Compiles and runs the Command Center real-time isolation/reconciliation
 * regression tests (src/command-center/business/realtime/__tests__) with
 * plain `tsc` + `node`, mirroring scripts/run-business-tests.cjs.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, ".test-output-realtime");

fs.rmSync(outDir, { recursive: true, force: true });

try {
  execSync(
    `npx tsc --module commonjs --target ES2020 --esModuleInterop --resolveJsonModule --outDir "${outDir}" ` +
      `"${path.join(root, "src/command-center/business/realtime/__tests__/realtimeIsolation.test.ts")}"`,
    { stdio: "inherit", cwd: root },
  );
  fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }));
  execSync(`node "${path.join(outDir, "business/realtime/__tests__/realtimeIsolation.test.js")}"`, { stdio: "inherit", cwd: root });
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
