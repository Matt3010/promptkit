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
- Backward-compatible evolution within a protocol major version.

## Protocol V1

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

## V1 block types

- `text`
- `table`
- `code`
- `status`
- `progress`
- `download`
- `separator`

Unknown block types are rejected by the V1 protocol validator. New block types can be introduced additively in future protocol revisions only with an explicit compatibility strategy for existing clients.

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

## Reference demo

The repository includes a zero-dependency Node reference backend that implements the PromptKit protocol and exercises every initial block type plus SSE events.

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
/error
```

The demo is intentionally application-neutral. It is the reference integration used to evolve PromptKit without requiring Scatto or Relay to be running.

## Quality gates

```bash
npm run verify
```

The gate runs strict TypeScript checking, tests with coverage thresholds, and the production build. Canonical V1 payloads are also kept as compatibility fixtures under `tests/compatibility-v1.test.ts`.

Project-wide compatibility rules live in `AGENTS.md`: breaking changes must never be introduced silently and must be communicated before implementation when unavoidable.

## Planned consumers

- **Scatto**: migrate the current embedded browser console to PromptKit without changing user-visible behavior.
- **Relay**: use PromptKit as its administrative interface from the beginning.

## Status

V1 foundation: protocol, client, renderer, terminal controller, compatibility fixtures, reference demo and CI quality gates are in place. Scatto migration is the next integration milestone after the foundation is green.
