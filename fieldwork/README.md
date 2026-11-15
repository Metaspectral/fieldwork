# Fieldwork

English | [中文](README.zh.md)

A farmer-owned workspace built as native DeepSeek Harness plugins. Start with the farmer's current approach and reasoning, compare a manageable change, and retain what was learned.

Corn is the first crop workflow. The underlying farm context, evidence, plans, and experiments should support other farm types. Longer-term scope includes assigning work to human helpers with explicit responsibilities and permissions; helper delegation is not implemented yet.

## Native plugins

The application is the Harness itself: its chat, tool cards, approvals, sessions, and preset settings. My farm, Community, Experiments, Source library, Corn planning, Rotation, and Field learning are native main panels registered by the [UI plugin](ui/README.md), alongside the existing chat and navigation.

- **Farm setup:** built-in onboarding after model selection, with pause, resume, and explicit completion. See the [onboarding guide](onboarding/README.md).
- **My Farm:** read and update current practices and farm context.
- **Community:** browse local demonstration knowledge, adapt methods privately, and preview selected summaries before sharing.
- **Crop Experiments:** create small trial drafts, adapt their baseline, approve tracking, and record observations.
- **Field learning:** discover file-backed methods, check Sentinel-2 availability weekly, investigate observations, and retain reviewed corn comparisons. See the [method guide](methods/README.md).
- **Source library:** retain original spreadsheets, PDFs, saved web pages, public HTTPS snapshots, and farmer notes with exact citations.
- **Corn planning:** preserve the baseline, compare a partial-field seeding trial, review a versioned budget, and retain observations. See the [method and evidence limits](docs/corn-method.md).
- **Rotation:** see each field's grown and planned crops, compare the current rotation with a cited regional rotation using the farmer's own numbers, and review a versioned plan. See the [method and limits](docs/rotation-method.md).
- **Seed Costs:** compare purchase quotes and optionally save the calculation.

Each capability is a separate Cordis plugin within the Fieldwork agent preset. A Host plugin owns their shared private records. Native approval gates every model-requested mutation; a tool argument cannot grant its own approval. Page actions show a review dialog before the owner saves.

Field learning also supports open historical-yield investigations with true unknowns, original-file views, descriptive point checks, and local work items. Try the reviewed [Beltsville public-data case](examples/beltsville/README.md).

## Start here

- [Screenshots](screenshots/README.md) and [starter identity](brand/README.md)
- [Native plugin run guide](plugins/README.md)
- [Team setup](SETUP.md)
- [Architecture](docs/architecture.md)
- [First milestone](docs/first-milestone.md)
- [Upstream baseline](UPSTREAM.md)
- [Contributing](CONTRIBUTING.md)

## Scope

Community is a local demonstration feed, not an online social service. Live Sentinel-2 checks are available after explicit field activation; there is no live weather, hosted execution, or phone pairing yet. Browser tests cover the native pages. A real Harness conversation was also tested with `gpt-6.1-sol` through the local [Codex subscription bridge](codex/README.md). This verifies read-and-compare and cited corn-budget scenarios, not general agronomic quality. A cloud model receives the context sent to it.

The abandoned mockup and separate `/fieldwork` app have been removed. The original handoff remains historical context in Git; its interface recommendations do not control the native plugin implementation. Preserve upstream licensing and third-party notices when customizing the harness.
