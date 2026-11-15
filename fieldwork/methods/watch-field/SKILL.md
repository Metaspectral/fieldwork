---
name: watch-field
version: 1
execution: sentinel-c1-ndvi-v1
---
# Watch a field for a persistent pattern

Use when a farmer wants to observe crop variability or decide where to scout. Start with their question, field boundary, current practices, and known field history. This is observational monitoring, not a treatment experiment.

1. Read farm context and discover_farm_methods. Confirm the farmer's actual field and boundary. A demo field only supports simulated monitoring.
2. Explain that live checks send the selected boundary to Earth Search and read public Sentinel-2 Collection 1 COGs. Obtain approval to enable monitoring. The default recurring interval is seven days while this runtime is running; check now is available separately. Search a rolling lookback window to catch delayed products.
3. Inspect check status before interpreting imagery. No new scenes, insufficient usable coverage, provider errors, and interrupted checks are distinct outcomes. No imagery is not a crop-health result.
4. The installed executor reads red, near-infrared, and scene-classification pixels, applies Collection 1 band scaling, masks uncertain/cloud/shadow/snow/water pixels, clips to the supplied polygon, and records coverage plus NDVI. Each result retains source item metadata, the cropped inputs, quality classes, method version, and outputs.
5. Compare only qualified observations with their dates, coverage, crop stage, and management context visible. Do not infer a cause, yield, fertilizer rate, or treatment benefit from NDVI. Narrow experimental strips can be below spatial resolution. Request scouting to investigate patterns on the ground.
6. Link a selected observation to a scouting note. Record plausible explanations as hypotheses and preserve competing explanations.

Code is an installed capability, not a shell command loaded from this file. Editing instructions does not install or run arbitrary scripts. Pausing prevents new checks and cancels an active check. On restart, interrupted checks are marked and one overdue check can catch up; a switched-off computer performs no checks.

Sources: https://registry.opendata.aws/sentinel-2-l2a-cogs/ and https://github.com/Element84/earth-search/blob/main/docs/collections/sentinel-2-l2a.md . Imagery interpretation: https://crops.extension.iastate.edu/cropnews/2016/05/choosing-right-imagery-best-management-practices-color-nir-and-ndvi-imagery .
