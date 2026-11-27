import template from "./workbench.html?raw";
import { localize, t, type StaticMessageKey } from "../i18n/runtime.ts";
import packageInfo from "../../package.json" with { type: "json" };

type ControlId = "contrast" | "screen" | "pairs" | "protection" | "blur";
type HelpId = ControlId | "duotone" | "pulse-frequency" | "pulse-intensity";

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
export function mountWorkbench(root: HTMLElement) {
  root.innerHTML = template;
  const rangeTemplate = root.querySelector<HTMLTemplateElement>(
    "#range-control-template",
  )!;
  const helpTemplate = root.querySelector<HTMLTemplateElement>(
    "#help-template",
  )!;
  const createHelp = (id: HelpId, title: StaticMessageKey) => {
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
  for (const [id, min, max, step] of [
    ["frequency", 0.2, 3, 0.05], ["intensity", 0, 1, 0.01],
    ["radius", 0.05, 1.5, 0.01], ["softness", 0, 1, 0.01],
    ["speed", 0, 2, 0.01], ["scale", 0.08, 1, 0.01],
    ["complexity", 0, 1, 0.01], ["pulsation", 0, 1, 0.01],
    ["minimum", 0, 1, 0.01],
  ] as const) {
    const fragment = rangeTemplate.content.cloneNode(true) as DocumentFragment;
    const input = fragment.querySelector<HTMLInputElement>("input")!;
    input.id = `pulse-${id}`;
    input.dataset.pulse = id;
    input.min = String(min); input.max = String(max); input.step = String(step);
    const label = fragment.querySelector("label")!;
    label.setAttribute("for", input.id);
    const title = `video.${id}` as const;
    label.setAttribute("data-i18n", title);
    const output = fragment.querySelector("output")!;
    output.id = `${input.id}-value`;
    output.setAttribute("for", input.id);
    const help = fragment.querySelector("[data-control-help]")!;
    if (id === "frequency" || id === "intensity") {
      const helpId = `pulse-${id}` as const;
      input.setAttribute("aria-describedby", `${helpId}-help`);
      help.replaceWith(createHelp(helpId, title));
    } else help.remove();
    let group = "#pulse-sliders";
    if (id === "minimum") group = "#pulse-minimum-control";
    else if (id === "radius" || id === "softness") group = "#pulse-point-controls";
    else if (id !== "frequency" && id !== "intensity") group = "#pulse-movement-controls";
    root.querySelector(group)!.append(fragment);
  }
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

  const settings = root.querySelector<HTMLElement>(".settings-content")!;
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".settings-tabs button"));
  const [treatmentTab, pulseTab] = tabs;
  const panels = tabs.map((tab) =>
    root.querySelector<HTMLElement>(`#${tab.getAttribute("aria-controls")}`)!,
  );
  const selectTab = (selected: HTMLButtonElement) => {
    tabs.forEach((tab, index) => {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[index].hidden = !active;
    });
    settings.scrollTop = 0;
  };
  for (const tab of tabs) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      const available = tabs.filter((item) => !item.hidden);
      const index = available.indexOf(tab);
      let next: HTMLButtonElement;
      switch (event.key) {
        case "Home": next = available[0]; break;
        case "End": next = available[available.length - 1]; break;
        case "ArrowLeft": next = available[(index - 1 + available.length) % available.length]; break;
        case "ArrowRight": next = available[(index + 1) % available.length]; break;
        default: return;
      }
      event.preventDefault();
      selectTab(next);
      next.focus();
    });
  }
  const headerMenu = root.querySelector<HTMLButtonElement>("#header-menu")!;
  const headerActions = root.querySelector<HTMLElement>("#header-actions")!;
  headerMenu.addEventListener("click", () => {
    const expanded = headerMenu.getAttribute("aria-expanded") === "true";
    headerMenu.setAttribute("aria-expanded", String(!expanded));
  });
  headerActions.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || !headerMenu.getClientRects().length)
      return;
    headerMenu.setAttribute("aria-expanded", "false");
    headerMenu.focus();
  });

  return {
    setAnimationMode(active: boolean) {
      pulseTab.hidden = !active;
      root.querySelector<HTMLElement>("#animation-recipe-note")!.hidden = !active;
      selectTab(active ? pulseTab : treatmentTab);
    },
  };
}
