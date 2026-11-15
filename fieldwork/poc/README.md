# Fieldwork plugin POC

English | [中文](README.zh.md)

This opt-in source plugin adds a farmer-owned workspace at `/fieldwork` to the DeepSeek Harness web profile. It includes My farm, a local Community feed, crop-area planning, seed-cost comparisons, sample weather, and private experiments. It requires no model key for these workflows.

## Run

Install and build the repository using the [team setup](../SETUP.md), then run from the repository root:

```sh
DSH_HOME="$PWD/.fieldwork/poc" DSH_TELEMETRY_DISABLED=1 pnpm dsh --profile web --patch fieldwork/poc/cordis.source.patch.yml --no-open
```

Open the authenticated launch URL printed by the server first, then visit `/fieldwork` on that same origin. Keep the launch credential private. The new Fieldwork agent preset is available in the agent workspace; choose it explicitly to enable the read-only `read_farm_context` tool with your configured model. No live-model round has been verified for this POC.

## Demonstration

1. Open My farm, edit the current approach and the farmer's reasoning, and save.
2. In Plug-ins, try a sample without activation. Review activation of Seed cost check and compare two quotes.
3. Activate Crop planner, allocate a small trial area, and save a private draft. The current farm approach stays unchanged.
4. In Community, adapt a sample method, edit its private draft, and approve observation tracking separately.
5. Record an observation. Preview a summary, confirm sharing to the local demo feed, then remove it. The private experiment remains.

Recent calculations retain plugin version, inputs, and results; the workspace keeps the latest twenty. Draft methods can be edited before tracking; tracked methods stay fixed. Context, trials, observations, and summaries persist in `$DSH_HOME/fieldwork/workspace.json`. A missing file creates a fictional sample farm; corrupt records fail startup rather than silently resetting them.

## Scope

The five POC capabilities are a fixed catalog inside one source-loaded Host plugin, not independently installed packages. Activation is enforced for their operations. Weather and fictional growers are labelled examples. Community is shared only among devices accessing this one authenticated owner workspace; there is no online feed, identity service, audience enforcement, satellite pipeline, or physical-phone pairing. Free text is not automatically anonymized. Raw observations and farm context are excluded from summaries; user-entered method and summary text still need review.

The POC uses the harness's owner authentication, bounded JSON requests, same-origin mutation checks, serialized saves, and atomic file replacement. It is a single-owner prototype, not a multi-user production service. Restrict execution to one server process per workspace file. Arbitrary community code is never executed.

## Checks

```sh
pnpm --filter @fieldwork/poc test
pnpm --filter @fieldwork/poc typecheck
FIELDWORK_BROWSER_CHANNEL=chrome node --test fieldwork/poc/browser.test.mjs
```

The browser test uses installed Google Chrome when that channel is selected. Otherwise install the repository's Playwright Chromium headless shell and omit the channel variable. It boots a real Harness process with temporary state, verifies unauthorized access, exercises the flow, checks mobile layout, and stops its process. Screenshots are written under the ignored `.artifacts/fieldwork-poc/` directory.
