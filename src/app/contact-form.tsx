"use client";

import { useState, type FormEvent } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; fields?: Record<string, string> };

export function ContactForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        form.reset();
        setStatus({ kind: "success" });
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string; fields?: { path: string; message: string }[] };
      } | null;
      setStatus({
        kind: "error",
        message: body?.error?.message ?? "Não foi possível enviar. Tente novamente.",
        fields: Object.fromEntries((body?.error?.fields ?? []).map((f) => [f.path, f.message])),
      });
    } catch {
      setStatus({
        kind: "error",
        message: "Sem conexão. Verifique sua internet e tente novamente.",
      });
    }
  }

  const fieldError = (name: string) =>
    status.kind === "error" ? status.fields?.[name] : undefined;
  const submitting = status.kind === "submitting";

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" aria-describedby="form-status">
      <Field name="name" label="Nome" autoComplete="name" error={fieldError("name")} />
      <Field
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        error={fieldError("email")}
      />
      <Field name="message" label="Mensagem" multiline error={fieldError("message")} />
      <div aria-hidden="true" className="hidden">
        <label>
          Não preencha
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="min-h-12 rounded-full bg-[var(--ink)] px-6 font-medium text-[var(--paper)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:opacity-60"
      >
        {submitting ? "Enviando…" : "Enviar mensagem"}
      </button>
      <p id="form-status" role="status" aria-live="polite" className="min-h-6 text-sm">
        {status.kind === "success" && "Mensagem enviada. Retornaremos em breve."}
        {status.kind === "error" && <span className="text-[var(--danger)]">{status.message}</span>}
      </p>
    </form>
  );
}

function Field(props: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  multiline?: boolean;
  error?: string;
}) {
  const { name, label, type = "text", autoComplete, multiline, error } = props;
  const errorId = `${name}-error`;
  const common = {
    id: name,
    name,
    required: true,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    className:
      "w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-base text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] aria-[invalid=true]:border-[var(--danger)]",
  };
  return (
    <div className="grid gap-2">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea {...common} rows={5} />
      ) : (
        <input {...common} type={type} autoComplete={autoComplete} />
      )}
      {error && (
        <p id={errorId} className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
