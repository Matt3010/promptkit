# Actions

PromptKit actions are declared by the manifest and implemented by host handlers.

## Typed results

An action handler may either return a `PromptKitActionResult` or return `undefined` when the action has no UI update to apply.

```ts
const handlers: Record<string, PromptKitActionHandler> = {
  "refresh": async () => ({
    blocks: [{ type: "text", text: "refreshed", tone: "success" }],
  }),
  "fire-and-forget": async () => undefined,
};
```

The public handler contract deliberately uses `undefined`, not `void`:

```ts
(context: PromptKitActionContext) =>
  | PromptKitActionResult
  | undefined
  | Promise<PromptKitActionResult | undefined>
```

This means that no response is valid, while any response that is present must satisfy the typed `PromptKitActionResult` contract. PromptKit also validates present action results at runtime before applying them, so JavaScript consumers receive the same protection against malformed responses.

## Optional action echo

An action can opt into terminal feedback before its handler runs. The first echo mode is `drop-files`:

```json
{
  "id": "import-config",
  "label": "import config",
  "triggers": [
    {
      "type": "drop",
      "accept": [".json", "application/json"],
      "multiple": false
    }
  ],
  "echo": {
    "type": "drop-files",
    "tone": "secondary"
  }
}
```

For a single dropped file PromptKit emits a text block such as:

```text
file: config.json
```

For multiple files it emits all names in one text block. Echo is opt-in: actions without `echo` retain their previous behavior. When several drop actions match, the chooser is shown first and the echo is emitted only for the action the user actually selects.

The echo belongs to presentation. The host handler still owns the action semantics and may return a typed result or `undefined`.
