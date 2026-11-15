# Fieldwork

English | [中文](README.zh.md)

A farmer-owned workspace built as native DeepSeek Harness plugins. Start with the farmer's current approach and reasoning, compare a manageable change, and retain what was learned.

## Native plugins

The application is the Harness itself: its chat, tool cards, approvals, sessions, and preset settings. There is no separate Fieldwork HTML app or custom frontend.

- **My Farm:** read and update current practices and farm context.
- **Community:** browse local demonstration knowledge, adapt methods privately, and preview selected summaries before sharing.
- **Crop Experiments:** create small trial drafts, adapt their baseline, approve tracking, and record observations.
- **Seed Costs:** compare purchase quotes and optionally save the calculation.

Each capability is a separate Cordis plugin within the Fieldwork agent preset. A Host plugin owns their shared private records. Native approval gates every mutation; a tool argument cannot grant its own approval.

## Start here

- [Native plugin run guide](plugins/README.md)
- [Team setup](SETUP.md)
- [Architecture](docs/architecture.md)
- [First milestone](docs/first-milestone.md)
- [Upstream baseline](UPSTREAM.md)
- [Contributing](CONTRIBUTING.md)

## Scope

Community is a local demonstration feed, not an online social service. There is no live weather, satellite pipeline, hosted execution, or phone pairing yet. The native composition is checked without a model API call; model quality and real-provider behavior remain unverified. A cloud model receives the context sent to it.

The abandoned mockup and separate `/fieldwork` app have been removed. The original handoff remains historical context in Git; its interface recommendations do not control the native plugin implementation. Preserve upstream licensing and third-party notices when customizing the harness.
