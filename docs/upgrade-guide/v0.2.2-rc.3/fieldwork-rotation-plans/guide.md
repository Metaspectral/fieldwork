---
kind: upgrade-guide
description: Fieldwork records migrate to schema v3, adding rotation plans and a Rotation panel.
---

# Fieldwork rotation plans

English | [中文](guide.zh.md)

## Change

Fieldwork private records now use schema version 3, adding rotation plans. The storage path remains `$DSH_HOME/fieldwork-native/records.v1.json`. Rotation is a new native panel, and the Fieldwork preset gains the tools `list_regional_rotations`, `read_rotation_plans`, `propose_rotation_plan`, and `accept_rotation_plan`. See the [rotation budget method](../../../../fieldwork/docs/rotation-method.md).

## Migration

1. Stop other Fieldwork processes using the same data directory. Run one Host per record file.
2. Start Fieldwork normally. A valid v2 record file is preserved as `records.v1.json.v2.backup` before migration, and a v1 file as `records.v1.json.v1.backup`. The v3 state is committed on the next successful write. Existing fields, sources, corn plans, experiments, and summaries are retained, and the list of rotation plans starts empty.
3. If migration reports corrupt data or a conflicting backup, preserve both files and resolve the conflict before restarting. The application fails rather than resetting records.

Older Fieldwork code cannot read schema v3. To roll back, stop the Host, preserve the v3 file, then restore the v2 backup. Rotation plans are unavailable in the older code; retain the v3 copy for returning to the new version.
