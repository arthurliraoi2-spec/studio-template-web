import { describe, expect, it } from "vitest";
import { contactSchema } from "@/lib/contact-schema";

const valid = { name: "Ana Souza", email: "ana@example.com", message: "Gostaria de um orçamento." };

describe("contactSchema", () => {
  it("aceita dados válidos e remove espaços", () => {
    const r = contactSchema.parse({ ...valid, name: "  Ana Souza  " });
    expect(r.name).toBe("Ana Souza");
  });

  it.each([
    ["name curto", { ...valid, name: "A" }],
    ["email inválido", { ...valid, email: "nao-e-email" }],
    ["mensagem curta", { ...valid, message: "oi" }],
    ["mensagem longa", { ...valid, message: "x".repeat(2001) }],
    ["campo extra (mass assignment)", { ...valid, role: "admin" }],
    ["tipo errado", { ...valid, name: 123 }],
  ])("rejeita %s", (_label, input) => {
    expect(contactSchema.safeParse(input).success).toBe(false);
  });

  it("rejeita honeypot preenchido com valor", () => {
    expect(contactSchema.safeParse({ ...valid, website: "spam" }).success).toBe(false);
  });
});
