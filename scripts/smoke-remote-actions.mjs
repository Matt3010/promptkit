import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4279;
const server = spawn(process.execPath, ["examples/demo/server.mjs"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"],
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const probe = await fetch(`http://127.0.0.1:${port}/tui/manifest`);
      if (probe.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(50);
  }
  if (!ready) throw new Error("PromptKit demo server did not start");

  const manifest = await (await fetch(`http://127.0.0.1:${port}/tui/manifest`)).json();
  const remote = new Map(
    manifest.actions.filter((action) => action.remote).map((action) => [action.id, action]),
  );
  for (const id of [
    "remote-manual",
    "remote-import",
    "remote-error",
    "remote-invalid",
    "remote-no-content",
  ]) {
    if (!remote.has(id)) throw new Error(`remote demo action missing: ${id}`);
  }

  const manual = await fetch(`http://127.0.0.1:${port}/tui/actions/manual`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "remote-manual",
      trigger: "manual",
      payload: { smoke: true },
    }),
  });
  const manualBody = await manual.json();
  if (!manual.ok || manualBody.state?.remoteManual !== true) {
    throw new Error("remote manual demo failed");
  }

  const form = new FormData();
  form.append("action", "remote-import");
  form.append("trigger", "drop");
  form.append(
    "files",
    new Blob(["{}"], { type: "application/json" }),
    "config.remote.json",
  );
  const upload = await fetch(`http://127.0.0.1:${port}/tui/actions/import`, {
    method: "POST",
    body: form,
  });
  if (!upload.ok) throw new Error(`remote multipart demo failed: ${upload.status}`);

  const failure = await fetch(`http://127.0.0.1:${port}/tui/actions/error`, {
    method: "POST",
    body: "x",
  });
  if (failure.status !== 422 || (await failure.json()).error !== "demo remote failure") {
    throw new Error("remote error demo failed");
  }

  const invalid = await fetch(`http://127.0.0.1:${port}/tui/actions/invalid`, {
    method: "POST",
    body: "x",
  });
  if (!invalid.ok || (await invalid.json()).invented !== true) {
    throw new Error("remote invalid-result demo failed");
  }

  const noContent = await fetch(`http://127.0.0.1:${port}/tui/actions/no-content`, {
    method: "POST",
    body: "x",
  });
  if (noContent.status !== 204) throw new Error("remote no-content demo failed");

  console.log("Remote action demo smoke passed");
} finally {
  server.kill("SIGTERM");
}
