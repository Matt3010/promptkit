# PromptKit project instructions

These rules apply to every change in this repository.

## Compatibility first

PromptKit is intended to be reused by multiple applications. Backward compatibility is therefore a product requirement, not an implementation detail.

### Never introduce breaking changes silently

Do **not** make a change that breaks an existing public API, protocol contract, supported integration, documented behavior, CSS contract, package export, or previously valid consumer payload.

This includes, but is not limited to:

- removing or renaming exported TypeScript symbols;
- removing or renaming package exports or distributed assets;
- changing existing function or constructor signatures incompatibly;
- making previously optional fields required;
- removing accepted protocol fields, block types, tones, or behaviors;
- changing the meaning of an existing protocol field;
- changing endpoint semantics in a way that makes an existing adapter stop working;
- changing CSS classes, custom properties, `data-*` state behavior, or DOM contracts relied upon by consumers;
- changing defaults when that would alter existing consumer behavior;
- changing wire formats incompatibly;
- changing persistence or migration behavior in a way that invalidates existing data or integrations.

Prefer additive evolution:

- add optional fields instead of replacing existing ones;
- add new block types without changing old ones;
- add overloads or new APIs instead of modifying existing contracts;
- deprecate before removal;
- preserve old behavior while introducing the new behavior alongside it;
- provide adapters or compatibility layers when a design needs to evolve.

## If a breaking change is genuinely necessary

Do **not** implement it as an ordinary change.

Before proceeding, explicitly communicate that the proposed change is breaking and explain:

1. what existing contract or behavior would break;
2. which consumers or integrations are affected;
3. why the change cannot reasonably be implemented additively;
4. the migration path for existing consumers;
5. whether a package major/minor release boundary is required for the current pre-1.0 API;
6. whether a compatibility period or deprecation phase can be provided.

A breaking change must be a deliberate, visible decision. Never hide one inside a refactor, cleanup, dependency update, protocol adjustment, or UI rewrite.

## Protocol evolution

The PromptKit wire protocol is deliberately versionless. Do not add a protocol-version field merely to mirror the package version.

Compatibility is governed by the PromptKit release that a consumer pins. Within a compatible release line, prefer additive optional fields and new independently renderable block types that older consumers can safely ignore. Any change that makes a previously valid request or response invalid is a breaking protocol change and must follow the breaking-change process above.

## Consumer ergonomics

PromptKit must remain simple to initialize and integrate.

The minimal happy path should stay conceptually close to:

```ts
const kit = new PromptKit({ root });

await kit.start();
kit.ready();
```

Do not require consumer-side callbacks or imperative glue for behavior that can reasonably be expressed declaratively through the manifest or protocol.

Consumer callbacks should be reserved for genuine application-specific logic, not for standard PromptKit presentation, transport, feedback, chooser labels, formatting, or lifecycle orchestration.

When introducing a public feature, evaluate its integration cost as part of the API design. Prefer a slightly more capable declarative contract over forcing every consumer to repeat the same glue code.

## Library and host responsibility boundary

PromptKit owns generic UI and interaction mechanics. Applications own domain semantics.

PromptKit may own:

- rendering and layout;
- lifecycle;
- bootstrap and live-update transport;
- generic actions and action transport;
- generic feedback and template resolution;
- indicators and themes;
- accessibility and keyboard behavior;
- browser packaging.

PromptKit must not absorb application-specific:

- business rules;
- persistence semantics;
- command meanings;
- domain-state meanings;
- application-specific wording or labels when they can be supplied by the host.

Do not hardcode consumer-specific text such as application wording around filenames, domain errors, or localized business messages in the core. Prefer declarative manifest-provided presentation.

## Public contract typing and runtime validation

Public PromptKit contracts must be explicit and strongly typed.

When an API may intentionally produce no result, prefer an explicit union such as:

```ts
PromptKitActionResult | undefined
```

over `void` when `void` would make accidental return values type-compatible.

Data crossing a network or other untyped runtime boundary must not be trusted only because an equivalent TypeScript type exists. Validate manifests, snapshots, action results, live events, and other wire payloads at runtime before applying them.

When adding a new protocol field, update its TypeScript type, runtime validator, tests, demo where applicable, and documentation together.

## Mutating transport safety

Never transparently retry a mutating or potentially non-idempotent operation unless the public contract explicitly guarantees idempotency.

In particular, generic `POST`, `PUT`, `PATCH`, or `DELETE` commands and actions must not gain automatic retry behavior merely for convenience.

Retries for idempotent reads such as bootstrap may be considered separately, but their semantics must remain explicit and tested.

## Tests

Compatibility behavior should be protected by tests whenever practical. When fixing or extending an existing public contract, add a regression test that demonstrates the previous valid behavior still works.

Do not update tests merely to make an incompatible implementation pass unless the breaking change has first been explicitly identified and approved.

## Quality gates

Never lower an existing coverage threshold, typecheck requirement, smoke test, validation scope, or other quality gate merely to make a change pass.

If new logic reduces coverage or exposes a failing branch, add meaningful tests or correct the implementation instead of weakening the gate.

Temporary migration scripts or GitHub Actions workflows may be used when needed, but they must not be merged into the default branch unless they are intended to become permanent project infrastructure.

## Distribution parity

A public browser feature is not complete until it is available through the supported browser distribution, not only through source modules.

Changes to public browser-facing behavior must keep package exports, browser bundle, distributed assets, smoke tests, demo, and documentation aligned.

Do not treat a locally built consumer copy as proof that a released PromptKit artifact contains the feature.

## Reference demo completeness

The reference demo is part of PromptKit's public integration contract, not decorative sample code.

Every public PromptKit feature that can be meaningfully demonstrated must have a concrete, verifiable example in `examples/demo/`. This includes new block types, update semantics, lifecycle/bootstrap behavior, themes, actions, indicators, transports, and other public presentation capabilities.

When adding or changing a public feature:

- update the reference demo in the same change when the feature is demonstrable;
- keep the local HTTP demo and the GitHub Pages/static demo aligned where the capability is applicable to both;
- add or extend smoke checks so important demo capabilities cannot silently disappear;
- do not claim that the demo covers every public feature while a demonstrable public feature is missing;
- if a feature cannot reasonably be demonstrated in one of the demo modes, document that limitation explicitly rather than silently omitting it.
