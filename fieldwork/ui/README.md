# Native Fieldwork pages

English | [中文](README.zh.md)

This private Cordis plugin registers My farm, Community, Experiments, Source library, Corn planning, Rotation, and Field learning in the Harness main-panel and sidebar slots. It reuses native theme tokens, buttons, dialogs, locale services, and the existing application shell.

A shared field and season selection follows navigation. My farm opens as a readable overview with editing and quote calculators on demand. Field learning retains incomplete investigations, displays original evidence, records local tasks, and links later comparisons to the same question. Source viewers use cached-cell tables, PDF page text and authenticated PNG/JPEG images; exact citations appear on selection. See the [public case](../examples/beltsville/README.md).

## Use

From the repository root, run `pnpm run fieldwork:build`, then `pnpm run fieldwork:start`. Open the authenticated server URL and select a Fieldwork page in the sidebar. No model is required for page actions.

- My farm captures current practices and reasons, compares seed quotes, and saves reviewed calculations.
- Community displays local sample knowledge. Adapting creates a private draft; withdrawing a summary retains the private trial.
- Field learning discovers readable methods and connects weekly availability checks, NDVI maps, scouting, trial schematics, and reviewed yield summaries. See the [method guide](../methods/README.md).
- Source library imports originals or captures public HTTPS sources and exposes exact cell, page, and block citations.
- Corn planning connects shared fields and evidence to reviewed seed-budget revisions and dated learning records. See the [method](../docs/corn-method.md).
- Rotation shows grown and planned crops per field and compares two rotations with the farmer's own prices, yields and costs before a reviewed plan. See the [method](../docs/rotation-method.md).
- My farm opens with a farm map of located fields, optionally over a Sentinel-2 true-colour picture fetched on request, then a fields table of recent crops and a Field conditions card that groups saved NASA checks as weather and crop growth and states that soil is not measured. All three follow the working field. The labelled Brookings example adds real USDA field outlines with satellite-classified crop history and hides the fictional farm notes. See the [method](../docs/rotation-method.md).
- Experiments preserves a baseline, tracks a small change, records observations, and previews a selected summary before sharing locally.

New activations and learning decisions open an explicit review dialog. Checks within an activated monitor use its existing bounded authorization. Model tool mutations continue to use the native Harness approval pipeline. Both paths use the same Host-owned records; successful commits notify connected pages over authenticated SSE. The JSON endpoints require an owner session; writes also require same-origin JSON requests and an explicit confirmation field.

## Checks and limits

```sh
pnpm --filter @fieldwork/ui typecheck
node --test fieldwork/ui/browser.test.mjs fieldwork/ui/research.browser.test.mjs fieldwork/ui/learning.browser.test.mjs fieldwork/ui/investigation.browser.test.mjs fieldwork/ui/rotation.browser.test.mjs
```

Set `FIELDWORK_BROWSER_CHANNEL=chrome` to use an installed Chrome instead of Playwright's browser. The browser test boots an isolated Harness on an allocated loopback port, checks review-before-save, private adaptation, observations, publication preview, withdrawal, persistence, and mobile overflow. It captures ignored screenshots in `.artifacts/native-pages`.

Community has no online audience. No live forecast, agronomic recommendation engine, phone pairing, or cloud gateway is implemented. Summary previews exclude raw observations but copied method text still needs review. See [local-record limits](../plugins/README.md).
