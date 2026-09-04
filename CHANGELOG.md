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
  exit codes). Terminal text is never parsed, and exit codes, output and task
  behaviour are never altered.
- **Semantic task classification** derived from VS Code's own metadata
  (definition type, task group, problem matchers, provider source and a bounded
  command-token heuristic), falling back to `unknown` rather than guessing.
- A **configurable reaction policy**: master switch, monitored workflow kinds,
  include/exclude name filters, cancellation/unknown handling, repeated-failure
  behaviour and a reaction cooldown.
- **User settings** under the `skillissue.*` namespace, applied live with no
  reload or rebuild.
- **Meme experience polish**: a single reused panel, `preserveFocus`,
  auto-dismiss, Escape/button/tab dismissal, a `×N` streak badge, configurable
  volume, blocked-audio fallback and `prefers-reduced-motion` support.
- A **two-tier test suite** (143 unit + 15 integration tests) covering the domain
  model, detection, policy, orchestration, reaction markup, configuration and the
  VS Code-facing lifecycle.
