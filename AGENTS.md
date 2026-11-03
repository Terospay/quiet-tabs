# Quiet Tabs

This is a standalone Chrome Manifest V3 extension for attention-aware tab management.

## Workflow

- Read README.md and the relevant source and tests before editing.
- Keep runtime dependency-free: plain JavaScript modules, HTML and CSS.
- Use JSDoc and models.d.ts for strict type checking. Keep browser I/O in engine.js and event registration in background.js; core.js owns the rules.
- Use apply_patch for source edits. Preserve unrelated work. Do not commit or publish unless asked.
- Run npm ci --ignore-scripts, then npm run check. Package with npm run package after checks pass.
- Report what changed, what was tested, and any unverified browser behavior in plain language.

## Product invariants

- Fresh installs and migrations from v0.1 start in trial mode. Trial never expires into auto mode.
- In trial mode, both manual and automatic close operations must fail at the engine boundary. UI feedback only rates a suggestion and may protect or snooze the tab.
- Short tab scans never refresh meaningful recency, add meaningful visits, or increase qualified attention. Only a continuous visit reaching the configured threshold qualifies.
- Persist recovery links before removing tabs in non-trial modes. Recheck browser protection immediately before removal.
- No remote requests, analytics, page content access, or host permissions.
- Tests use fake tabs. Never run destructive browser tests against a personal profile.
- Keep observation-only mode as the default. Do not enable automatic closing without explicit user action.
