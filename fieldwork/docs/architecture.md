# Fieldwork architecture

## Product model

A farmer has a current workflow shaped by experience, research, equipment, budget, and local conditions. Fieldwork preserves that workflow and its reasoning. Plugins offer additions or alternatives without requiring replacement of the existing approach.

Keep three concepts distinct:

- **Workflow:** the farmer's accepted practice, context, and reasons.
- **Plugin:** a versioned capability or method the workflow can use.
- **Experiment:** a proposed change compared with a recorded baseline, with observations and results.

A weather plugin can supplement a planting decision. A seed-cost plugin can compare purchase costs without claiming equivalent yield. An imagery plugin can guide scouting without presenting NDVI as a diagnosis.

## Runtime and access

The farmer's computer hosts a customized DeepSeek Harness runtime, private workspace storage, and experiment workers. The browser is the interface; the phone does not need to execute image processing. Jobs and their status must survive browser disconnection. Recovery after runtime restart needs explicit implementation.

Start with one farmer and phone access on the same network. Add authenticated remote access through a private network or tunnel later. Pairing, device revocation, and workspace authorization are application responsibilities. Do not expose unrestricted agent execution publicly.

The same packaged runtime should eventually support hosted execution. Initially each workspace has one authoritative runtime. Automatic local/cloud switching, synchronization, and conflict resolution are deferred.

## Plugins and execution

Separate executable, developer-controlled integrations from farmer-editable method documents. Copying a community method creates a private draft; it does not install executable code or grant permissions.

Plugin definitions should describe version, purpose, inputs, outputs, units, required access, limitations, and source attribution. Installations pin an approved version and configuration. Runs record the version, inputs, outputs, status, and relevant source timestamps. Long-running imagery jobs need cancellation and resource limits.

The agent proposes actions through structured tools. Deterministic code performs calculations. Application checks enforce permissions and approvals outside the model. Activation, workflow updates, and publication are distinct decisions; rejection preserves the accepted state.

## Data and optional services

Private records stay with the chosen runtime unless the farmer authorizes transfer. A cloud model may receive selected context even when execution is local; the interface must disclose this distinction.

Optional services are independent:

- Remote connectivity transports authenticated access to a runtime.
- Community stores deliberately published summaries, attributed methods, profiles, and discussion.
- Hosted execution provides a private runtime for users who prefer it.

Community publication constructs a separate summary with a preview and explicit audience. It must not serialize the private workspace. Withdrawal removes the shared summary without deleting the private experiment. Server-side audience enforcement is required before real sharing.

The intended community service is open source and self-hostable. Federation is not an initial requirement. Blockchain is deferred; portable records, version hashes, and signed releases address immediate ownership and source attribution needs.

## Decisions still open

- Frontend extension points and Fieldwork runtime integration; the imported harness revision is pinned by the baseline tag in ../UPSTREAM.md.
- Database, job persistence, packaging, and supported operating systems.
- Remote connectivity and device pairing.
- Model providers and local-model support.
- Initial farmer segment and geography.
- Fieldwork licensing and community moderation policy.

## References

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [Remote deployment guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/public-deployments.md)
- [Original handoff](reference/Fieldwork_Handoff.docx), retained as historical product context.
