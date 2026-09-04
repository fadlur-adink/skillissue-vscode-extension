# Changelog

All notable changes to SkillIssue are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **SkillIssue**, a strictly observational extension that reacts to a failing
  development workflow with a laughing-cat meme — an animated GIF plus audio in a
  WebView panel that never steals focus. If a workflow succeeds, it stays silent.
- **Failure detection** through the VS Code Tasks API (`onDidEndTaskProcess`
  exit codes) **and** the integrated terminal (`onDidEndTerminalShellExecution`,
  reached defensively as a progressive enhancement). Only build/test/lint/compile
  commands typed in a terminal are considered — ordinary shell noise is ignored —
  and the whole terminal path is gated by
  `skillissue.workflows.detectTerminalCommands` (default on). Terminal text is
  never parsed, and exit codes, output and command behaviour are never altered.
- **Semantic task classification** derived from VS Code's own metadata
  (definition type, task group, problem matchers, provider source and a bounded
  command-token heuristic), falling back to `unknown` rather than guessing.
- **Terminal command classification** for the integrated-terminal path, reusing
  the same script-name heuristic (`yarn build`, `npm test`) plus a bounded set of
  well-known tools and subcommands (`next build`, `tsc`, `cargo test`, `go vet`),
  so only real build/test/lint/compile runs can trigger a reaction.
- A **configurable reaction policy**: master switch, monitored workflow kinds,
  include/exclude name filters, cancellation/unknown handling, repeated-failure
  behaviour and a reaction cooldown.
- **User settings** under the `skillissue.*` namespace, applied live with no
  reload or rebuild.
- **Meme experience polish**: a single reused panel, `preserveFocus`,
  auto-dismiss, Escape/button/tab dismissal, a `×N` streak badge, configurable
  volume, blocked-audio fallback and `prefers-reduced-motion` support. The whole
  reaction card is now a one-click target that plays the laugh (WebView autoplay
  is gesture-gated), with the explicit "Play sound" button kept for keyboard users.
- A **two-tier test suite** (167 unit + 21 integration tests) covering the domain
  model, task **and** terminal detection, policy, orchestration, reaction markup,
  configuration and the VS Code-facing lifecycle.
