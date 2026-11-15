---
kind: upgrade-guide
description: Fieldwork records migrate to schema v2 and built-in onboarding now uses the shared field owner.
---

# Fieldwork shared records

English | [中文](guide.zh.md)

## Change

Fieldwork private records now use schema version 2, adding shared fields, source snapshots, and corn planning revisions. The storage path remains `$DSH_HOME/fieldwork-native/records.v1.json` for continuity. The filename no longer names the current schema version.

Built-in onboarding imports saved field corrections and notes from `$DSH_HOME/fieldwork/onboarding.json` into shared records. Provider cache files remain in their existing location. The standalone developer onboarding plugin continues to own its own file.

Real-mode onboarding no longer publishes unvalidated agronomic risk classifications or derived water, soil-loss, and fertilizer-cost estimates. Demo behavior remains explicitly fictional.

## Migration

1. Stop other Fieldwork processes using the same data directory. Run one Host per record file.
2. Start Fieldwork normally. A valid v1 record file is preserved as `records.v1.json.v1.backup` before migration. The v2 state is committed on the next successful write. Existing farm context, experiments, summaries, and comparisons are retained. Legacy onboarding files are preserved.
3. Open My farm or Corn planning and confirm the field notes and crop-year corrections. Source library and Corn planning are new native panels.
4. If migration reports corrupt data or a conflicting backup, preserve both files and resolve the conflict before restarting. The application fails rather than resetting records.

Older Fieldwork code cannot read schema v2. To roll back, stop the Host, preserve the v2 file and `originals` directory, then restore the v1 backup. New sources, shared field edits, and corn revisions are unavailable in the older code; retain the v2 copy for returning to the new version.
