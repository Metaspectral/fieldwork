# Field learning methods

English | [中文](README.zh.md)

A native Fieldwork plugin connects method discovery, weekly data checks, scouting, corn comparisons, and reviewed learning records. Each method has a readable `method.json` discovery card and `SKILL.md` instructions. Installed code owns computation; editing a method file never installs or executes a script.

## Use the workflow

Open **Field learning** in the Harness sidebar. **Try the learning example** creates a clearly fictional field and simulated monitor after review. Run a check, investigate its observation, save a scouting note, draft a comparison, review its measurements and layout, then record results and a farmer decision. A follow-up comparison links to the previous record without rewriting it.

For your own field, add the field in Corn planning and import supporting files through Source library. JSON and GeoJSON originals are supported. Enable monitoring with a pasted polygon or an imported Polygon, Feature, or single-feature collection. Confirm the actual boundary and external access before enabling. No location is inferred from the farm name.

The discovery cards explain the question, effort, prerequisites, outputs, and limitations. Installed methods are [Watch a field](watch-field/SKILL.md), [Investigate a pattern](scout-pattern/SKILL.md), and [Compare a corn practice](corn-strip-trial/SKILL.md). They can be used independently. Community code installation, arbitrary method execution, and automatic publication are outside this implementation.

## Monitoring semantics

Activation authorizes the configured availability checks and local result files. The monitor runs every seven elapsed days on the selected runtime, independently of model sessions. It is managed in Field learning; the Harness Automation tasks page continues to manage model prompts. Run now preserves the next future scheduled occurrence. Pause cancels active work and preserves history. Resume makes a check due. A stopped computer performs no checks; restart marks interrupted attempts and can run one catch-up check, not every missed week.

Each attempt records one of: running, new usable observation, no new data, no usable new imagery, failed, or interrupted. Missing imagery never becomes a crop-health result or a zero on the chart. The default rolling lookback is 30 days, catching delayed products within that window. Search is limited to 50 catalog entries and processing to three new scenes per attempt; a bounded batch is identified in the receipt. Previously examined scene versions are not processed twice. Provider failures leave earlier observations available. A storage commit failure stops monitoring and exposes a persistent fault until inspection and restart.

Live checks use the public Earth Search `sentinel-2-c1-l2a` collection and its public COG assets. The implementation uses native red/NIR pixels, Collection 1 scale/offset metadata, nearest native SCL classes 4 and 5, and polygon pixel-center inclusion. Cloud, shadow, water, snow, uncertain, missing, and invalid-reflectance pixels are excluded. Partial-tile missing pixels reduce coverage. Qualification requires the selected usable fraction and native-pixel count; defaults are 0.6 and 16. The 128-pixel display grid is a visualization; means use every valid native pixel in the crop. Only UTM scenes, one polygon ring, and at most 262144 pixels per cropped band are supported. Unsupported input or metadata produces a visible failed check.

NDVI is observational context. Crop stage and field conditions affect comparisons; narrow trial strips can be unresolved. Scouting is needed to investigate cause. Trial summaries calculate matched-block arithmetic means only, with explicit yield units and missing blocks. They perform no significance test, causal attribution, fertilizer recommendation, yield forecast, or profit calculation. Actual experimental design and moisture-corrected measurements need local review. A header-only harvest CSV saves an inconclusive learning record with unavailable means rather than fabricated zeroes.

## Files and configuration

The source profile places this workspace at `$DSH_HOME/fieldwork-workspace/learning`. `index.json` owns the record index. `methods/<id>/v1` contains private manifest and instruction copies; activation snapshots the package and its content hash. `artifacts/<sha256>` retains original boundary content, catalog metadata, cropped raw pixels and quality classes as CSV, NDVI JSON, check receipts, scouting Markdown, trial protocols, harvest templates/results, and learning summaries. Downloads verify file hashes and require an owner session. Edits to a saved artifact are detected; create a reviewed revision to change the record. Private method edits apply to later activations, preserving earlier snapshots.

The `fieldwork-learning` Cordis plugin accepts `root` (required), `pollSeconds` (30), `checkTimeoutSeconds` (90), and `scenesPerCheck` (3). Polling checks due tasks; it does not change the seven-day schedule. Providers, aborts, admitted work, timers, and storage commits settle before disposal finishes. Use one Host per workspace. Keep this directory when backing up a farm; it supplements existing farm records without rewriting them.

## Verification

`pnpm --filter @fieldwork/plugins test` covers scheduling, no-data distinctions, cancellation, restart recovery, files, evidence links, and descriptive outcomes. `node --test fieldwork/ui/learning.browser.test.mjs` exercises the native farmer journey and captures ignored screenshots. `FIELDWORK_SATELLITE_TEST=1 node --import tsx/esm --test fieldwork/plugins/satellite.live.test.ts` checks public reference imagery without credentials or model use; its files go to `.artifacts/live-satellite`.

A public July 30, 2026 reference scene produced 11705 valid polygon pixels and mean NDVI 0.36178865076947253. An independent rasterio/GDAL calculation matched the pixel count and mean within 1e-10. The [application result](watch-field/qualification/reference-result.json) and [independent result](watch-field/qualification/independent-result.json) document this software check. It is not a user-farm observation or broad scientific validation across scenes and regions.
