# SkillIssue

> **Your code failed. The cat knows. The cat is laughing at you.**

SkillIssue is a VS Code extension that playfully reacts when a development
workflow fails. Run a test suite, a TypeScript build, a linter or a production
build — as a VS Code **task** or typed straight into the **integrated terminal** —
and if it fails, a laughing cat appears and the laugh plays (2×). By default the
sound plays in the **background** through your OS's own audio player, so it needs
no click and works even when VS Code isn't focused. (An optional `webview` backend
plays inside the panel instead; because browsers gate autoplay, that mode asks for
one click the first time, then keeps the panel alive so later failures play on
their own.) If a workflow succeeds, SkillIssue stays completely out of your way.

SkillIssue is strictly **observational**. It never changes exit codes, output or
the behaviour of the command you ran. A failing command fails exactly the same
way it would without SkillIssue installed.

---

## Current status

This project is being built phase by phase from the plan in
`assets/Prompt.md`.

| Phase | Description | Status |
| ----- | ----------- | ------ |
| 0 | Project foundation & architecture | ✅ Complete |
| 1 | Core domain model (operations & outcomes) | ✅ Complete |
| 2 | Failure detection from VS Code workflow events | ✅ Complete |
| 3 | Configurable reaction policy | ✅ Complete |
| 4 | Reaction UI (WebView) with cat assets | ✅ Complete |
| 5 | Connect detection → policy → reaction | ✅ Complete |
| 6 | User configuration via VS Code settings | ✅ Complete |
| 7 | Robust failure detection across workflows | ✅ Complete |
| 8 | Polish the meme experience | ✅ Complete |
| 9 | Testing & reliability | ✅ Complete |
| 10 | Production readiness & packaging | ✅ Complete |
| 11 | Final product review | ✅ Complete |
| Post-review | Integrated-terminal detection & unlock-once sound | ✅ Complete |
| Post-review | Background (native OS) sound — plays with no click | ✅ Complete |

See `docs/ARCHITECTURE.md` for the architectural
decisions that guide the implementation.

---

## Requirements

* [Node.js](https://nodejs.org) **22.x LTS** for development. The integration
  test tooling (`@vscode/test-cli`) requires Node ≥ 22; compiling and running the
  unit tests also work on Node ≥ 20.9.
* [VS Code](https://code.visualstudio.com) **1.90** or newer.

> The extension *runs* on the Node bundled with VS Code (1.90 ships Node 20), so
> its code is type-checked against `@types/node` 20 — guaranteeing it never uses
> an API missing from the oldest supported VS Code. Your development Node
> version only drives the build/test tooling.

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Compile TypeScript to ./out
npm run compile

# 3. Launch the Extension Development Host
#    Open this folder in VS Code and press F5 ("Run Extension").
```

In the Extension Development Host, open the Command Palette
(`Ctrl/Cmd+Shift+P`) and run **`SkillIssue: About`** to confirm the extension is
loaded. Run **`SkillIssue: Preview Reaction`** to see the laughing-cat WebView
directly — it works independently of any failure. Logs are written to the
**Output** view under the `SkillIssue` channel.

---

## Configuration

Every setting lives under the `skillissue` namespace (open Settings and search
"SkillIssue"). Changes apply immediately — no reload or rebuild needed.

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `skillissue.enabled` | `true` | Master switch. When off, SkillIssue never reacts. |
| `skillissue.sound.enabled` | `true` | Play the laughing-cat audio with the reaction (the laugh plays 2×). |
| `skillissue.sound.volume` | `1` | Audio volume, from `0` (muted) to `1` (full). |
| `skillissue.sound.backend` | `system` | How the laugh plays: `system` uses a native OS audio player in the **background** (no click, works unfocused); `webview` plays inside the panel (may need one click to unlock browser audio). |
| `skillissue.reaction.durationSeconds` | `5` | How long the cat is shown before it dismisses (or, with the `webview` backend, quiets to a subtle "listening" idle that keeps audio unlocked); `0` keeps the cat showing. |
| `skillissue.reaction.cooldownSeconds` | `0` | Minimum spacing between reactions; `0` disables the cooldown. |
| `skillissue.workflows.monitoredKinds` | `[]` | Workflow kinds to watch (`test`, `build`, `compile`, `lint`, `script`, `unknown`); empty watches all. |
| `skillissue.workflows.include` | `[]` | Only react when the operation name contains one of these substrings; empty includes all. |
| `skillissue.workflows.exclude` | `[]` | Never react when the name contains one of these substrings (wins over `include`). |
| `skillissue.workflows.treatCancellationAsFailure` | `false` | React when a monitored workflow is cancelled. |
| `skillissue.workflows.treatUnknownAsFailure` | `false` | React when a workflow ends with an unknown result. |
| `skillissue.workflows.detectTerminalCommands` | `true` | Also react to build/test/lint commands typed in the integrated terminal (needs shell integration); ordinary commands like `git`/`ls` are ignored. |
| `skillissue.repeatedFailures` | `always` | `always` reacts to every failure; `first-only` reacts once per streak. |

---

## Scripts

| Script | Description |
| ------ | ----------- |
| `npm run compile` | Compile TypeScript once to `./out`. |
| `npm run watch` | Recompile on change. |
| `npm run clean` | Delete the `./out` build output. |
| `npm run lint` | Run ESLint over the TypeScript sources. |
| `npm run lint:fix` | Run ESLint and apply safe fixes. |
| `npm run test:unit` | Run the fast, VS Code-free unit test suite (Mocha). |
| `npm run test:integration` | Run integration tests inside a real VS Code instance. |
| `npm test` | Compile + lint, then run unit and integration suites. |
| `npm run package` | Compile and bundle the extension into a `.vsix` (`@vscode/vsce`). |

> `npm test` runs `pretest` (compile + lint) first. If you run `test:unit` or
> `test:integration` directly, make sure the project is compiled (or keep
> `npm run watch` running in the background).

### Packaging

`npm run package` compiles and bundles SkillIssue into a `.vsix` with
[`@vscode/vsce`](https://www.npmjs.com/package/@vscode/vsce). Install it into any
VS Code with `code --install-extension skillissue-<version>.vsix`; publish with
`vsce publish` once a `repository` URL and a Marketplace publisher are configured.

---

## Testing

SkillIssue is tested at two levels so that most behaviour can be verified
without driving a real developer workflow. Both suites are green: **182 unit +
21 integration** tests.

* **Unit tests** (`src/test/unit/**`) — pure logic with **no `vscode` import**.
  They run with plain Mocha on the compiled JavaScript and are fast and offline.
* **Integration tests** (`src/test/integration/**`) — run **inside a real VS Code
  instance** via
  [`@vscode/test-cli`](https://www.npmjs.com/package/@vscode/test-cli) (+
  `@vscode/test-electron`). They verify activation and contributed commands, the
  WebView panel lifecycle, detector disposal (task **and** terminal) and live
  settings reload against the actual API — and, in `endToEnd.test.ts`, drive a
  real failing task through the entire detection → policy → reaction loop.

Integration tests download a VS Code build on first run and require a desktop
environment (a display); on headless CI use a virtual framebuffer, e.g.
`xvfb-run npm run test:integration`. They only ever write to the isolated
user-data directory `@vscode/test-cli` provisions, never your real settings.

---

## Project structure

```text
.
├── assets/                  # Product media (cat GIF, MP3 + WAV audio), the store icon + the plan
├── docs/
│   └── ARCHITECTURE.md      # Architectural decisions & discovered constraints
├── src/
│   ├── extension.ts         # VS Code activation entry point (kept thin)
│   ├── constants.ts         # Command IDs / channel names shared with the manifest
│   ├── logging/             # Logger contract (pure) + OutputChannel implementation
│   ├── core/                # Domain model: operations, outcomes, events, tracker (pure)
│   ├── detection/           # VS Code Tasks API + Terminal Shell Execution API → domain events (pure mapping + adapters)
│   ├── policy/              # Reaction policy: does an outcome deserve a cat? (pure)
│   ├── reaction/            # Cat meme WebView (pure markup + VS Code panel controller)
│   ├── audio/               # Native OS sound player (background audio; pure command selection)
│   ├── orchestration/       # The loop: detection → policy → reaction (pure)
│   ├── config/              # Typed user settings: pure mapping + VS Code reader
│   └── test/
│       ├── unit/            # Pure logic tests (Mocha, no VS Code)
│       └── integration/     # In-VS Code tests (@vscode/test-cli)
├── package.json             # Extension manifest + npm scripts
├── tsconfig.json            # TypeScript build configuration
├── eslint.config.mjs        # ESLint flat config
├── .mocharc.json            # Unit test runner config
├── .vscode-test.mjs         # Integration test runner config
├── .vscodeignore            # Files excluded from the packaged VSIX
├── CHANGELOG.md             # Release notes (Keep a Changelog)
└── LICENSE                  # MIT licence for the source code
```

`core/`, `detection/`, `policy/`, `reaction/`, `orchestration/` and `config/` are
implemented; later phases refine detection breadth, polish the meme and harden
the test suite as described in the architecture document.

---

## License

The **source code** is released under the MIT License — see the `LICENSE` file.

The **bundled meme media** — `assets/orange-cat-laughing.gif`,
`assets/cat-laughing-at-you.mp3`, `assets/cat-laughing-at-you.wav` (a WAV render of
the same clip for the native background player) and
`assets/cat-laughing-cat-laughing-meme.png` — are third-party “cat laughing” meme
assets of unclear provenance, included
solely for novelty. They are **not** covered by the MIT licence, and their rights
must be cleared (or the media replaced with licensed/original equivalents) before
SkillIssue is published publicly.

The extension **icon** (`assets/icon.png`) is original artwork created for this
project.
