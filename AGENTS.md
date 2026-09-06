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
5. whether a protocol/package major version bump is required;
6. whether a compatibility period or deprecation phase can be provided.

A breaking change must be a deliberate, visible decision. Never hide one inside a refactor, cleanup, dependency update, protocol adjustment, or UI rewrite.

## Protocol evolution

The PromptKit wire protocol must remain backward compatible within the same major protocol version.

Additive optional fields and new independently renderable block types are allowed when older clients can safely ignore them. Any change that makes a previously valid v1 request or response invalid is a breaking protocol change and must follow the breaking-change process above.

## Tests

Compatibility behavior should be protected by tests whenever practical. When fixing or extending an existing public contract, add a regression test that demonstrates the previous valid behavior still works.

Do not update tests merely to make an incompatible implementation pass unless the breaking change has first been explicitly identified and approved.
