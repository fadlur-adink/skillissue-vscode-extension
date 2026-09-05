# Reaction — WebView meme presentation

## OVERVIEW
Renders a pre-computed `ReactionRequest` as a laughing-cat WebView. The UI never decides *whether* to react and never inspects output; it only presents what policy/orchestration handed it.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| The decoupling boundary (what UI may know) | `reactionRequest.ts` | `ReactionRequest {message?, repeatCount?}` + `ReactionSink` seam; orchestrator depends on the interface, never the controller |
| Asset filenames | `reactionAssets.ts` | `REACTION_ASSETS` {gif, audio, audioWav, poster} + `REACTION_ASSET_DIR`; one source of truth for packaging AND tests |
| Markup | `reactionView.ts` | pure `buildReactionHtml(model)` + `escapeHtml` + `clampVolume`; no `vscode` import |
| Panel lifecycle | `catReactionController.ts` | owns the single `WebviewPanel`; resolves URIs + manages create/reuse/dispose |
| Unit tests | `src/test/unit/reaction/*.test.ts` | markup (CSP/escaping/theming/choreography) + asset-name↔file parity |
| Integration test | `src/test/integration/reaction.test.ts` | open/reuse/dispose never throws |

## CONVENTIONS
- **Markup pure / controller adapter split.** `reactionView.ts` is a pure function; the controller resolves `asWebviewUri` values and injects `cspSource` + a nonce. Markup is fully unit-testable offline.
- **UI renders, never decides.** `buildReactionHtml` renders the `ReactionViewModel` (derived from a `ReactionRequest`) verbatim. `detail` is displayed, never parsed; `repeatCount` only toggles the ×N badge.
- **One panel, reused.** A new reaction while the panel is open reveals + replays in the existing panel; it never stacks a second tab.
- **Assets only via `REACTION_ASSETS`.** Resolve filenames through that map; a rename fails the parity unit test instead of 404-ing at runtime.
- **Sound stays out of the controller.** `playSystemSound` is constructor-injected; the controller never imports `child_process`.

## ANTI-PATTERNS
- Don't bypass `escapeHtml` — every dynamic value in the document passes through it.
- Don't add a new dynamic string without escaping it in `buildReactionHtml`.
- Don't open a second panel — always `ensurePanel()`/reuse.
- Don't import `child_process` (or the audio player) into the controller — inject it.
- Don't decide whether to react here — that's policy/orchestration; the view just renders the request it's given.
- Don't hard-code asset filenames in the view/controller — go through `REACTION_ASSETS`.

## NOTES
- **CSP:** `default-src 'none'`; img/media/font from `webview.cspSource`; style/script gated by a fresh `crypto.randomBytes` nonce per render.
- **Audio unlock choreography:** `webview` backend keeps the panel alive (`retainContextWhenHidden`) and settles into `idle` so the one-time click unlock persists; `system` backend plays natively and disposes the panel on the dismiss timer.
- **Handshake:** the view posts `ready` on load; the controller re-sends the pending `react` (or restores `idle`) so `postMessage` never races (re)load.
- **Accessibility:** `role="status" aria-live="polite"`; `prefers-reduced-motion` swaps the GIF for the static poster; Escape/Dismiss/× close the panel.
- **`localResourceRoots` = `assets/` only**, resolved via `asWebviewUri` — nothing else is exposed to the WebView.
