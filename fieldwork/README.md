# Fieldwork

A farmer-owned workspace for preserving current practices, exploring alternatives, and learning from experiments.

Fieldwork starts with how a farmer already works and why. Plugins can capture that approach, supplement it with weather or imagery, compare costs, or help test a manageable change. Experience, observations, and research retain their sources; the farmer decides what to adopt and share.

## Planned architecture

A customized [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) runtime runs on the farmer's computer. A browser interface lets them use the same workspace from their computer or phone. Experiments execute on the runtime and retain records there.

Optional services provide remote connectivity, community publishing, and hosted execution for farmers who prefer cloud compute. These are separate choices. Sharing publishes selected summaries, not the private workspace.

Local execution does not imply a local model: a cloud model receives the context sent to it. Workflows must make external data use visible.

## Current status

This repository contains planning material and an interactive HTML mockup. It does not yet contain the harness, a live agent, an execution backend, or a community service.

- [Architecture and decisions](docs/architecture.md)
- [First milestone](docs/first-milestone.md)
- [Interactive mockup](prototype/index.html)
- [Original product handoff](docs/reference/Fieldwork_Handoff.docx)
- [Contributing](CONTRIBUTING.md)

## Explore the mockup

Open `prototype/index.html` in a browser. It is self-contained and requires no API keys or build step. Browser behavior for local files may vary.

The assistant, community, weather, and satellite features are simulated. Demo state is stored in browser localStorage; there are no accounts or real audience controls. Use fictional records. Workspace exports contain private demo state.

Preserve the warm paper, charcoal, and clay visual direction, compact surfaces, and five tabs: Today, Community, Plug-ins, Experiments, and My farm.

## First milestone

Save a farmer's current seed-purchasing approach, compare another quote using a deterministic plugin, and save the result through a real agent. Open the same workspace from a phone on the same network and confirm records survive reconnection.

Later milestones add remote access, a reproducible Sentinel-2 workflow, selective community publication, and optional hosted execution.

## Source and licensing

The supplied mockup and handoff are preserved unchanged. The handoff predates the local-runtime decision; the architecture document records the current direction. DeepSeek Harness is not vendored or forked here yet. When integrating it, pin a commit and preserve its MIT license and applicable third-party notices. The license for Fieldwork's original code and social services remains a team decision before public release.
