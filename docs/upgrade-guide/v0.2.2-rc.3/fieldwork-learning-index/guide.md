---
kind: upgrade-guide
description: Fieldwork learning indexes use version 2, which older Fieldwork runtimes cannot read.
---

# Fieldwork learning index

English | [中文](guide.zh.md)

## Change

Fieldwork's private learning index changes from version 1 to version 2 to retain investigations, local tasks, and historical-yield analyses. Older Fieldwork runtimes reject version 2. Existing monitoring, scouting, trials, and artifact paths remain available. The [method guide](../../../../fieldwork/methods/README.md) owns the current storage contract.

## Migration

1. Stop other Hosts using the same Fieldwork workspace and retain a copy of its directory. The source profile places it at `$DSH_HOME/fieldwork-workspace/learning`.
2. Start the current Fieldwork runtime. Opening `index.json` version 1 creates the byte-for-byte `index.json.v1.backup` and reads the prior records. A different existing backup blocks opening; preserve both files and resolve their identity before retrying.
3. Open **Field learning** and verify prior records. The next successful learning write stores version 2; recovery of interrupted checks can perform that write during startup. Confirm that `index.json` has `"version": 2` and that `index.json.v1.backup` still contains the original bytes. Use the current runtime for this workspace. Restore a separate complete directory copy if you need to inspect it with an older runtime.
