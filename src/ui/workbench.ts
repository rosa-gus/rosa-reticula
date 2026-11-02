import template from "./workbench.html?raw";
import { localize, t, type StaticMessageKey } from "../i18n/runtime.ts";
import packageInfo from "../../package.json" with { type: "json" };

type ControlId = "contrast" | "screen" | "pairs" | "protection" | "blur";

const controls = [
  { id: "contrast", label: "controls.contrast", min: 0, max: 3, step: 0.01 },
  { id: "screen", label: "controls.screen", min: 0, max: 1, step: 0.01 },
  { id: "pairs", label: "controls.pairs", min: 0, max: 1, step: 0.01 },
  { id: "protection", label: "controls.protection", min: 0, max: 1, step: 0.01 },
  { id: "blur", label: "controls.blur", min: 0, max: 5, step: 0.1 },
] as const satisfies readonly {
  id: ControlId;
  label: StaticMessageKey;
  min: number;
  max: number;
  step: number;
}[];

/** Mount once; locale changes update bindings without replacing the workbench. */
export function mountWorkbench(root: HTMLElement): void {
  root.innerHTML = template;
  const rangeTemplate = root.querySelector<HTMLTemplateElement>(
    "#range-control-template",
  )!;
  const helpTemplate = root.querySelector<HTMLTemplateElement>(
    "#help-template",
  )!;
  const createHelp = (id: ControlId | "duotone", title: StaticMessageKey) => {
    const fragment = helpTemplate.content.cloneNode(true) as DocumentFragment;
    const trigger = fragment.querySelector<HTMLButtonElement>("button")!;
    const panel = fragment.querySelector<HTMLElement>(".app-tooltip")!;
    const panelId = `${id}-help`;
    trigger.setAttribute("popovertarget", panelId);
    trigger.setAttribute("aria-controls", panelId);
    trigger.setAttribute("aria-describedby", panelId);
    trigger.setAttribute("data-i18n-aria-label", `help.${id}` satisfies StaticMessageKey);
    panel.id = panelId;
    fragment.querySelector("[data-help-title]")!.setAttribute("data-i18n", title);
    fragment.querySelector("[data-help-explanation]")!.setAttribute(
      "data-i18n",
      `explanations.${id}` satisfies StaticMessageKey,
    );
    return fragment;
  };

  for (const control of controls) {
    const { id, label, min, max, step } = control;
    const fragment = rangeTemplate.content.cloneNode(true) as DocumentFragment;
    const input = fragment.querySelector<HTMLInputElement>("input")!;
    input.id = id;
    input.dataset.param = id;
    input.setAttribute("min", String(min));
    input.setAttribute("max", String(max));
    input.setAttribute("step", String(step));
    input.setAttribute("aria-describedby", `${id}-help`);
    const caption = fragment.querySelector<HTMLLabelElement>("label")!;
    caption.setAttribute("for", id);
    caption.setAttribute("data-i18n", label);
    const output = fragment.querySelector<HTMLOutputElement>("output")!;
    output.id = `${id}-value`;
    output.setAttribute("for", id);
    fragment.querySelector("[data-control-help]")!.replaceWith(
      createHelp(id, label),
    );
    if (id === "blur") root.querySelector("#blur-control")!.replaceWith(fragment);
    else root.querySelector("#tone-controls")!.append(fragment);
  }
  root.querySelector('[data-help="duotone"]')!.replaceWith(
    createHelp("duotone", "controls.duotone"),
  );
  rangeTemplate.remove();
  helpTemplate.remove();

  root.querySelector<HTMLImageElement>("[data-brand-image]")!.src =
    `${import.meta.env?.BASE_URL ?? "./"}rosa-reticula-brand.png`;
  root.querySelector<HTMLElement>(".brand-version")!.textContent =
    `v${packageInfo.version}`;
  root.querySelector<HTMLElement>("[data-license]")!.textContent =
    packageInfo.license;
  root.querySelector<HTMLElement>("#export-label")!.textContent = t(
    "workbench.exportImage", { format: "PNG" },
  );
  // Components read their labels during initialization, so translate first.
  localize(root);
}
