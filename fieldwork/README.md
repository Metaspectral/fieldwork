# Fieldwork

English | [中文](README.zh.md)

A farmer-owned workspace built as native DeepSeek Harness plugins. Start with the farmer's current approach and reasoning, compare a manageable change, and retain what was learned.

## Native plugins

The application is the Harness itself: its chat, tool cards, approvals, sessions, and preset settings. My farm, Community, and Experiments are native main panels registered by the [UI plugin](ui/README.md), alongside the existing chat and navigation.

- **My Farm:** read and update current practices and farm context.
- **Community:** browse local demonstration knowledge, adapt methods privately, and preview selected summaries before sharing.
- **Crop Experiments:** create small trial drafts, adapt their baseline, approve tracking, and record observations.
- **Seed Costs:** compare purchase quotes and optionally save the calculation.

Each capability is a separate Cordis plugin within the Fieldwork agent preset. A Host plugin owns their shared private records. Native approval gates every model-requested mutation; a tool argument cannot grant its own approval. Page actions show a review dialog before the owner saves.

## Start here

- [Native plugin run guide](plugins/README.md)
- [Team setup](SETUP.md)
- [Architecture](docs/architecture.md)
- [First milestone](docs/first-milestone.md)
- [Upstream baseline](UPSTREAM.md)
- [Contributing](CONTRIBUTING.md)

## Scope

Community is a local demonstration feed, not an online social service. There is no live weather, satellite pipeline, hosted execution, or phone pairing yet. Browser tests cover the native pages. A real Harness conversation was also tested with `gpt-6.1-sol` through the local [Codex subscription bridge](codex/README.md). This verifies one read-and-compare scenario, not general agronomic quality. A cloud model receives the context sent to it.

The abandoned mockup and separate `/fieldwork` app have been removed. The original handoff remains historical context in Git; its interface recommendations do not control the native plugin implementation. Preserve upstream licensing and third-party notices when customizing the harness.
