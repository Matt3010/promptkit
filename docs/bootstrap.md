# Bootstrap snapshot

Hosts may declare `bootstrap: { "url": "/tui/bootstrap" }` in the manifest. `PromptKit.start()` performs an idempotent GET, applies the returned `blocks`, `state`, `themeVariant`, `indicators` and `clear`, then opens SSE. This ordering prevents an older initial snapshot from overwriting a newer live event. The field is optional, so existing hosts remain compatible. PromptKit does not retry POST commands as bootstrap because commands may be non-idempotent.
