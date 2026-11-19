// Localiza ferramentas externas (gitleaks, osv-scanner, semgrep) no PATH ou em
// pastas de instalação conhecidas no Windows (winget, pip --user).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join } from "node:path";

const isWin = process.platform === "win32";

function fromPath(name) {
  const r = spawnSync(isWin ? "where" : "which", [name], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).find(Boolean)?.trim() ?? null;
}

function windowsCandidates(name) {
  const exe = `${name}.exe`;
  const local = process.env.LOCALAPPDATA ?? "";
  const roaming = process.env.APPDATA ?? "";
  const out = [join(local, "Microsoft", "WinGet", "Links", exe)];
  const pkgs = join(local, "Microsoft", "WinGet", "Packages");
  if (existsSync(pkgs)) {
    for (const dir of readdirSync(pkgs)) out.push(join(pkgs, dir, exe));
  }
  const py = join(roaming, "Python");
  if (existsSync(py)) {
    for (const dir of readdirSync(py)) out.push(join(py, dir, "Scripts", exe));
  }
  return out;
}

/** Caminho absoluto da ferramenta ou null quando não instalada. */
export function findTool(name) {
  const envOverride = process.env[`${name.toUpperCase().replace(/-/g, "_")}_BIN`];
  if (envOverride && existsSync(envOverride)) return envOverride;
  const p = fromPath(name);
  if (p) return p;
  if (isWin) return windowsCandidates(name).find((c) => existsSync(c)) ?? null;
  return null;
}

/** Executa um comando sem shell e captura a saída. */
export function run(bin, args, options = {}) {
  // A pasta da ferramenta entra no PATH: o semgrep.exe chama o pysemgrep ao lado dele.
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const PATH = isAbsolute(bin)
    ? `${dirname(bin)}${delimiter}${process.env[pathKey] ?? ""}`
    : process.env[pathKey];
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, [pathKey]: PATH, PYTHONUTF8: "1", ...options.env },
    cwd: options.cwd,
    timeout: options.timeout ?? 15 * 60 * 1000,
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error };
}

/** Executa um script npm (precisa de shell no Windows por causa do npm.cmd). */
export function runNpm(args, options = {}) {
  const r = spawnSync(isWin ? "npm.cmd" : "npm", args, {
    encoding: "utf8",
    shell: isWin,
    stdio: options.inherit ? "inherit" : "pipe",
    env: { ...process.env, ...options.env },
    cwd: options.cwd,
    maxBuffer: 256 * 1024 * 1024,
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
