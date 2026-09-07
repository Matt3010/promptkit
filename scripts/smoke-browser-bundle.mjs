import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const bundlePath = resolve("dist/promptkit.browser.js");
const source = await readFile(bundlePath, "utf8");

assert(source.length > 0, "browser bundle is empty");
assert(
  !/(?:\bfrom\s+|\bimport\s*\()\s*["']\.\.?\//u.test(source),
  "browser bundle still contains relative ESM imports",
);

const module = await import(pathToFileURL(bundlePath).href);
const expectedExports = [
  "PromptKit",
  "PromptKitActions",
  "PromptKitClient",
  "PromptKitProtocolError",
  "PromptKitRenderer",
  "isPromptKitBlock",
  "isPromptKitCommandResponse",
  "isPromptKitEvent",
  "isPromptKitManifest",
];

for (const name of expectedExports) {
  assert(name in module, `browser bundle is missing runtime export ${name}`);
}

console.log("PromptKit browser bundle smoke check passed");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
