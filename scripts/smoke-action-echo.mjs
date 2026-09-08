import { readFileSync } from "node:fs";

const demo = readFileSync("examples/demo/demo.js", "utf8");
const server = readFileSync("examples/demo/server.mjs", "utf8");
const marker = 'echo: { type: "drop-files", tone: "secondary" }';

assert(demo.includes(marker), "static reference demo does not demonstrate action echo");
assert(server.includes(marker), "local reference demo does not demonstrate action echo");

console.log("PromptKit action echo demo smoke check passed");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
