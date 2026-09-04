# Contributing to SkillIssue

Thanks for hacking on SkillIssue — the VS Code extension that laughs at your
failing builds. This guide is for **contributors**: the development setup,
scripts, tests, project layout and packaging. For *using* the extension see
`README.md`; for the design decisions behind it see `docs/ARCHITECTURE.md`.

> `README.md` is what the VS Code Marketplace and the Extensions "Details" tab
> show to end users, so it is kept user-facing. Everything a contributor needs
> lives here and in `docs/` — both are excluded from the packaged VSIX (see
> `.vscodeignore`), so they never ship to users.

---

## Requirements

* [Node.js](https://nodejs.org) **22.x LTS** for development. The integration
  test tooling (`@vscode/test-cli`) requires Node ≥ 22; compiling and running the
  unit tests also work on Node ≥ 20.9.
* [VS Code](https://code.visualstudio.com) **1.90** or newer.

> The extension *runs* on the Node bundled with VS Code (1.90 ships Node 20), so
> its code is type-checked against `@types/node` 20 — guaranteeing it never uses
> an API missing from the oldest supported VS Code. Your development Node version
> only drives the build/test tooling.

---

## Getting started

```bash
npm install        # install dependencies
npm run compile    # compile TypeScript to ./out
```

Open this folder in VS Code and press **F5** ("Run Extension") to launch an
Extension Development Host. There, run **SkillIssue: Preview Reaction** from the
Command Palette to exercise the UI directly, or fail a task/terminal build to see
the whole detection → policy → reaction loop. Logs are written to the **Output**
view under the `SkillIssue` channel.

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

---

## Testing

SkillIssue is tested at two levels so that most behaviour can be verified without
driving a real developer workflow. Both suites are green: **182 unit + 21
integration** tests.

* **Unit tests** (`src/test/unit/**`) — pure logic with **no `vscode` import**.
  They run with plain Mocha on the compiled JavaScript and are fast, offline and
  deterministic.
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
├── assets/                  # Product media (cat GIF, MP3 + WAV audio) + the store icon
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
├── README.md                # User-facing listing (Marketplace / Extensions "Details")
├── CONTRIBUTING.md          # This file — contributor guide (excluded from the VSIX)
├── CHANGELOG.md             # Release notes (Keep a Changelog)
└── LICENSE                  # MIT licence for the source code
```

`core/`, `detection/`, `policy/`, `reaction/`, `audio/`, `orchestration/` and
`config/` are all implemented; the layering rules and rationale live in
`docs/ARCHITECTURE.md`.

---

## Project status

SkillIssue was built phase by phase; `docs/ARCHITECTURE.md` is the source of truth
for the as-built design and the decisions behind it.

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

---

## Packaging & publishing

`npm run package` compiles and bundles SkillIssue into a `.vsix` with
[`@vscode/vsce`](https://www.npmjs.com/package/@vscode/vsce). Install it into any
VS Code with `code --install-extension skillissue-<version>.vsix`.

Before publishing:

* **The `repository` field is declared** in `package.json` (the GitHub URL) — keep
  it in sync if the repo ever moves. Without it `vsce` warns *"A 'repository'
  field is missing from the 'package.json' manifest file."* (a local build can
  bypass that with `vsce package --allow-missing-repository`), and the
  `repository` URL is also what lets the Marketplace resolve the README's
  **relative image and file links** (e.g. the cat GIF).
* **Keep `README.md` user-facing.** It is the Marketplace listing. Development
  detail belongs here in `CONTRIBUTING.md` and in `docs/` — both are excluded from
  the VSIX by `.vscodeignore`, so they never ship to end users.
* **Clear the media rights.** The bundled cat-meme GIF/MP3/WAV/PNG are third-party
  assets of unclear provenance and are **not** MIT-covered. Replace them with
  licensed/original equivalents (or clear the rights) before any public publish.
* Publish with `vsce publish` once a Marketplace publisher is configured.

---

## License

Source code: **MIT** (see `LICENSE`). Bundled meme media: third-party, **not**
MIT-covered — see the publishing note above.
