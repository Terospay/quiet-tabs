# Development

## Requirements

- Node.js 24, the version used in continuous integration.
- npm to install development dependencies from the lockfile.
- The `zip` command for packaging on macOS, Linux or a compatible Windows environment.
- Chrome 120 or later for manual extension testing.

Only Chrome is needed to use the installed extension.

## Setup

Run from the project root:

```sh
npm ci --ignore-scripts
npm run check
```

The runtime has no build step: Chrome loads the JavaScript modules directly. Shared types are declared in `models.d.ts` and referenced through JSDoc. TypeScript performs strict checks without emitting code.

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Test attention rules, trial behavior, tab operations, background events and the panel DOM |
| `npm run typecheck` | Run strict type checking |
| `npm run check` | Run type checks, tests, manifest validation, file checks and syntax checks |
| `npm run preview` | Start a local interface demo with fictional tabs |
| `npm run package` | Create an unpacked extension folder and ZIP in `dist/` |

Tests simulate Chrome APIs and never access personal tabs. DOM tests do not render a real browser layout. Automated checks should be supplemented with manual testing in a separate Chrome profile.

GitHub Actions installs dependencies, runs `npm run check` and packages the extension on Node.js 24.

## Interface preview

```sh
npm run preview
```

Open `http://127.0.0.1:43127/panel.html`. The page is labeled as a demo. Its fictional data resets on reload and is unrelated to real tabs. The preview server listens only on the local interface and is not required by the installed extension.

## Structure

```text
quiet-tabs/
├── manifest.json          # Chrome capabilities and permissions
├── core.js                # Attention, retention, protection and trial journal
├── engine.js              # Storage and browser operations
├── background.js          # Chrome events and serialized processing
├── panel.html             # Side panel interface
├── panel.css
├── panel.js
├── models.d.ts            # Shared types
├── i18n.js                # English/Russian translations and formatting
├── tests/                 # Tests, browser simulation and demo
├── scripts/               # Validation and packaging
├── docs/                  # Documentation and README banner
└── .github/workflows/     # Continuous integration
```

## Design invariants

- New installations and v0.1 migrations start in Trial mode, with no automatic transition out of it.
- Trial mode rejects closing at the engine boundary.
- Separate brief scans never combine into one qualified visit.
- In closing modes, the link is persisted before the tab is removed.
- State changes are processed sequentially so concurrent events do not overwrite one another.
- The runtime makes no external requests and uses no analytics, host permissions or page-content access.

## Change workflow

After modifying the code, run `npm run check`. To verify behavior in Chrome, reload the extension at `chrome://extensions` and reopen the panel. Use fictional pages in a separate test profile for checks that close tabs.

Keep the runtime dependency-free. Put deterministic rules in `core.js`, browser operations in `engine.js` and event registration in `background.js`. Keep source messages and documentation in English; provide Russian interface translations in `i18n.js`. Do not translate page titles, URLs or other user data.

## Packaging

`npm run package` reads the version from the manifest and creates a distributable folder and ZIP in `dist/`.

The package includes runtime files and documentation. It excludes tests, development dependencies, Git metadata and local browser-profile data. A machine running the packaged extension does not need Node.js.

## Platform documentation

- [Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
- [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Idle API](https://developer.chrome.com/docs/extensions/reference/api/idle)
- [Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)

[Project overview](../README.md)
