import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Rotas públicas verificadas em todos os viewports (mobile, tablet, desktop). */
const ROUTES = ["/"];

for (const route of ROUTES) {
  test.describe(`Responsividade e acessibilidade — ${route}`, () => {
    test("sem rolagem horizontal nem elementos transbordando", async ({ page }) => {
      await page.goto(route);
      const overflow = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > vw + 1 || r.left < -1);
          })
          .map((el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ""));
        return { scroll: document.documentElement.scrollWidth > vw, offenders };
      });
      expect(overflow.scroll, `overflow: ${overflow.offenders.join(", ")}`).toBe(false);
    });

    test("alvos de toque com no mínimo 24x24 px (WCAG 2.5.8)", async ({ page }) => {
      await page.goto(route);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("a, button, input, select, textarea")]
          .filter((el) => el.offsetParent !== null)
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width < 24 || r.height < 24;
          })
          .map((el) => el.outerHTML.slice(0, 80)),
      );
      expect(small).toEqual([]);
    });

    test("sem violações WCAG 2.2 A/AA detectáveis pelo axe", async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });

    test("respeita prefers-reduced-motion", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route);
      const duration = await page
        .getByRole("button", { name: "Enviar mensagem" })
        .evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(parseFloat(duration)).toBeLessThan(0.02);
    });

    test("regressão visual", async ({ page }) => {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${route === "/" ? "home" : route.slice(1)}.png`, {
        fullPage: true,
      });
    });
  });
}
