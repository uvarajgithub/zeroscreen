#!/usr/bin/env node
/**
 * Compiles and runs the Command Center business-layer regression tests
 * (src/command-center/business/__tests__) with plain `tsc` + `node`, since
 * no test framework is configured in this workspace yet. Cleans up its
 * compiled output afterward regardless of pass/fail.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, ".test-output");

fs.rmSync(outDir, { recursive: true, force: true });

try {
  execSync(
    `npx tsc --module commonjs --target ES2020 --esModuleInterop --outDir "${outDir}" ` +
      `"${path.join(root, "src/command-center/business/__tests__/sessionWorkflow.test.ts")}"`,
    { stdio: "inherit", cwd: root },
  );
  fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }));
  execSync(`node "${path.join(outDir, "business/__tests__/sessionWorkflow.test.js")}"`, { stdio: "inherit", cwd: root });
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
