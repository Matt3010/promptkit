import { readFileSync } from "node:fs";

const demo = readFileSync("examples/demo/demo.js", "utf8");
const server = readFileSync("examples/demo/server.mjs", "utf8");
const actions = readFileSync("src/actions.ts", "utf8");
const protocol = readFileSync("src/protocol.ts", "utf8");

for (const [name, source] of [["static", demo], ["local", server]]) {
  assert(source.includes("feedback:"), `${name} reference demo does not demonstrate action feedback`);
  assert(source.includes("before:"), `${name} reference demo does not demonstrate before feedback`);
  assert(source.includes("error:"), `${name} reference demo does not demonstrate error feedback`);
  assert(source.includes("actionUi:"), `${name} reference demo does not demonstrate generic action UI`);
  assert(source.includes("chooserLabel:"), `${name} reference demo does not demonstrate chooser templates`);
  assert(source.includes("noMatch:"), `${name} reference demo does not demonstrate no-match feedback`);
  assert(!source.includes("drop-files"), `${name} reference demo still uses legacy drop-files echo`);
}

assert(actions.includes("assertNever(context)"), "action context template mapping is not compile-time exhaustive");
assert(!actions.includes("nessuna azione disponibile"), "application wording leaked into PromptKit action core");
assert(!protocol.includes("PromptKitDropFilesEcho"), "legacy drop-files echo remains in the public protocol");
assert(demo.includes("await kit.start();\n  kit.ready();"), "reference initialization is no longer the simple start/ready flow");

console.log("PromptKit declarative action feedback smoke check passed");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
