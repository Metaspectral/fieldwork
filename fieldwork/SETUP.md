# Team setup

## Prerequisites

Use Git, Node.js 24.9 or newer, and Corepack. The root package.json pins pnpm 11.28.5. Native dependencies may require platform build tools if a prebuilt binary is unavailable. See the upstream development guide for platform requirements.

## Install and build

```sh
git clone https://github.com/Metaspectral/fieldwork.git
cd fieldwork
corepack enable
pnpm install --frozen-lockfile
pnpm run build
```

The upstream monorepo includes desktop and web packages; the initial build is substantial. The build checks package code and aggregate test/script types.

## Start the browser application

Use a dedicated local state directory so development does not reuse another Harness installation's sessions and credentials. On macOS or Linux:

```sh
DSH_HOME="$PWD/.fieldwork/dev-runtime" pnpm dsh web --no-open
```

In PowerShell:

```powershell
$env:DSH_HOME = Join-Path (Get-Location) '.fieldwork/dev-runtime'
pnpm dsh web --no-open
```

Open the URL printed by the server. It contains a credential: keep it private. Configure your own model credential through Settings → Models. Do not commit credentials or runtime data. Using a cloud model sends selected context to that provider.

This starts the upstream agent experience. Fieldwork's custom interface, restricted tools, durable experiment records, and phone pairing remain the first milestone's implementation work. The stock agent can access files and execute commands; use a disposable demo workspace rather than real farm records.

For frontend development, `pnpm run dev:web` builds artifacts and starts the development loop. Follow the root AGENTS.md and upstream development/testing documentation for changes to harness packages.

## Phone access

The stock server listens locally. Same-network access requires explicit listener and HTTPS/proxy configuration; it is not enabled by these commands. Follow the upstream remote-access guide and implement the planned Fieldwork pairing and revocation flow before offering it to farmers. Do not share the raw agent endpoint publicly.

## Product reference

Open `fieldwork/prototype/index.html` for the standalone mockup. Its data and assistant are simulated. The mockup is not connected to the harness.

See the Fieldwork README for architecture and the first milestone. Do not treat the upstream release workflows as Fieldwork deployment instructions.
