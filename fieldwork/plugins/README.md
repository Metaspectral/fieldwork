# Native Fieldwork plugins

English | [中文](README.zh.md)

Fieldwork extends the actual DeepSeek Harness application. It registers independent My Farm, Community, Crop Experiments, and Seed Costs Cordis plugins in a Fieldwork agent preset, with a Host-owned private-record service. There are no custom HTTP routes, HTML screens, stylesheets, or replacement navigation.

## Run

Follow the [team setup](../SETUP.md), then run from the repository root:

```sh
DSH_HOME="$PWD/.fieldwork/native" DSH_TELEMETRY_DISABLED=1 pnpm dsh --profile web --patch fieldwork/plugins/cordis.source.patch.yml --no-open
```

Open the authenticated URL printed by the server. Select the **Fieldwork** agent preset in the native new-session selector. Configure your model using Harness settings. The preset mounts separate Cordis components. Capability enable/disable is configured in the source composition for this POC; there is no custom toggle UI. The test suite uses the actual Loader and native executor without a model API call; real-model behavior is not claimed.

## Try a conversation

1. “Read my current farm context. Help me capture why I plant this way.” Review the proposed update in the native approval dialog.
2. “Compare seed quotes: 12 hectares, 1.5 bags per hectare, CAD 120 versus CAD 108 per bag.” The deterministic result is CAD 216 less in purchase costs; it does not imply better yield or profit. Saving is a separate approved action.
3. “Browse community knowledge. Adapt the cover-crop method privately.” Review the draft, edit its baseline, then separately approve observation tracking.
4. “Record that the lower strip remained wet. Keep this observation private.” The observation is stored against the tracked method.
5. “Preview an inconclusive result summary, without my raw observations.” Publication requires a valid preview and native approval showing the selected content. Removing a shared summary preserves private records.

The preset includes no shell or arbitrary filesystem tools. Read-only operations do not prompt. Every mutation is gated by the Harness tool pipeline, not an `approved` argument or model promise. Missing approval support fails closed. A configured model receives context returned by tools.

## Local records and limits

Records are saved in `$DSH_HOME/fieldwork-native/records.v1.json`; they are independent of the deleted mockup data. Run one process per record file. Changes are serialized and committed by atomic replacement. Missing files start a clearly fictional demo farm; invalid existing files fail rather than reset. Tracking does not approve agronomic treatment or schedule physical work.

Community is a local feed shared by devices accessing this owner runtime. There is no online audience, live weather, Sentinel-2 execution, hosted runtime, or phone pairing. Preview text is not automatically anonymized. Summary construction excludes private observations and farm context but includes selected title, takeaway, baseline, change, author, and method source. Reviewed previews are immutable and expire on restart or when the in-memory preview limit is reached.

## Checks

```sh
pnpm --filter @fieldwork/plugins typecheck
pnpm --filter @fieldwork/plugins test
node --test fieldwork/plugins/composition.test.mjs
```

The composition test boots a real Harness profile, mounts the actual Fieldwork preset, and exercises native tools. A test-only answerer explicitly rejects then permits approval requests; the test checks that denial changes nothing, calculations are deterministic, private observations stay out of summaries, withdrawal retains experiments, and crop planning preserves the farmer's baseline. It does not simulate a real-model conversation.
