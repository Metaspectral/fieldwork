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

## Investigate before selecting a treatment

[Investigate recurring low-yield areas](historical-yield/SKILL.md) saves a field, optional question season, baseline when known, source-specific seasons and crops, notes, and local tasks with optional owners and due dates. Missing quotes, targets, current crops or geometry do not block this investigation. The [Beltsville public example](../examples/beltsville/README.md) provides an explicit reviewed starting case without replacing the farmer’s practice.

Inspect attached spreadsheets as paginated tables, PDF page text, or original PNG/JPEG maps. Select a spreadsheet cell for its exact citation. Choose explicit X, Y and yield columns, units and a coordinate-system label before saving a quality check. Missing cells never become zero. The point plot preserves coordinate aspect ratio; large plots sample display points while summaries use every valid row. Analysis files retain the original source hash and descriptive limits. There is no automated cross-season alignment or persistence calculation.

Investigation saves pin readable JSON/Markdown snapshots and method packages. Edits check the revision captured when the form opened; stale edits are rejected. Analyses and local task changes remain in the same investigation, and later trial drafts retain its identity and selected evidence. Experiments shows those shared comparisons alongside earlier quick-trial records. Owners and dates are local records, not invitations or notifications.

The learning index uses version 2. Opening a version 1 index preserves its exact bytes in `index.json.v1.backup`, reads prior monitoring/scouting/trial records, and defaults investigations to empty. The next successful write commits version 2. A conflicting backup blocks opening rather than overwriting it. Keep the workspace on the current runtime; older readers reject version 2. New optional source metadata retains field, season and image media type without changing original bytes.
