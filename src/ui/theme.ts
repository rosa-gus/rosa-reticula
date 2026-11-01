import { t, subscribeLocale } from "../i18n/runtime.ts";

type Theme = "light" | "dark";

export function mountTheme(button: HTMLButtonElement): () => void {
  const key = "rosa-reticula:theme:v1";
  const system = window.matchMedia("(prefers-color-scheme: light)");
  let preference: Theme | undefined;
  try {
    const stored = localStorage.getItem(key);
    if (stored === "light" || stored === "dark") preference = stored;
  } catch {
    /* Theme switching also works when storage is unavailable. */
  }

  const apply = () => {
    const theme = preference ?? (system.matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
    button.textContent =
      theme === "dark" ? t("workbench.light") : t("theme.dark");
    button.setAttribute(
      "aria-label",
      theme === "dark" ? t("workbench.activateLight") : t("theme.activateDark"),
    );
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#ffd6e0" : "#0a0a09");
  };
  const toggle = () => {
    preference =
      document.documentElement.dataset.theme === "light" ? "dark" : "light";
    try {
      localStorage.setItem(key, preference);
    } catch {
      /* Keep the choice for this session. */
    }
    apply();
  };
  button.addEventListener("click", toggle);
  system.addEventListener("change", apply);
  apply();
  const unsubscribe = subscribeLocale(apply);
  return () => {
    unsubscribe();
    button.removeEventListener("click", toggle);
    system.removeEventListener("change", apply);
  };
}
