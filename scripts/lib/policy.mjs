// Política de bloqueio de segurança — lógica pura e testável.
// Bloqueia: critical/high (dependências), ERROR (SAST), qualquer segredo, exceção vencida.
// Registra sem bloquear: medium/low, WARNING/INFO.

export const BLOCKING_SEVERITIES = new Set(["critical", "high"]);

/**
 * Exceções aprovadas (docs/security/exceptions.json). Cada uma precisa de id, tool,
 * reason, approvedBy e expires (AAAA-MM-DD). Exceções vencidas deixam de valer.
 */
export function partitionExceptions(list, now = new Date()) {
  const active = [];
  const expired = [];
  const invalid = [];
  for (const e of list ?? []) {
    const ok = e && e.id && e.tool && e.reason && e.approvedBy && e.expires;
    const exp = ok ? new Date(`${e.expires}T23:59:59Z`) : null;
    if (!ok || Number.isNaN(exp?.getTime())) invalid.push(e);
    else if (exp < now) expired.push(e);
    else active.push(e);
  }
  return { active, expired, invalid };
}

function exceptionFor(active, tool, ids) {
  return active.find((e) => e.tool === tool && ids.includes(e.id));
}

/** npm audit --json (formato v2). */
export function evaluateNpmAudit(report, active = []) {
  const findings = [];
  for (const [pkg, v] of Object.entries(report?.vulnerabilities ?? {})) {
    const advisories = (v.via ?? []).filter((x) => typeof x === "object");
    // Pacotes afetados só transitivamente (via string) são contados no pacote de origem.
    if (advisories.length === 0) continue;
    for (const a of advisories) {
      const ghsa = a.url?.match(/GHSA-[\w-]+/)?.[0] ?? String(a.source);
      const severity = (a.severity ?? v.severity ?? "unknown").toLowerCase();
      findings.push({
        tool: "npm-audit",
        id: ghsa,
        package: pkg,
        severity,
        title: a.title ?? "",
        url: a.url ?? "",
        fixAvailable: Boolean(v.fixAvailable),
      });
    }
  }
  return classify(findings, active, "npm-audit");
}

/** osv-scanner --format json. max_severity é a nota CVSS (string). */
export function evaluateOsv(report, active = []) {
  const findings = [];
  for (const result of report?.results ?? []) {
    for (const p of result.packages ?? []) {
      for (const g of p.groups ?? []) {
        const score = Number.parseFloat(g.max_severity);
        const severity = Number.isNaN(score)
          ? "unknown"
          : score >= 9
            ? "critical"
            : score >= 7
              ? "high"
              : score >= 4
                ? "medium"
                : "low";
        findings.push({
          tool: "osv-scanner",
          id: g.ids?.[0] ?? "unknown",
          ids: [...(g.ids ?? []), ...(g.aliases ?? [])],
          package: `${p.package?.name}@${p.package?.version}`,
          severity,
          title: "",
          url: g.ids?.[0] ? `https://osv.dev/vulnerability/${g.ids[0]}` : "",
        });
      }
    }
  }
  return classify(findings, active, "osv-scanner");
}

/** semgrep --json: ERROR bloqueia, WARNING/INFO registra. */
export function evaluateSemgrep(report, active = []) {
  const findings = (report?.results ?? []).map((r) => ({
    tool: "semgrep",
    id: r.check_id,
    ids: [r.check_id, `${r.check_id}:${r.path}`],
    package: `${r.path}:${r.start?.line}`,
    severity:
      r.extra?.severity === "ERROR" ? "high" : r.extra?.severity === "WARNING" ? "medium" : "low",
    title: (r.extra?.message ?? "").split("\n")[0].slice(0, 200),
    url: "",
  }));
  return classify(findings, active, "semgrep");
}

/** gitleaks: todo segredo bloqueia. Falsos positivos vão para .gitleaksignore (fingerprint). */
export function evaluateGitleaks(report) {
  const findings = (report ?? []).map((f) => ({
    tool: "gitleaks",
    id: f.RuleID,
    package: `${f.File}:${f.StartLine}`,
    severity: "critical",
    title: f.Description ?? "Segredo detectado",
    fingerprint: f.Fingerprint,
    url: "",
  }));
  return { blocking: findings, tolerated: [], informational: [] };
}

function classify(findings, active, tool) {
  const blocking = [];
  const tolerated = [];
  const informational = [];
  for (const f of findings) {
    const exc = exceptionFor(active, tool, f.ids ?? [f.id]);
    if (exc) tolerated.push({ ...f, exception: exc });
    else if (BLOCKING_SEVERITIES.has(f.severity)) blocking.push(f);
    else informational.push(f);
  }
  return { blocking, tolerated, informational };
}

/** Status final conforme MASTER SYSTEM §12. */
export function finalStatus(checks) {
  if (checks.some((c) => c.status === "REPROVADO")) return "BLOQUEADO";
  if (checks.some((c) => c.status === "NÃO EXECUTADO")) return "PENDENTE";
  return "APROVADO";
}
