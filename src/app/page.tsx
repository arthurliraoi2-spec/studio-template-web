import { ContactForm } from "./contact-form";

/**
 * Página-base do template. Substitua o conteúdo pelo conceito visual de cada cliente:
 * o template entrega estrutura, acessibilidade e segurança, não a identidade final.
 */
export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-16 px-4 py-16 sm:px-8 md:grid-cols-[1.1fr_1fr] md:items-start md:py-24">
      <section className="grid gap-6">
        <p className="font-mono text-sm tracking-widest text-[var(--muted)] uppercase">
          Template do estúdio
        </p>
        <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          Base segura para o próximo projeto.
        </h1>
        <p className="max-w-prose text-lg leading-relaxed text-[var(--muted)]">
          Qualidade, testes e verificações de segurança já ligados. Troque este conteúdo pela
          identidade do cliente e rode <code className="font-mono">npm run verify</code> antes de
          cada entrega.
        </p>
      </section>
      <section
        aria-labelledby="contato"
        className="rounded-3xl border border-[var(--line)] p-6 sm:p-8"
      >
        <h2 id="contato" className="mb-6 text-2xl font-semibold">
          Fale com a gente
        </h2>
        <ContactForm />
      </section>
    </main>
  );
}
