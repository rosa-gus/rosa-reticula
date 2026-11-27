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
    const label = t(theme === "dark" ? "theme.dark" : "workbench.light");
    const action = t(theme === "dark" ? "workbench.activateLight" : "theme.activateDark");
    document.documentElement.dataset.theme = theme;
    button.textContent = `[${label}]`;
    button.setAttribute("aria-label", `${label}. ${action}`);
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
