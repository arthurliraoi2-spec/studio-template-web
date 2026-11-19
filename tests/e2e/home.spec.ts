import { expect, test } from "@playwright/test";

test.describe("Página inicial — fluxos críticos", () => {
  test("carrega com título e formulário acessíveis", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fale com a gente" })).toBeVisible();
    await expect(page.getByLabel("Nome")).toBeVisible();
  });

  test("mostra erros por campo quando o envio é inválido", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Nome").fill("A");
    await page.getByLabel("E-mail").fill("invalido");
    await page.getByLabel("Mensagem").fill("curta");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(page.getByRole("status")).toContainText("Verifique os campos");
    await expect(page.getByLabel("E-mail")).toHaveAttribute("aria-invalid", "true");
  });

  test("envia com sucesso e limpa o formulário", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Nome").fill("Ana Souza");
    await page.getByLabel("E-mail").fill("ana@example.com");
    await page.getByLabel("Mensagem").fill("Gostaria de um orçamento para um site.");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(page.getByRole("status")).toContainText("Mensagem enviada");
    await expect(page.getByLabel("Nome")).toHaveValue("");
  });

  test("informa falha de rede sem quebrar a página", async ({ page }) => {
    await page.route("**/api/contact", (route) => route.abort());
    await page.goto("/");
    await page.getByLabel("Nome").fill("Ana Souza");
    await page.getByLabel("E-mail").fill("ana@example.com");
    await page.getByLabel("Mensagem").fill("Gostaria de um orçamento para um site.");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(page.getByRole("status")).toContainText("Sem conexão");
  });

  test("não gera erros de console nem violações de CSP", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});
