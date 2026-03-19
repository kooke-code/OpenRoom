# VibeApp Development Guide

An iframe-based micro-frontend VibeApp system (React + Cloud NAS).

## Quick Start

Create a new app: `/vibe {AppName} {Description}`
Modify an existing app: `/vibe {AppName} {ChangeDescription}`
Resume an existing workflow: `/vibe {AppName}`
Re-run from a specific stage: `/vibe {AppName} --from=04-codegen`

Creation mode runs 6 stages: Requirement Analysis -> Architecture Design -> Task Planning -> Code Generation -> Asset Generation -> Project Integration.
Change mode runs 4 stages: Change Impact Analysis -> Change Task Planning -> Change Code Implementation -> Change Verification.
You can also enter a requirement description directly, and the system will automatically detect and trigger the corresponding mode.

## Tech Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS (H5 Pages), CSS Modules (Components)
- **Icons**: Lucide React (No Emoji)
- **Storage**: Cloud NAS via `@/lib` (Repository Pattern)
- **Communication**: `postMessage` via `@/lib`

## File Structure

```text
src/pages/{AppName}/
├── components/    # UI Components
├── pages/         # Sub-pages (H5 Templates)
├── data/          # Seed Data (JSON only)
├── assets/        # Generated Image Assets
├── mock/          # Dev Mock Data (TypeScript)
├── store/         # Context/Reducer
├── actions/       # Action Definitions
├── styles/        # CSS Variables
├── i18n/          # en.ts + zh.ts
├── meta/
│   ├── meta_cn/   # Chinese: guide.md + meta.yaml
│   └── meta_en/   # English: guide.md + meta.yaml
├── index.tsx      # Entry (lifecycle reports here only)
├── index.module.scss
└── types.ts
```

## Workflow Structure

```text
.claude/
├── commands/vibe.md           # Single entry orchestrator
├── workflow/
│   ├── stages/                # Stage definitions (loaded on-demand)
│   │   ├── 01-analysis.md          # Create: Requirement Analysis
│   │   ├── 02-architecture.md      # Create: Architecture Design
│   │   ├── 03-planning.md          # Create: Task Planning
│   │   ├── 04-codegen.md           # Create: Code Generation
│   │   ├── 05-assets.md            # Create: Asset Generation
│   │   ├── 06-integration.md       # Create: Project Integration
│   │   ├── 01-change-analysis.md       # Change: Impact Analysis
│   │   ├── 02-change-planning.md       # Change: Task Planning
│   │   ├── 03-change-codegen.md        # Change: Code Implementation
│   │   └── 04-change-verification.md   # Change: Verification
│   └── rules/                 # Stage-specific rules (loaded on-demand)
│       ├── app-definition.md
│       ├── responsive-layout.md
│       ├── guide-md.md
│       └── meta-yaml.md
├── rules/                     # Global rules (always loaded)
│   ├── data-interaction.md
│   ├── design-tokens.md
│   ├── concurrent-execution.md
│   └── post-task-check.md
└── thinking/{AppName}/        # Per-app workflow state & artifacts
    ├── workflow.json
    ├── 01-requirement-analysis.md
    ├── 02-architecture-design.md
    ├── 03-task-planning.md
    ├── 04-code-generation.md
    └── outputs/
        ├── requirement-breakdown.json
        ├── solution-design.json
        └── workflow-todolist.json
```

## Rules

The following global rules in `.claude/rules/` are mandatory constraints across all stages:

| Rule File | Description |
|---|---|
| `data-interaction.md` | Data interaction & NAS storage specification |
| `design-tokens.md` | Design token system & usage guidelines |
| `concurrent-execution.md` | Concurrent execution & task scheduling rules |
| `post-task-check.md` | Post-task completion checklist |

Stage-specific rules are in `.claude/workflow/rules/`, loaded on-demand by `/vibe`.

## Auto Workflow Trigger

When the user enters a requirement description directly (instead of using the `/vibe` command), automatically execute the workflow defined in `.claude/commands/vibe.md`.

### Creating a New App

Detection rules:

- The user's message contains an explicit new app requirement (e.g., "build a XX app", "I need a XX", "help me develop XX")
- Automatically extract AppName (PascalCase format) from the requirement; Description is the user's full requirement text
- Equivalent to executing `/vibe {AppName} {Description}`

### Modifying an Existing App

Detection rules:

- The user's message explicitly targets an existing App with a change request (e.g., "add lyrics feature to MusicApp", "MusicApp needs to support XX")
- Also includes cases where the App name is not specified but can be inferred from context (e.g., there is only one App, and the user says "add a lyrics display feature")
- Automatically identify AppName; Description is the change requirement text
- Equivalent to executing `/vibe {AppName} {ChangeDescription}` (vibe.md's mode detection logic automatically enters change mode)

### Cases That Do NOT Trigger

- The user is clearly asking questions, chatting, or making fine-grained code modifications (e.g., "change this button color to red")
- The user used the `/vibe` command (already handled by the command mechanism)
- The user requests resuming or re-running from a specific stage (must explicitly use `/vibe {AppName}` or `/vibe {AppName} --from=XX`)

## Testing

### Unit Tests (Vitest)

Run from the webuiapps package:

```bash
cd apps/webuiapps && pnpm test        # single run
cd apps/webuiapps && pnpm test:watch  # watch mode
```

### E2E Tests (Playwright)

Run from the repo root. The dev server starts automatically.

```bash
pnpm test:e2e          # headless, Chromium only
pnpm test:e2e:ui       # interactive UI mode
```

- Config: `playwright.config.ts` (root)
- Tests: `e2e/` directory
- The web server (`pnpm dev`) is auto-launched on port 3000 and reused if already running.
- Only Chromium is configured by default; add projects in `playwright.config.ts` for Firefox/WebKit.
- After completing code changes that affect UI or routing, run `pnpm test:e2e` and report pass/fail.

## Task completion quality bar (mandatory)

Before declaring a task complete, agents must satisfy all of the following:

1. **Unit tests must pass** for the affected package(s).
   - For `apps/webuiapps`, run the relevant Vitest command(s), for example:
     ```bash
     cd apps/webuiapps && pnpm test
     cd apps/webuiapps && pnpm test:coverage
     ```
2. **Code coverage must be > 90%** for the code touched by the task.
   - If current config thresholds are lower, do not treat that as sufficient.
   - Add or improve tests until the changed area exceeds 90% coverage, or explicitly report why that is not yet achievable.
3. **E2E coverage must be complete for impacted user flows.**
   - Do not stop at smoke tests if the change affects real behavior.
   - Cover the primary user path, key state transitions, and at least one meaningful assertion of successful behavior.
   - If UI behavior changes, prefer stable selectors (`data-testid`) over fragile class-name/text-only selectors.
4. **Report exact validation commands and results** in the final handoff.
   - Include what passed, what failed, and any known gaps.

Minimum expectation: no task is "done" if unit tests are red, coverage on changed code is below 90%, or impacted E2E coverage is missing/incomplete.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **OpenRoom** (1057 symbols, 2459 relationships, 79 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/OpenRoom/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/OpenRoom/context` | Codebase overview, check index freshness |
| `gitnexus://repo/OpenRoom/clusters` | All functional areas |
| `gitnexus://repo/OpenRoom/processes` | All execution flows |
| `gitnexus://repo/OpenRoom/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->
