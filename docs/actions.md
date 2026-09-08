# Actions

PromptKit actions are declared by the manifest and implemented by host handlers. Presentation feedback stays declarative so integrating an action does not require extra UI callbacks.

## Minimal integration

A consumer should only implement application behavior:

```ts
const kit = new PromptKit({
  root: document.querySelector("#app"),
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

The manifest owns labels, triggers and optional presentation feedback. The consumer does not need to wire chooser text, drop echoes or error rendering callbacks.

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

No response is valid. Any response that is present must satisfy `PromptKitActionResult`. PromptKit validates present results at runtime too, so JavaScript consumers receive the same protection against malformed responses.

## Declarative feedback

An action may declare `feedback.before` and `feedback.error`. Each one is a normal `PromptKitSnapshot`, so the host can use PromptKit blocks without writing presentation code in the browser:

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
  "feedback": {
    "before": {
      "blocks": [
        {
          "type": "text",
          "text": "importing {{files[0].name}}...",
          "tone": "secondary"
        }
      ]
    },
    "error": {
      "blocks": [
        {
          "type": "text",
          "text": "import failed: {{error.message}}",
          "tone": "danger"
        }
      ]
    }
  }
}
```

Feedback is optional. If it is absent, PromptKit does not invent an action-specific echo. Handler errors still have a generic safe fallback.

## Migrating from 0.7

PromptKit 0.8 intentionally removes the 0.7 `echo: { "type": "drop-files" }` action field. This breaking change is deliberate: the old field forced PromptKit to own application wording and only worked for one drop-specific presentation.

Replace it with declarative `feedback.before`:

```json
{
  "feedback": {
    "before": {
      "blocks": [
        {
          "type": "text",
          "text": "file: {{files[0].name}}",
          "tone": "secondary"
        }
      ]
    }
  }
}
```

The browser handler does not change. `undefined` remains the explicit no-response value; any present handler result must satisfy `PromptKitActionResult`.

## Template context

PromptKit resolves only a small, validated set of placeholders:

```text
{{action.id}}
{{action.label}}
{{files.count}}
{{files[0].name}}
{{files[0].type}}
{{files[0].size}}
{{indicator.id}}
{{indicator.label}}
{{payload}}
{{error.message}}
```

File indexes may be any non-negative integer. Unknown or malformed placeholders make the manifest invalid instead of leaking `undefined` into the UI. A supported placeholder whose context is not available for the current trigger resolves to an empty string.

The action-context mapping is exhaustive in TypeScript. Adding a new trigger type requires the PromptKit implementation to handle its template context before the build can pass.

## Generic action UI

The manifest may customize chooser and no-match presentation once for all actions:

```json
{
  "actionUi": {
    "chooserLabel": "choose what to do with {{files.count}} files",
    "noMatch": {
      "blocks": [
        {
          "type": "text",
          "text": "unsupported file: {{files[0].name}}",
          "tone": "warning"
        }
      ]
    }
  }
}
```

If `chooserLabel` is omitted, PromptKit uses only the selected filenames, which is language-neutral. If `noMatch` is omitted, PromptKit shows a generic warning. Applications that care about wording or localization can override it without adding browser callbacks.

## Remote actions

An action may be implemented by the browser host through the existing `actions` registry or declared as server-backed in the manifest:

```json
{
  "id": "import-config",
  "triggers": [{ "type": "drop", "accept": [".json"], "multiple": false }],
  "remote": { "url": "/tui/actions/import-config" }
}
```

Remote actions always use `POST`; the manifest intentionally has no HTTP-method field. PromptKit does not retry them automatically because actions may have side effects. A future transport extension can be added without changing this default.

For `manual` and `indicator` contexts PromptKit sends JSON containing `action`, `trigger`, and the relevant `payload` or `indicator`. Drop contexts use `multipart/form-data` with `action`, `trigger`, and repeated `files` fields containing the original browser `File` objects. PromptKit does not read or interpret file contents.

A successful response must be a valid `PromptKitActionResult`. `204 No Content` is the explicit no-result response and maps to `undefined`. Invalid JSON or an invalid result is a protocol error and flows through the normal declarative `feedback.error` path.

An action id cannot be both locally implemented and remote. PromptKit rejects that ambiguous configuration instead of applying hidden precedence.
