# Upstream baseline

Fieldwork imports DeepSeek Harness with its complete Git history. The immutable integration reference is the Git tag `fieldwork-upstream/0.2.2-rc.3`; use `git rev-parse fieldwork-upstream/0.2.2-rc.3` to resolve its exact commit.

The upstream source is https://github.com/deepseek-ai/deepseek-harness. Its root LICENSE and THIRD_PARTY_NOTICES.md remain in place. Existing upstream package names and release metadata retain their original identities; they are not Fieldwork publication targets.

## Updating

Add the remote once in a new clone:

```sh
git remote add upstream https://github.com/deepseek-ai/deepseek-harness.git
```

For each update, fetch `upstream master`, create a branch from Fieldwork main, review the upstream changes, and merge the selected upstream commit. Run relevant checks and review the result through a pull request before updating main. Record an additional baseline tag after accepting an upgrade; do not move an existing baseline tag.

Keep product documents and the mockup under `fieldwork/`. Build Fieldwork capabilities through documented plugin extension points. Avoid agent-loop changes and broad package renaming as part of initial customization.

Upstream automation targets its own release and deployment infrastructure. Fieldwork release publishing, credentials, and hosted deployments are not configured by this import.
