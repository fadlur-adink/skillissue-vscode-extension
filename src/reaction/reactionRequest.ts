/**
 * The boundary between "a reaction should happen" and "show the reaction".
 *
 * The reaction UI (Phase 4) receives a {@link ReactionRequest}; it never inspects
 * terminal output, never sees an exit code and never decides *whether* to react.
 * That decision belongs to the policy (Phase 3), and translating a policy
 * verdict into a request belongs to the orchestration layer (Phase 5). Keeping
 * this type tiny and VS Code-free is what keeps the UI decoupled from detection.
 */

/**
 * Everything the meme UI is allowed to know about a reaction.
 *
 * The optional `message` is a **pre-computed**, human-readable line (produced by
 * `core/describe.ts`), e.g. "npm: test failed (exit code 1)". The UI displays it
 * verbatim and derives nothing from it.
 */
export interface ReactionRequest {
  readonly message?: string;
  /**
   * Consecutive failures of the same operation this reaction represents (1 for
   * the first). Above 1 the UI may acknowledge the streak ("×N") so repeated
   * failures feel deliberate rather than stuck. Purely presentational — the UI
   * derives no decision from it.
   */
  readonly repeatCount?: number;
}

/** Builds a {@link ReactionRequest}, omitting fields that carry no information. */
export function createReactionRequest(message?: string, repeatCount?: number): ReactionRequest {
  const request: { message?: string; repeatCount?: number } = {};
  if (message !== undefined) {
    request.message = message;
  }
  // A count of 1 (or absent) is the normal case; only a real streak is worth
  // surfacing, so the request stays minimal.
  if (repeatCount !== undefined && repeatCount > 1) {
    request.repeatCount = repeatCount;
  }
  return request;
}

/**
 * Anything able to *present* a reaction.
 *
 * This is the seam that keeps the orchestration loop (Phase 5) independent of the
 * WebView and of `vscode`: `CatReactionController` satisfies it structurally, and
 * tests substitute a fake that records requests. The orchestrator depends on this
 * interface, never on the concrete controller.
 */
export interface ReactionSink {
  react(request: ReactionRequest): void;
}
