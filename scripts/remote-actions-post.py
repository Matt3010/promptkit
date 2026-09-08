from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def replace_once(path: str, needle: str, replacement: str) -> None:
    source = read(path)
    if needle not in source:
        raise RuntimeError(f"missing post-migration anchor in {path}: {needle[:100]!r}")
    write(path, source.replace(needle, replacement, 1))


replace_once(
    "src/actions.ts",
    '''export type PromptKitActionResult = PromptKitSnapshot;

export type PromptKitActionHandler = (''',
    '''export type PromptKitActionResult = PromptKitSnapshot;

const ACTION_RESULT_KEYS = new Set(["blocks", "state", "themeVariant", "indicators", "clear"]);

export function isPromptKitActionResult(value: unknown): value is PromptKitActionResult {
  return isPromptKitSnapshot(value) && Object.keys(value).every((key) => ACTION_RESULT_KEYS.has(key));
}

export type PromptKitActionHandler = (''',
)
replace_once(
    "src/actions.ts",
    '''      if (!isPromptKitSnapshot(result)) {
        throw new Error(`PromptKit action handler returned an invalid result: ${id}`);
      }''',
    '''      if (!isPromptKitActionResult(result)) {
        throw new Error(`PromptKit action handler returned an invalid result: ${id}`);
      }''',
)
replace_once(
    "src/client.ts",
    '''import type { PromptKitActionContext, PromptKitActionResult } from "./actions.js";''',
    '''import {
  isPromptKitActionResult,
  type PromptKitActionContext,
  type PromptKitActionResult,
} from "./actions.js";''',
)
replace_once(
    "src/client.ts",
    '''    if (!isPromptKitSnapshot(value)) {
      throw new PromptKitProtocolError(`invalid PromptKit action result: ${id}`);
    }''',
    '''    if (!isPromptKitActionResult(value)) {
      throw new PromptKitProtocolError(`invalid PromptKit action result: ${id}`);
    }''',
)
replace_once(
    "src/index.ts",
    '''export { PromptKitActions } from "./actions.js";''',
    '''export { PromptKitActions, isPromptKitActionResult } from "./actions.js";''',
)

Path("scripts/remote-actions-post.py").unlink(missing_ok=True)
