# Browser bundle

PromptKit keeps its existing modular ESM build and also publishes a self-contained browser ESM entry point.

After `npm run build`, `dist/` contains both:

- `index.js` plus the existing module graph for bundlers and modular consumers;
- `promptkit.browser.js`, a single JavaScript module with the same runtime exports bundled into one file;
- `styles.css`, kept separate so applications can serve or cache presentation styles independently.

## Direct browser usage

A host that serves static files can expose only the browser bundle and stylesheet instead of mirroring PromptKit's internal module graph:

```html
<link rel="stylesheet" href="/promptkit/styles.css">
<script type="module">
  import { PromptKit } from "/promptkit/promptkit.browser.js";

  const kit = new PromptKit({
    root: document.getElementById("terminal"),
  });

  await kit.start();
  kit.ready();
</script>
```

The bundle is standard ESM: it does not install globals and it does not change the existing package entry point.

Package consumers may also use the additive `@matt3010/promptkit/browser` export. Its TypeScript declarations are the same public declarations as the normal package entry point.

## Compatibility

The browser bundle is an additional distribution format. Existing imports from `@matt3010/promptkit`, existing `dist/*.js` modules, `styles.css`, and the PromptKit wire protocol keep their current behavior.

The verification gate runs `scripts/smoke-browser-bundle.mjs` after building. The smoke check rejects a browser bundle that still contains relative ESM imports and verifies that all public runtime exports remain available.
