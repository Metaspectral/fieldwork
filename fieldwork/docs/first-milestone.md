# First milestone

Prove that a farmer-owned runtime can execute one useful Fieldwork plugin and serve the same saved workspace to a phone.

## Scenario

“I usually buy this seed from this supplier at this planting rate. Can another quote reduce my purchase cost?”

Preserve the current supplier, product, rate, area, units, and farmer's reasoning. Compare a second quote without assuming equivalent germination, quality, yield, or profit.

## Technical spike

1. Use the pinned DeepSeek Harness baseline in ../UPSTREAM.md and inspect its extension points. Source import, history preservation, and upstream license retention are complete.
2. Run its web surface locally and add a restricted Fieldwork seed-cost tool.
3. Invoke the tool through a real agent using fictional inputs; calculate results in deterministic code.
4. Persist the baseline and calculation in the local workspace.
5. Connect from a phone on the same network, reconnect, and inspect the same saved result.

Choose whether to extend the existing harness UI or attach a separate frontend based on this spike. Avoid a broad UI migration before the integration works.

## Acceptance

- Baseline practice and reasoning remain distinct from proposed changes.
- Previewing a plugin does not activate it; activation is explicit.
- Calculations validate inputs and show currency, units, assumptions, and purchase-cost scope.
- The agent cannot replace accepted records merely by producing text.
- Records survive runtime restart; browser disconnection does not lose a completed result.
- Phone access is authenticated and model credentials are not delivered to the browser.
- No records are published to community as part of the flow.
- Checks cover calculation correctness, invalid inputs, persistence, and approval enforcement. A manual laptop/phone walkthrough verifies the whole flow.

## Subsequent milestones

- Adapt relevant mockup screens into the working application.
- Run a versioned Sentinel-2 workflow with acquisition dates, cloud handling, source attribution, and saved outputs.
- Add remote connectivity with pairing and revocation.
- Publish a selected experiment summary to the opt-in community service.
- Package the same runtime for optional hosted execution.

Keep the social feed seeded and visibly labelled until identity and audience controls exist. Defer arbitrary executable community plugins, automatic runtime synchronization, blockchain, and sponsored commerce.
