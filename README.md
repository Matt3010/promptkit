# PromptKit

PromptKit is a backend-agnostic web terminal UI for applications that want a small, command-driven interface without adopting a frontend framework.

It provides a responsive terminal rendered in the browser, with command history, completion, structured output, lifecycle handling, optional initial bootstrap snapshots, dynamic theme variants, generic actions and indicators, and optional live events. PromptKit owns presentation only. The host application owns commands, authentication and business logic.

## Goals

- One reusable terminal UI for different backends and languages.
- No application-specific commands in the client.
- No frontend framework dependency.
- Mobile-friendly, keyboard-friendly and accessible by default.
- Structured rendering instead of parsing presentation hints from plain text.
- A small HTTP protocol that can be implemented by Python, TypeScript, Go or any other backend.
- Optional initial bootstrap state without abusing command POSTs for initialization.
- Optional realtime events without making realtime mandatory.
- Explicit compatibility rules for public API and wire-format changes.

## Quick start

PromptKit is intentionally small to initialize. A normal consumer only needs:

```ts
const kit = new PromptKit({ root });

await kit.start();
kit.ready();
```

`start()` loads the manifest, applies an optional bootstrap snapshot, and opens optional live events. The host calls `ready()` when command input may become available.

If the application declares actions, constructor code still contains only application behavior:

```ts
const kit = new PromptKit({
  root,
  actions: {
    "import-config": async ({ files }) => {
      await importConfig(files[0]);
      return undefined;
    },
  },
});

await kit.start();
kit.ready();
```

Action labels, chooser wording, pre-action feedback, no-match feedback, and error presentation are declarative manifest data. They do not require extra browser callbacks.

## Protocol

A host exposes a small conceptual HTTP surface:

```text
GET  /tui/manifest
GET  <manifest.bootstrap.url>  # optional idempotent initial snapshot
POST /tui/command
GET  <manifest.events.url>     # optional SSE endpoint
```

The concrete bootstrap and event URLs are declared by the manifest. The protocol is deliberately versionless. Consumers pin a PromptKit release; the manifest does not repeat the package version with a separate protocol-version field.

The manifest describes the terminal rather than its business logic:

```json
{
  "name": "example-app",
  "prompt": ">",
  "commands": ["/status", "/list", "/help"],
  "bootstrap": { "url": "/tui/bootstrap" },
  "events": { "url": "/tui/events" },
  "theme": {
    "default": {
      "accent": "#8b949e",
      "accentMuted": "#5c636b"
    },
    "variants": {
      "active": {
        "accent": "#58d6a8",
        "accentMuted": "#4a9781"
      }
    }
  }
}
```

A command request is deliberately small:

```json
{
  "input": "/list"
}
```

PromptKit preserves non-blank command input exactly as entered.

The response is a list of typed blocks and may switch the active visual variant:

```json
{
  "ok": true,
  "themeVariant": "active",
  "blocks": [
    { "type": "text", "text": "Items" },
    {
      "type": "table",
      "columns": ["Id", "Status"],
      "rows": [["42", "completed"], ["43", "running"]]
    }
  ]
}
```

PromptKit renders the blocks. It never needs to know what `/list`, `completed` or a host-specific state key means.

## Block types

- `text`
- `table`
- `code`
- `status`
- `progress`
- `download`
- `link`
- `separator`

Unknown block types are rejected by the protocol validator. New types require an explicit compatibility strategy.

## Lifecycle

PromptKit owns the terminal startup experience. Construction immediately renders a terminal-style loading state; `start()` loads the manifest, applies the optional bootstrap snapshot, then opens optional live events. The terminal deliberately remains unavailable until the host calls `ready()`.

```ts
const kit = new PromptKit({ root });

await kit.start();
kit.ready();
```

If the host has additional asynchronous initialization that must finish before input becomes available, keep it explicitly between the two lifecycle calls:

```ts
await kit.start();
await initializeRemainingHostState();
kit.ready();
```

`start()` already moves PromptKit into the failed lifecycle state if PromptKit initialization itself fails. Catch the error only when the host needs additional handling.

When `manifest.bootstrap` is present, PromptKit performs an idempotent GET and applies the returned snapshot before opening the event stream. This avoids using arbitrary command POSTs as initialization retries and guarantees that a stale bootstrap response cannot overwrite a newer SSE update.

Lifecycle states are `loading`, `ready` and `failed`, exposed as `data-phase` on the PromptKit root. `ready()` enables and focuses the terminal. Initialization errors replace the spinner with a terminal-style error rather than leaving an endless loader.

## Themes and variants

Presentation colors belong to PromptKit. The host declares a default palette plus any named variants in the manifest and then selects a variant through bootstrap snapshots, command responses, actions, public updates or SSE events.

```json
{
  "theme": {
    "default": {
      "accent": "#8b949e",
      "accentMuted": "#5c636b"
    },
    "variants": {
      "active": {
        "accent": "#58d6a8",
        "accentMuted": "#4a9781"
      },
      "warning": {
        "accent": "#e8973a",
        "accentMuted": "#ab7a44"
      }
    }
  }
}
```

Then a response can say:

```json
{
  "ok": true,
  "blocks": [],
  "themeVariant": "warning"
}
```

`themeVariant` omitted keeps the current selection, a string selects that variant, and `null` returns to the default theme. Unknown variant names fall back safely to the default. PromptKit does not infer theme from application state.

## Actions

PromptKit exposes a generic action registry so interactions do not need one-off APIs such as `onDrop`, `onIndicatorClick`, or host-specific upload hooks. The manifest declares presentation triggers while the host supplies the implementation for each action id.

```json
{
  "actions": [
    {
      "id": "import-data",
      "label": "import data",
      "tone": "special",
      "triggers": [
        {
          "type": "drop",
          "accept": [".json", "application/json"],
          "multiple": false
        }
      ],
      "feedback": {
        "before": {
          "blocks": [
            {
              "type": "text",
              "text": "importing {{files[0].name}}...",
              "tone": "secondary"
            }
          ]
        }
      }
    }
  ]
}
```

The host registers only the behavior:

```ts
const kit = new PromptKit({
  root,
  actions: {
    "import-data": async ({ files }) => {
      await importData(files[0]);
      return {
        blocks: [{ type: "text", text: "imported", tone: "success" }],
      };
    },
  },
});
```

An action handler returns `PromptKitActionResult | undefined`; `undefined` means that the action has no UI response. A present result is validated at runtime as well as by TypeScript.

`runAction(id, payload?)` invokes the same registry manually. Drop is the first declarative trigger; additional trigger kinds can be added without growing the main PromptKit constructor with interaction-specific callbacks.

If more than one action accepts the same drop, PromptKit renders a terminal-style chooser instead of inferring host semantics. Chooser wording, no-match feedback and action feedback can be declared in the manifest without browser callbacks.

## Indicators

Indicators are generic, replaceable pieces of terminal status presentation. They are not tied to any application-specific concept such as recording, connectivity, or synchronization.

```json
{
  "indicators": [
    {
      "id": "sync",
      "label": "sync",
      "tone": "info",
      "active": true,
      "pulse": true,
      "action": "open-sync"
    }
  ]
}
```

A bootstrap snapshot, command response, action result, public update or SSE event containing `indicators` replaces the complete visible indicator set. `active: false` hides an indicator. If its `action` id has a registered host handler, the indicator is rendered as an interactive control and invokes that generic action.

## Responsibilities

### PromptKit owns

- terminal layout and responsive behavior;
- loading, ready and failed lifecycle presentation;
- prompt input;
- command history;
- command completion;
- focus behavior;
- mobile `visualViewport` handling;
- rendering typed blocks;
- smart scrolling;
- theme tokens and dynamic variants;
- optional initial bootstrap application;
- action triggers and interaction presentation;
- indicator presentation and optional indicator actions;
- optional SSE events;
- client-side accessibility and keyboard behavior.

### The host application owns

- commands and their semantics;
- authentication and authorization;
- business logic;
- persistence;
- application state;
- which commands are advertised;
- which bootstrap snapshot is returned;
- which actions are implemented and what they do;
- which indicators and theme variant should be active;
- when host initialization is complete and `ready()` can be called;
- which events are emitted.

## Interaction behavior

PromptKit intentionally behaves like a terminal rather than a regular web form:

- clicking a non-interactive area of the document focuses the command prompt;
- selecting text or clicking buttons/links does not steal focus;
- command input remains available while requests are in flight;
- leading and trailing spaces are preserved when a non-blank command is sent;
- completion refreshes when text changes or the caret moves;
- browser autocorrection, autocapitalization and spellchecking are disabled;
- mobile viewport changes keep the active input row visible.

For embedded surfaces that should not claim document-wide focus, use:

```ts
new PromptKit({ root, focusScope: "screen" });
```

## Reference demo

The repository includes a zero-dependency Node reference backend that exercises the public presentation capabilities that can be meaningfully demonstrated interactively: bootstrap, every block type, semantic tones, theme variants, state, manual and automatic downloads, keyed replacement, clear semantics, successful and unsuccessful responses, actions, declarative action feedback, the multi-action drop chooser, indicators and SSE events.

```bash
npm install
npm run demo
```

Then open `http://127.0.0.1:4173` and try:

```text
/help
/status
/table
/code
/progress
/download
/download-auto
/link
/separator
/replace
/indicators
/tones
/theme cool
/theme warm
/theme default
/clear
/error
```

Run `/replace` more than once to see a stable keyed block update in place. `/indicators` demonstrates pulsing, hidden and actionable indicators. Drop a JSON file onto the terminal to open a chooser between matching generic actions and exercise declarative action feedback.

The local demo uses the real HTTP manifest, bootstrap, command and SSE endpoints. Its first SSE frame includes a keyed replacement block so live-update behavior is immediately visible without waiting for the periodic heartbeat.

`examples/demo/` is the shared source for both the local reference demo and the GitHub Pages shell. GitHub Pages uses the same `index.html` and `demo.js` with immutable `dist/` assets downloaded from the selected GitHub Release. Features requiring a live backend, such as SSE transport itself, are demonstrated by the local server; the Pages shell demonstrates the same static rendering and update semantics with its release-pinned client.

The demo is intentionally application-neutral. It is the reference integration used to evolve PromptKit without requiring an external consumer to be running.

## Quality gates

```bash
npm run verify
```

The gate runs strict TypeScript checking, tests with coverage thresholds, the production build, browser-bundle smoke validation and a reference-demo smoke test. The demo smoke verifies its manifest/bootstrap contract and representative payloads for every advertised demo capability. Global statement, branch, function and line coverage are each required to remain at or above 95%. Canonical payloads are kept as compatibility fixtures under `tests/compatibility.test.ts`.

Project-wide compatibility and demo-completeness rules live in `AGENTS.md`: breaking changes must never be introduced silently, and public capabilities that can be meaningfully demonstrated must stay represented in the reference demo.

## Versioned releases

Normal pushes and pull requests only run verification. They never publish PromptKit.

A GitHub Release is created only when an explicit semantic-version tag is pushed:

```text
v0.1.0
v0.1.1
v0.2.0
v1.0.0
```

The release workflow:

1. verifies that the tag version exactly matches `package.json`;
2. runs the full `npm run verify` gate;
3. publishes `@matt3010/promptkit` to GitHub Packages;
4. builds the production `dist/` directory;
5. packages `dist/`, `README.md`, `LICENSE` and protocol docs into `.zip` and `.tar.gz` archives;
6. creates SHA-256 checksums;
7. creates the GitHub Release and attaches the versioned artifacts;
8. dispatches the GitHub Pages workflow for the published tag.

Publishing is deliberately the *only* way a version reaches the registry: pushing a tag is the whole release action, and nothing publishes from a branch, a manual dispatch, or a developer's machine. It runs after the verification gate, because a published version cannot be replaced. Re-running a tag whose version is already published is a no-op rather than a failure.

No registry secret is stored: the workflow publishes with its own `GITHUB_TOKEN` and `packages: write`.

This keeps consumers pinned to an immutable PromptKit release rather than `master`.

## Installing

PromptKit is published to **GitHub Packages**, which requires authentication even for a public package. A consumer needs an `.npmrc` pointing the scope at the registry:

```ini
@matt3010:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`GITHUB_TOKEN` here is any personal access token with the `read:packages` scope — in CI, the workflow's own token. Then:

```bash
npm install @matt3010/promptkit
```

```ts
import { PromptKit } from "@matt3010/promptkit";
```

A host that serves static files can serve the bundle and stylesheet straight out of the installed package instead of mirroring the module graph:

```text
node_modules/@matt3010/promptkit/dist/promptkit.browser.js
node_modules/@matt3010/promptkit/dist/styles.css
```

Applications may also vendor the release archive at build time and serve its static assets without requiring Node at runtime — that path needs no registry credentials at all.

## Server-backed actions

The minimal initialization remains unchanged:

```js
const kit = new PromptKit({ root });
await kit.start();
kit.ready();
```

For application operations that belong on the backend, declare a remote action in the manifest instead of writing repeated browser transport glue:

```json
{
  "id": "import-config",
  "triggers": [{ "type": "drop", "accept": [".json"] }],
  "remote": { "url": "/tui/actions/import-config" }
}
```

PromptKit sends remote actions with POST, transports dropped files as multipart data, validates the returned `PromptKitActionResult`, and applies it through the normal update pipeline. Mutating actions are never retried automatically. See `docs/actions.md` for the wire shape and error semantics.

The local HTTP demo exercises the real remote transport. The static GitHub Pages demo cannot provide a server-backed POST endpoint, so that transport-specific part is intentionally local-only.
