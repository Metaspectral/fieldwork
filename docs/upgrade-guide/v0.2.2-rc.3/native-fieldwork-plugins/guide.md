---
kind: upgrade-guide
description: Fieldwork's standalone HTML POC is replaced by native Harness plugins with a new source overlay and private-record location.
---

# Native Fieldwork plugins

English | [中文](guide.zh.md)

## Change

Fieldwork removes the standalone `/fieldwork` application, the `fieldwork/poc` source overlay, and the HTML mockup. Fieldwork now uses native Harness chat, tool results, approvals, and a Fieldwork agent preset. This affects users of the earlier Fieldwork POC, not stock Harness profiles.

Private records use a new file under `fieldwork-native/records.v1.json` in `DSH_HOME`. Old POC files remain untouched and are not automatically imported. Community remains a local demonstration feed.

## Migration

1. Stop any process using the old `fieldwork/poc/cordis.source.patch.yml` overlay. Keep old local data if you need it.
2. Run `pnpm install --frozen-lockfile` and `pnpm run build` from the repository root.
3. Start the web profile with `--patch fieldwork/plugins/cordis.source.patch.yml` instead of the deleted POC overlay, using the command in the [native plugin guide](../../../../fieldwork/plugins/README.md).
4. Open the normal authenticated Harness URL and select the Fieldwork preset. Do not use the removed standalone page.
5. Confirm that `read_my_farm`, `browse_farm_knowledge`, `plan_crop_trial`, and `compare_seed_quotes` are available. Review native approval prompts before saving changes. Do not treat the initial fictional farm as your real record.
