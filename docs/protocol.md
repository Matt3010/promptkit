# PromptKit protocol v1

PromptKit is a presentation client. A host application implements a small HTTP contract and keeps complete ownership of authentication, command parsing, business logic and persistence.

## `GET /tui/manifest`

Returns terminal metadata.

```json
{
  "name": "relay",
  "subtitle": "/help for commands",
  "prompt": ">",
  "commands": ["/apps", "/collections", "/status", "/help"],
  "events": { "url": "/tui/events" },
  "theme": {
    "accent": "#58d6a8",
    "accentMuted": "#4a9781"
  }
}
```

Only `name` is required. `commands` drive client-side completion; they do not authorize or implement commands.

## `POST /tui/command`

Request:

```json
{
  "input": "/status"
}
```

Response:

```json
{
  "ok": true,
  "blocks": [
    { "type": "status", "label": "database", "value": "healthy", "tone": "success" }
  ],
  "state": {
    "mode": "production"
  }
}
```

The backend chooses the blocks. The client does not infer tables, errors or downloads by inspecting text.

An unsuccessful command may still return HTTP 200 with `ok: false` when the command was parsed and deliberately rejected. Transport/authentication/protocol failures should use the appropriate non-2xx HTTP status.

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

### Code

```json
{
  "type": "code",
  "language": "json",
  "code": "{\"enabled\":true}"
}
```

PromptKit does not perform syntax highlighting in v1; `language` is metadata available to consumers and future renderers.

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

`state` is a flat map of primitive values. PromptKit reflects it as `data-*` attributes on the root element. This lets an application theme or decorate terminal states without teaching PromptKit their meaning.

Example:

```json
{
  "state": {
    "mode": "livetest",
    "recording": true
  }
}
```

can result in root attributes equivalent to:

```html
<div class="promptkit" data-mode="livetest" data-recording="true"></div>
```

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
  }
}
```

An event may contain blocks, state, or both. Malformed SSE payloads are ignored rather than breaking the terminal.

## Versioning rule

The v1 wire contract is intentionally small. Breaking changes require a protocol version bump; additive optional fields and new block types may be introduced without changing existing semantics. Clients must fail safely on malformed known structures and must never derive business behavior from display text.
