import { defineConfig } from '@vscode/test-cli';

/**
 * Integration test configuration.
 *
 * These tests run *inside* a real VS Code instance (the Extension Development
 * Host) and therefore have access to the `vscode` API. Pure, VS Code-free logic
 * lives in the unit test suite instead (see `.mocharc.json`).
 */
export default defineConfig({
  label: 'integration',
  files: 'out/test/integration/**/*.test.js',
  version: 'stable',
  // No `workspaceFolder`: none of the integration tests need one open, and the
  // config test writes to the isolated Global target. VS Code launches into an
  // empty window — the realistic "extension activated in a bare window" case.
  mocha: {
    // `@vscode/test-cli` defaults its runner to the **tdd** UI (`suite`/`test`),
    // unlike plain `mocha` which defaults to **bdd**. SkillIssue's tests are
    // written BDD-style (`describe`/`it`) in both tiers, so pin the UI here or
    // every integration test fails with `describe is not defined`.
    ui: 'bdd',
    timeout: 30000,
  },
});
