# PromptKit protocol

PromptKit is a presentation client. A host application implements a small HTTP contract and keeps complete ownership of authentication, command parsing, business logic and persistence.

The wire protocol is deliberately versionless. Compatibility is tied to the PromptKit release a consumer pins; the manifest does not duplicate that with a protocol-version field.

## `GET /tui/manifest`

Returns terminal metadata.

```json
{
  "name": "example-app",
  "subtitle": "/help for commands",
  "prompt": ">",
  "commands": ["/status", "/list", "/help"],
  "events": { "url": "/tui/events" },
  "theme": {
    "default": {
      "accent": "#8b949e",
      "accentMuted": "#5c636b",
      "background": "#0d1117",
      "foreground": "#c9d1d9"
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
  },
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

Only `name` is required. `commands` drive client-side completion; they do not authorize or implement commands. `theme.default` defines the base palette, while `theme.variants` declares named visual variants. PromptKit does not attach business meaning to variant names.

`actions` declares presentation-level ways to trigger host actions. The action implementation itself is registered by the host in the PromptKit constructor and is not part of the wire protocol.

### Action definitions

Each action definition has:

- `id`: required stable action identifier;
- `label`: optional user-facing label;
- `tone`: optional semantic tone;
- `triggers`: optional list of supported triggers.

The first supported trigger is `drop`:

```json
{
  "type": "drop",
  "accept": [".json", "application/json", "image/*"],
  "multiple": false
}
```

`accept` entries can be file extensions, exact MIME types, MIME wildcards, or exact filenames. An omitted or empty `accept` accepts any file. `multiple` defaults to `false`.

PromptKit only offers an action if its `id` has a registered host handler. When one drop action matches, it runs directly. When several match, PromptKit renders a terminal-style chooser. If none match, PromptKit renders a generic warning.

## `POST /tui/command`

Request:

```json
{
  "input": "/status"
}
```

PromptKit preserves the command string exactly as entered, except that blank input is ignored.

Response:

```json
{
  "ok": true,
  "blocks": [
    { "type": "status", "label": "database", "value": "healthy", "tone": "success" }
  ],
  "state": {
    "mode": "production"
  },
  "themeVariant": "active",
  "indicators": [
    { "id": "connected", "label": "connected", "tone": "success" }
  ]
}
```

The backend chooses the blocks. The client does not infer tables, errors or downloads by inspecting text.

`themeVariant` is optional:

- omitted: keep the current variant;
- a string: apply that named variant over the default theme;
- `null`: return to the default theme;
- an unknown string: safely fall back to the default theme.

`indicators` is also optional. When present it replaces the complete current indicator set. Each indicator has a required `id` and `label`, plus optional `tone`, `active`, `pulse` and `action` fields.

```json
{
  "id": "sync",
  "label": "sync",
  "tone": "info",
  "active": true,
  "pulse": true,
  "action": "toggle-sync"
}
```

`active: false` omits the indicator. `pulse: true` uses the standard PromptKit activity animation. `action` optionally links the indicator to a host action id; it is interactive only when the host registered a handler for that id.

An unsuccessful command may still return HTTP 200 with `ok: false` when the command was parsed and deliberately rejected. Transport, authentication and malformed-protocol failures should use the appropriate non-2xx HTTP status.

## Blocks

### Text

```json
{ "type": "text", "text": "completed", "tone": "success" }
```

### Table

```json
{
  "type": "table",
  "columns": ["Name", "Records"],
  "rows": [["users", "1200"], ["sessions", "86"]]
}
```

A row containing a single cell spans the full table width, which is useful for section labels and messages mixed with tabular rows.

### Code

```json
{
  "type": "code",
  "language": "json",
  "code": "{\"enabled\":true}"
}
```

`language` is metadata available to consumers and future renderers; PromptKit does not require syntax highlighting.

### Status

```json
{ "type": "status", "label": "database", "value": "healthy", "tone": "success" }
```

### Progress

```json
{ "type": "progress", "label": "import", "value": 42, "max": 100 }
```

### Download

```json
{
  "type": "download",
  "label": "Download configuration",
  "filename": "config.json",
  "mediaType": "application/json",
  "content": "{}"
}
```

### Separator

```json
{ "type": "separator" }
```

## Tones

Supported semantic tones:

```text
primary
secondary
success
warning
danger
info
special
```

Tones describe meaning; applications should not rely on a specific color.

## State

`state` is a flat map of primitive values. PromptKit reflects it as `data-*` attributes on the root element. State remains application data; PromptKit never interprets a key such as `mode` as a styling instruction.

Example:

```json
{
  "state": {
    "mode": "active",
    "recording": true
  }
}
```

can result in root attributes equivalent to:

```html
<div class="promptkit" data-mode="active" data-recording="true"></div>
```

Theme selection is explicitly separate through `themeVariant`. Indicators are also explicitly separate presentation state and are not inferred from application-state keys.

## Action results

Host action handlers may return a presentation update using the same optional presentation fields as other PromptKit updates:

```json
{
  "blocks": [{ "type": "text", "text": "import complete", "tone": "success" }],
  "state": { "imported": true },
  "themeVariant": "active",
  "indicators": [{ "id": "ready", "label": "ready", "tone": "success" }],
  "clear": false
}
```

Action results are host-side return values, not HTTP responses. PromptKit applies them through the same presentation pipeline used for commands and events.

## `GET /tui/events` (optional)

If `manifest.events.url` is present, PromptKit opens an SSE connection to that URL. Each `data:` payload is a JSON `PromptKitEvent`:

```json
{
  "id": "evt-1042",
  "blocks": [
    { "type": "status", "label": "worker", "value": "idle" }
  ],
  "state": {
    "worker": "idle"
  },
  "themeVariant": "active",
  "indicators": [
    { "id": "worker", "label": "idle", "tone": "secondary" }
  ]
}
```

An event may contain blocks, state, a theme variant, indicators, `clear`, or any combination of them. Malformed SSE payloads are ignored rather than breaking the terminal.

## Compatibility rule

The wire contract is intentionally small and versionless. Prefer additive optional fields and independently renderable block types. If a release intentionally invalidates a previously accepted payload, that is a breaking PromptKit release and must be explicitly communicated with a migration path before implementation.
