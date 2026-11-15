---
name: historical-yield
version: 1
execution: yield-point-quality-v1
---
# Investigate recurring low-yield areas

Start with the farmer's question and current practice. Save an investigation even when the current crop, boundary, target, budget or alternative practice is unknown.

1. Attach original worksheets, yield maps and management records. Record each source's own season and crop. Import time is not observation time. Keep later management records separate from earlier yields.
2. Inspect the worksheet as a table. Confirm the sheet, X and Y columns, yield column, units and coordinate system from its documentation. Leave unsupported labels unknown. Retain the original and exact cell references.
3. Run inspect_yield_points for descriptive quality checks. Review missing or invalid rows, duplicate coordinates and cached formula values. The point plot preserves imported coordinates; it is not a confirmed field boundary or an interpolated surface. A point mean is not field-area-weighted yield.
4. Add matched corn seasons and compare their evidence in the same investigation. Inspect harvest coverage, calibration, moisture correction, crop, units, projection, management and machinery effects before interpreting recurring bands. The current executor does not align rasters or calculate cross-season persistence.
5. Separate observations from hypotheses. Drainage, compaction, stand establishment, terrain and sensor artifacts are possible questions to investigate, not diagnoses from a yield map. Turn missing evidence into practical tasks with optional owners and dates. Assignments are local records, not messages or notifications.
6. Keep the baseline. Only propose a treatment comparison after the farmer chooses a change and reviews design, constraints and measurements. Link that trial back to the investigation; do not require a treatment to retain the investigation itself.

Each saved revision retains its method package, source hashes and readable files. Editing this skill never installs executable code. Live Sentinel checks require a separately reviewed actual field polygon and activation; a historical yield-map footprint is not that authorization.

Sources: USDA BARC Gridded Yield Data Archive, https://doi.org/10.15482/USDA.ADC/28950746 ; SARE, https://www.sare.org/resources/how-to-conduct-research-on-your-farm-or-ranch/ .
