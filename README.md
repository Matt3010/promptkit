# PromptKit

PromptKit is a backend-agnostic web terminal UI for applications that want a small, command-driven interface without adopting a frontend framework.

It is extracted from the interaction model used by Scatto: a responsive terminal rendered in the browser, with command history, completion, structured output and optional live events. PromptKit owns presentation only. The host application owns commands, authentication and business logic.

## Goals

- One reusable terminal UI for different backends and languages.
- No application-specific commands in the client.
- No frontend framework dependency.
- Mobile-friendly, keyboard-friendly and accessible by default.
- Structured rendering instead of parsing presentation hints from plain text.
- A small HTTP protocol that can be implemented by Python, TypeScript, Go or any other backend.
- Optional realtime events without making realtime mandatory.

## Protocol

A host exposes three conceptual endpoints:

```text
GET  /tui/manifest
POST /tui/command
GET  /tui/events      # optional SSE endpoint
```

The manifest describes the terminal rather than its business logic:

```json
{
  "name": "scatto",
  "prompt": ">",
  "commands": ["/start", "/stop", "/history", "/help"]
}
```

A command request is deliberately small:

```json
{
  "input": "/history"
}
```

The response is a list of typed blocks:

```json
{
  "ok": true,
  "blocks": [
    { "type": "text", "text": "Runs" },
    {
      "type": "table",
      "columns": ["Id", "Status"],
      "rows": [["42", "completed"], ["43", "running"]]
    }
  ]
}
```

PromptKit renders the blocks. It never needs to know what `/history`, `completed` or a Scatto run means.

## Initial block types

- `text`
- `table`
- `code`
- `status`
- `progress`
- `download`
- `separator`

The protocol is intentionally extensible: unknown block types are ignored safely instead of breaking the terminal.

## Responsibilities

### PromptKit owns

- terminal layout and responsive behavior;
- prompt input;
- command history;
- command completion;
- rendering typed blocks;
- smart scrolling;
- theme tokens;
- optional SSE events;
- client-side accessibility and keyboard behavior.

### The host application owns

- commands and their semantics;
- authentication and authorization;
- business logic;
- persistence;
- application state;
- which commands are advertised;
- which events are emitted.

## Planned consumers

- **Scatto**: migrate the current embedded browser console to PromptKit.
- **Relay**: use PromptKit as its administrative interface from the beginning.

## Status

Early foundation. The protocol and public API are being defined before Scatto is migrated.
