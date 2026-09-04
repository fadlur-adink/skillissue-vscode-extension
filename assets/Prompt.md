# SkillIssue — AI Development Prompt

## How to use this prompt

This project is intentionally divided into phases.

**Do not execute all phases in a single pass.**

At the beginning of each phase:

1. Inspect the current repository and understand what already exists.
2. Read the project documentation and previous implementation before making changes.
3. Infer the appropriate implementation from the phase's intent and goals.
4. Implement the phase completely.
5. Validate the implementation.
6. Fix problems discovered during validation.
7. Update documentation where the implementation or architectural decisions have changed.
8. Do not prematurely implement functionality belonging primarily to later phases.

A phase is considered complete only when the resulting project is in a **working, coherent state**, not merely when the listed concepts have been touched.

The requirements below describe **product behavior and engineering intent**, not a literal implementation checklist. You are expected to determine the necessary files, modules, APIs, abstractions, tests, configuration, and supporting code required to achieve the goals.

---

# Project: SkillIssue

## Product Vision

**SkillIssue** is a VS Code extension that playfully reacts when a developer's development workflow fails.

When a developer runs something such as a test suite, TypeScript compilation, linting, or a production build and the operation fails, SkillIssue should recognize the failure and respond with a laughing cat meme accompanied by the appropriate sound.

The humor is intentionally simple:

> **Your code failed. The cat knows. The cat is laughing at you.**

The extension should eventually feel like a polished VS Code product rather than a proof-of-concept script.

It should be:

* unobtrusive when nothing goes wrong
* immediate when something fails
* configurable
* reliable across common development workflows
* safe with respect to the developer's workspace
* lightweight
* maintainable
* testable
* extensible enough to support additional reactions in the future

The extension must not interfere with the actual command being executed. A failed command must still return its original exit status and behave exactly as it would without SkillIssue.

---

# Engineering Philosophy

Treat this as a real VS Code extension that happens to be ridiculous.

Prefer:

* clear boundaries between VS Code integration and application logic
* small cohesive modules
* explicit state management
* testable logic
* defensive handling of VS Code API behavior
* graceful degradation
* minimal global state
* predictable lifecycle management
* configuration-driven behavior
* asynchronous code that respects cancellation/disposal
* maintainable TypeScript

Avoid:

* putting everything inside `extension.ts`
* hardcoding behavior that should be configurable
* coupling business logic directly to the VS Code UI
* unnecessary dependencies
* global mutable state
* fragile parsing based on a single terminal/shell assumption
* blocking the developer's workflow
* implementing functionality merely because it is easy
* fake abstractions that exist only to satisfy architectural patterns

The extension should remain understandable to another developer who has never seen this project before.

---

# Phase 0 — Understand the Product

## Purpose

Before writing implementation code, establish a clear understanding of what SkillIssue actually is.

The purpose of this phase is to prevent the implementation from becoming a collection of unrelated VS Code APIs.

## Goal

Create the initial project foundation and establish the project's technical direction.

The repository should become a legitimate VS Code extension project with a development environment that another developer can clone and work on immediately.

Think through:

* what the extension's runtime environment is
* how VS Code loads the extension
* what code belongs to the extension host
* what code belongs to a UI/WebView context
* how static media should be packaged
* how configuration will eventually be represented
* how the project can be tested without requiring a real developer workflow for every test

Do not attempt to solve failure detection yet.

The important outcome is that the project has a **sound foundation and clear architectural boundaries**.

### Completion criteria

A developer should be able to:

* install dependencies
* compile the extension
* run it inside VS Code's Extension Development Host
* execute the automated test suite
* understand the basic project structure

Document important architectural decisions so later phases do not need to rediscover them.

---

# Phase 1 — Establish the SkillIssue Core

## Purpose

The extension eventually needs to distinguish between:

> something happened

and:

> something failed and deserves a SkillIssue reaction.

That distinction should not be buried inside VS Code event handlers.

This phase establishes the extension's internal domain model.

## Goal

Build the conceptual core responsible for representing development operations and their outcomes.

The implementation should make it possible for the rest of the application to reason about things such as:

* an operation starting
* an operation completing
* success
* failure
* cancellation
* unknown/unavailable results
* potentially repeated failures

The core should not depend unnecessarily on VS Code UI APIs.

Think about the information the rest of the application will need later without coupling the model to a particular detection mechanism.

For example, the UI should eventually be able to receive a meaningful event like:

> "The user's TypeScript task failed."

rather than needing to understand terminal output itself.

### Completion criteria

The core behavior is independently testable.

The extension can represent and reason about command outcomes without requiring the meme UI or a specific terminal implementation.

---

# Phase 2 — Understand the Developer's Workflow

## Purpose

This is the first phase where SkillIssue interacts with the actual VS Code environment.

The difficult part of this project is not showing a cat.

The difficult part is reliably determining:

> **"Did the developer's operation actually fail?"**

VS Code provides multiple ways developers execute commands, and they do not all expose the same information.

The extension should therefore be designed around **observable developer workflow events**, rather than assuming that every terminal behaves identically.

## Goal

Implement the first reliable failure-detection mechanism using the VS Code facilities that provide the strongest signal.

Explore the available VS Code APIs and determine which execution paths can provide trustworthy completion status.

The detection layer should translate those external events into the internal domain model created earlier.

The detector should not know anything about:

* cats
* GIFs
* audio
* WebViews
* meme selection

It should only answer questions about workflow execution.

Consider carefully:

* task completion
* exit codes
* cancellation
* multiple terminals
* concurrent operations
* commands that succeed
* commands that fail
* commands that are interrupted
* extension activation timing
* disposal of event listeners

Do not assume that terminal text alone is a reliable representation of command success.

If there are limitations in what VS Code exposes, document them rather than hiding them.

### Completion criteria

A real VS Code task or supported execution path can produce a meaningful success/failure event inside the extension.

The detector is independently testable.

The existing project still behaves correctly when SkillIssue is not reacting to anything.

---

# Phase 3 — Define What Deserves a SkillIssue

## Purpose

Not every failed process should necessarily make a cat laugh.

The extension needs a deliberate policy for deciding which failures should produce a reaction.

This is where the product becomes more than:

> `exitCode !== 0 → play cat`

## Goal

Create a configurable reaction policy.

The policy should eventually allow SkillIssue to reason about:

* which kinds of operations are monitored
* whether failures are enabled
* whether particular commands/tasks are included or excluded
* how repeated failures are treated
* whether cancellation counts as failure
* whether the developer wants reactions for every failure or only selected workflows

Keep the policy independent from the actual detection mechanism.

The detector should report what happened.

The policy should determine whether it matters.

The reaction system should determine what to do about it.

This separation will become important as the extension grows.

### Completion criteria

Given a workflow result and configuration, the system can deterministically answer:

> Should SkillIssue react?

This behavior should be thoroughly unit tested.

---

# Phase 4 — Give SkillIssue a Face

## Purpose

Now that the extension understands failure, it needs a visual identity.

This phase introduces the actual meme experience.

The provided project assets should be treated as the initial product assets:

* laughing-cat GIF
* laughing-cat audio

The UI should not become tightly coupled to the failure detector.

## Goal

Create a small, isolated reaction experience capable of appearing when SkillIssue receives a reaction request.

The visual experience should feel intentional rather than like a random HTML page opened inside VS Code.

Think about:

* how much of the screen the reaction should occupy
* whether it should feel like an overlay or a panel
* how long it remains visible
* what happens when another failure occurs while it is already visible
* how the GIF and audio are synchronized
* how the UI behaves if audio cannot be played
* how the WebView lifecycle is managed
* how local extension assets are safely exposed
* how the experience behaves with VS Code themes
* accessibility and reduced-distraction considerations

The UI should have a clear boundary between:

> receiving a reaction

and:

> deciding whether a reaction should happen.

The UI should not inspect terminal output or determine whether a build failed.

### Completion criteria

The reaction experience can be triggered independently from the rest of the system.

The provided cat assets are packaged correctly.

The GIF and sound can be presented together.

The UI can be opened, reused, and disposed safely.

---

# Phase 5 — Connect Failure to Cat

## Purpose

This is the first point where the entire product loop becomes real.

The system should now flow from:

```text
developer workflow
        ↓
execution result
        ↓
failure interpretation
        ↓
reaction decision
        ↓
laughing cat
```

## Goal

Connect the workflow detection, reaction policy, and reaction UI into one coherent experience.

A developer should be able to perform a supported failing workflow inside VS Code and naturally encounter the SkillIssue reaction.

A successful workflow should remain completely silent.

The implementation should carefully handle:

* multiple failures
* rapid consecutive failures
* concurrent tasks
* task cancellation
* extension reload
* WebView disposal
* audio failures
* UI failures
* extension shutdown

Do not allow a meme failure to become a developer-workflow failure.

If SkillIssue itself encounters a problem, the original development command must remain unaffected.

### Completion criteria

The complete failure → cat experience works in the Extension Development Host.

Successful commands do not trigger the reaction.

Failed commands trigger it according to policy.

The extension remains stable after repeated failures.

---

# Phase 6 — Make It Actually Useful

## Purpose

A joke extension is fun for five minutes.

A good joke extension is something developers voluntarily leave installed.

This phase turns the prototype into a configurable developer tool.

## Goal

Expose meaningful user configuration through VS Code settings.

Configuration should be designed around user intent rather than internal implementation details.

Potential areas include:

* whether SkillIssue is enabled
* whether sound is enabled
* volume
* reaction duration
* monitored workflow types
* ignored commands/tasks
* reaction frequency/cooldown
* behavior for repeated failures

Do not expose every internal variable as a setting.

Every setting should answer a real user need.

Settings should have:

* sensible defaults
* clear descriptions
* appropriate validation
* predictable behavior
* documentation

Configuration should be consumed through a centralized mechanism rather than scattered throughout the codebase.

### Completion criteria

A user can customize SkillIssue through normal VS Code settings.

Changing configuration does not require rebuilding the extension.

Defaults provide a good experience without configuration.

---

# Phase 7 — Make Failure Detection Robust

## Purpose

The prototype may work perfectly in the controlled development environment while failing to behave correctly in real projects.

This phase is about discovering those weaknesses.

## Goal

Test SkillIssue against realistic JavaScript/TypeScript workflows.

The extension should be designed to work naturally with workflows such as:

* Jest
* TypeScript
* Next.js
* ESLint
* npm scripts
* pnpm scripts
* yarn scripts
* VS Code tasks

Do not solve this by simply adding a giant list of hardcoded command names.

Instead, determine what information VS Code already exposes and use that information wherever possible.

The extension should care primarily about **execution outcome**, while command identity is used only when the product genuinely needs it.

Investigate edge cases such as:

* commands that return non-zero intentionally
* cancelled tasks
* background tasks
* compound tasks
* multiple simultaneous tasks
* long-running development servers
* task reruns
* task dependencies
* shell differences
* Windows environments
* macOS/Linux environments

Where behavior cannot be reliably supported, fail gracefully and document the limitation.

### Completion criteria

The extension behaves predictably across realistic JavaScript/TypeScript workflows.

The implementation does not rely on fragile assumptions about a single shell or project structure.

---

# Phase 8 — Polish the Meme Experience

## Purpose

At this point the engineering should work.

Now make the joke land.

## Goal

Make SkillIssue feel like a deliberately designed product.

Evaluate the entire experience from the developer's perspective.

Consider:

* reaction timing
* animation
* sound timing
* visual hierarchy
* size
* positioning
* dismissal
* repeated failures
* whether the reaction becomes annoying
* whether the developer can continue working immediately afterward

The reaction should be funny without becoming genuinely disruptive.

Think about the difference between:

> "LOL, my build failed and the cat laughed."

and:

> "WHY IS THIS THING TAKING OVER MY SCREEN?"

The first is the product.

The second is a bug.

Use the existing assets appropriately and avoid adding unnecessary visual complexity.

---

# Phase 9 — Testing and Reliability

## Purpose

A VS Code extension interacts with several environments simultaneously:

* extension host
* VS Code APIs
* WebView
* filesystem/package assets
* asynchronous events
* user configuration

Testing therefore needs to exist at multiple levels.

## Goal

Build confidence that SkillIssue behaves correctly without requiring manual testing for every change.

Cover the important behavior of:

* workflow result handling
* failure classification
* reaction policy
* configuration
* repeated events
* lifecycle management
* reaction triggering
* disposal
* error handling

Tests should focus on behavior rather than implementation details.

Avoid tests that merely prove that a particular private method was called.

The important question is:

> Given this developer workflow, what should SkillIssue do?

Add integration-level coverage where practical for the VS Code-specific behavior.

### Completion criteria

The project has a meaningful automated test suite.

Tests can catch regressions in the core product behavior.

A developer can confidently modify the extension without manually clicking through every scenario after every change.

---

# Phase 10 — Production Readiness

## Purpose

The project should now stop feeling like a personal prototype and become something that could realistically be published.

## Goal

Prepare SkillIssue for distribution.

Review the complete project for:

* extension manifest correctness
* activation behavior
* contribution points
* configuration schema
* packaged assets
* build output
* ignored development files
* dependency footprint
* extension size
* security considerations
* WebView resource handling
* error handling
* logging
* user-facing messages
* documentation
* licensing of included assets
* versioning
* publishing configuration

The extension should not request unnecessary permissions or activate unnecessarily early.

Review whether anything exists solely because it was convenient during development.

Remove dead code and unnecessary dependencies.

### Completion criteria

The project can be packaged as a VS Code extension and installed into a clean VS Code environment.

A fresh user should be able to understand what SkillIssue does without reading the source code.

---

# Phase 11 — Final Product Review

## Purpose

The final phase is not another implementation phase.

It is a product review.

## Goal

Pretend you are reviewing a public VS Code extension before publishing it.

Start from a clean environment and evaluate the entire experience.

Verify the complete lifecycle:

```text
Install
  ↓
Open project
  ↓
Run successful workflow
  ↓
Nothing happens
  ↓
Run failing workflow
  ↓
Cat appears
  ↓
Audio plays
  ↓
Reaction ends
  ↓
Developer continues working
```

Then test:

```text
Repeated failures
Concurrent workflows
Cancellation
Reloading VS Code
Disabling SkillIssue
Disabling audio
Changing configuration
Different project types
Different package managers
Different operating systems where practical
```

Look for anything that would make the extension feel unreliable, annoying, fragile, or unfinished.

Fix genuine problems discovered during the review.

Do not introduce unrelated features simply because there is time to do so.

The final product should have a strong, simple identity:

> **Your code failed. SkillIssue noticed. The cat is laughing.**

---

# Agent Rules

Throughout the project, follow these rules.

### 1. Understand before implementing

Do not immediately start creating files.

First inspect the existing project and determine how the current implementation relates to the phase.

### 2. Infer the implementation

The phase descriptions intentionally describe **intent and behavior**, not an exhaustive list of files or functions.

You are responsible for determining what implementation is necessary.

Do not interpret the absence of a filename or function name as permission to omit required functionality.

### 3. Do not overbuild

Do not introduce:

* unnecessary frameworks
* unnecessary dependencies
* speculative abstractions
* premature plugin systems
* databases
* remote services
* telemetry
* authentication
* network calls

unless a later requirement genuinely requires them.

SkillIssue should remain a local VS Code extension.

### 4. Preserve existing behavior

Every phase must leave the project in a usable state.

Do not break working functionality simply to make future implementation easier.

### 5. Treat failures as first-class scenarios

This project exists around failure events.

Test failure paths at least as carefully as success paths.

### 6. Never interfere with developer commands

SkillIssue must be observational/reactive.

It must never modify:

* exit codes
* stdout
* stderr
* command arguments
* task execution behavior

unless explicitly required by the architecture.

### 7. Handle lifecycle correctly

VS Code extensions are long-running processes.

Every event listener, timer, WebView, disposable resource, and asynchronous operation should have an appropriate lifecycle.

### 8. Keep the architecture honest

Do not create an abstraction merely because a diagram suggests one.

Likewise, do not put unrelated responsibilities together merely because doing so is shorter.

### 9. Validate continuously

After meaningful changes:

* compile
* run tests
* inspect errors
* fix failures
* verify the actual runtime behavior when appropriate

Never assume that code is correct simply because it compiles.

### 10. Document discoveries

If implementation reveals an important VS Code limitation, platform difference, or architectural decision, record it in the appropriate project documentation.

Future phases should be able to build upon discovered knowledge.

### 11. Don't stop at the first working implementation

A phase is not complete merely because the happy path works.

Consider:

> What happens when this fails?

Then:

> What happens when this happens twice?

Then:

> What happens when the user closes/reloads/disposes the thing while this is happening?

### 12. Keep the product simple

The core experience should remain understandable:

**Failure → SkillIssue → laughing cat.**

Everything else exists to make that experience reliable and enjoyable.

---

# Definition of Done

SkillIssue is complete when a fresh developer can install the extension and experience the following without additional setup:

```text
                    ┌─────────────────┐
                    │ Developer works │
                    └────────┬────────┘
                             │
                       runs workflow
                             │
                  ┌──────────┴──────────┐
                  │                     │
                success               failure
                  │                     │
                  ▼                     ▼
              do nothing          SkillIssue reacts
                                        │
                              ┌─────────┴─────────┐
                              │                   │
                           laughing              sound
                              │                   │
                              └─────────┬─────────┘
                                        │
                                   reaction ends
                                        │
                                        ▼
                              developer continues
```

The extension should feel:

**small, fast, reliable, funny, configurable, and intentionally designed.**

Not:

**a script that happens to run inside VS Code.**

---