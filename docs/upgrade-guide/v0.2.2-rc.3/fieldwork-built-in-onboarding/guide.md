---
kind: upgrade-guide
description: Fieldwork source launches now include onboarding, so the extra onboarding development overlay must be removed.
---

# Fieldwork built-in onboarding

English | [中文](guide.zh.md)

## Change

The repository’s Fieldwork source composition now includes farmer onboarding and saved first-run progress. Passing the standalone `fieldwork/onboarding/dev.patch.yml` overlay to `fieldwork:start` would load the plugin twice. The built-in composition explicitly uses demo data; the standalone developer overlay retains its own configuration. Upstream `dsh web` is unchanged.

## Migration

1. Build with `pnpm run fieldwork:build`.
2. Replace `pnpm run fieldwork:start --patch fieldwork/onboarding/dev.patch.yml --no-open` with `pnpm run fieldwork:start --no-open`. Keep the same `DSH_HOME` to retain native Sessions and farm records.
3. On first launch, select a connected model when needed. Confirm that **Farm setup** opens and the agent asks how to begin. Use **Setup** to pause or finish; use the sidebar to resume.
4. Read the [onboarding guide](../../../../fieldwork/onboarding/README.md) for progress storage and standalone developer usage. Do not use demo field history as actual farm evidence.
