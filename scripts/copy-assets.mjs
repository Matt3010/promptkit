import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const files = [["src/styles.css", "dist/styles.css"]];

for (const [source, destination] of files) {
  const target = resolve(destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(source), target);
}
