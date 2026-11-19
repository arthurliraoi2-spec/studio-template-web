// Sobe o build de produção localmente para E2E/DAST e encerra a árvore de processos.
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

export async function startLocalServer(port, env = {}) {
  const child = spawn(
    process.execPath,
    [
      join("node_modules", "next", "dist", "bin", "next"),
      "start",
      "-p",
      String(port),
      "-H",
      "127.0.0.1",
    ],
    {
      env: { ...process.env, ...env },
      stdio: "ignore",
    },
  );
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return { url, stop: () => stopTree(child.pid) };
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stopTree(child.pid);
  throw new Error(`Servidor local não respondeu em ${url}`);
}

function stopTree(pid) {
  if (!pid) return;
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* já encerrado */
    }
  }
}
