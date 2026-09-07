# PromptKit

PromptKit is a backend-agnostic web terminal UI for applications that want a small, command-driven interface without adopting a frontend framework.

It provides a responsive terminal rendered in the browser, with command history, completion, structured output, lifecycle handling, dynamic theme variants, generic actions, status indicators and optional live events. PromptKit owns presentation only. The host application owns commands, authentication and business logic.

## Goals

- One reusable terminal UI for different backends and languages.
- No application-specific commands in the client.
- No frontend framework dependency.
- Mobile-friendly, keyboard-friendly and accessible by default.
- Structured rendering instead of parsing presentation hints from plain text.
- Generic interaction primitives without embedding application semantics.
- A small HTTP protocol that can be implemented by Python, TypeScript, Go or any other backend.
- Optional realtime events without making realtime mandatory.
- Explicit compatibility rules for public API and wire-format changes.

## Protocol

A host exposes three conceptual endpoints:

```text
GET  /tui/manifest
POST /tui/command
GET  /tui/events      # optional SSE endpoint
```

The protocol is deliberately versionless. Consumers pin a PromptKit release; the manifest does not repeat the package version with a separate protocol-version field.

The manifest describes the terminal rather than its business logic:

```json
{
  "name": "example-app",
  "prompt": ">",
  "commands": ["/status", "/list", "/help"],
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
  },
  "actions": [
    {
      "id": "import-data",
      "label": "import data",
      "tone": "special",
      "triggers": [
        { "type": "drop", "accept": [".json", ".csv"] }
      ]
    }
  ]
}
```

A command request is deliberately small:

```json
{
  "input": "/list"
}
```

PromptKit preserves non-blank command input exactly as entered.

The response is a list of typed blocks and may switch the active visual variant or replace the current indicators:

```json
{
  "ok": true,
  "themeVariant": "active",
  "indicators": [
    { "id": "connected", "label": "connected", "tone": "success" }
  ],
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
- `separator`

Unknown block types are rejected by the protocol validator. New types require an explicit compatibility strategy.

## Lifecycle

PromptKit owns the terminal startup experience. Construction immediately renders a terminal-style loading state; `start()` loads PromptKit metadata and optional events but deliberately leaves the terminal unavailable until the host finishes its own initialization.

```ts
const kit = new PromptKit({
  root,
  loading: {
    label: "example-app",
    text: "starting",
  },
});

try {
  await kit.start();
  await initializeHostState();
  kit.ready();
} catch {
  // start() already moves PromptKit into the failed lifecycle state.
}
```

Lifecycle states are `loading`, `ready` and `failed`, exposed as `data-phase` on the PromptKit root. `ready()` enables and focuses the terminal. Initialization errors replace the spinner with a terminal-style error rather than leaving an endless loader.

## Themes and variants

Presentation colors belong to PromptKit. The host declares a default palette plus any named variants in the manifest and then selects a variant through command responses or SSE events.

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

Actions are generic host-side behaviors identified by an id. PromptKit owns how an action is triggered and presented; the host owns what the action actually does.

The host registers implementations when constructing PromptKit:

```ts
const kit = new PromptKit({
  root,
  actions: {
    "import-data": async ({ trigger, files }) => {
      if (trigger !== "drop") return;
      const result = await importFiles(files);
      return {
        blocks: [{ type: "text", text: result.message, tone: "success" }],
      };
    },
  },
});
```

The manifest can then declare triggers for that action:

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
          "accept": [".json", "text/csv"],
          "multiple": true
        }
      ]
    }
  ]
}
```

For drop triggers, PromptKit owns drag feedback, file matching and routing. If exactly one action matches, it runs directly. If multiple actions match the same files, PromptKit renders a terminal-style chooser. A definition without a registered host handler is never offered as an executable action.

Actions can also be invoked manually through `kit.runAction(id, payload?)`. An action result may contain the same presentation fields used by live updates: `blocks`, `state`, `themeVariant`, `indicators` and `clear`.

## Indicators

Indicators are generic status badges rendered by PromptKit. Responses, events and action results replace the complete indicator set.

```json
{
  "indicators": [
    {
      "id": "sync",
      "label": "sync",
      "tone": "success",
      "pulse": true,
      "active": true,
      "action": "toggle-sync"
    }
  ]
}
```

`active: false` omits an indicator. `pulse: true` requests the standard PromptKit activity animation. `action` is optional; when it names a registered host action, the indicator becomes clickable and invokes that same action registry. Without a matching handler it remains a non-interactive status indicator.

Indicator ids and labels carry no built-in business meaning. PromptKit does not know whether an indicator represents recording, connectivity, synchronization, environment or anything else.

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
- generic action trigger presentation and routing;
- drag-and-drop feedback and action selection;
- generic status indicators;
- optional SSE events;
- client-side accessibility and keyboard behavior.

### The host application owns

- commands and their semantics;
- authentication and authorization;
- business logic;
- persistence;
- application state;
- which commands are advertised;
- action implementations;
- which actions are declared and when they are applicable;
- which indicators are active;
- which theme variant should be active;
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

The repository includes a zero-dependency Node reference backend that exercises every block type, theme variants and SSE events.

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
/theme cool
/theme warm
/theme default
/error
```

The demo is intentionally application-neutral. It is the reference integration used to evolve PromptKit without requiring an external consumer to be running.

## Quality gates

```bash
npm run verify
```

The gate runs strict TypeScript checking, tests with coverage thresholds, the production build, and a reference-demo smoke test. Global statement, line, function and branch coverage must each remain at or above 95%. Canonical payloads are kept as compatibility fixtures under `tests/compatibility.test.ts`.

Project-wide compatibility rules live in `AGENTS.md`: breaking changes must never be introduced silently and must be communicated before implementation when unavoidable.

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
3. builds the production `dist/` directory;
4. packages `dist/`, `README.md`, `LICENSE` and protocol docs into `.zip` and `.tar.gz` archives;
5. creates SHA-256 checksums;
6. creates the GitHub Release and attaches the versioned artifacts.

This keeps consumers pinned to an immutable PromptKit release rather than `master`. Applications can vendor the release archive at build/package time and serve its static assets without requiring Node at runtime, or consume the package interface directly when appropriate.
