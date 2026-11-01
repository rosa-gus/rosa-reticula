import { locale, t } from "../i18n/runtime.ts";

export function mountSelect(select: HTMLSelectElement): {
  sync: () => void;
  dispose: () => void;
} {
  const wrapper = document.createElement("div");
  wrapper.className = "select-control";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "select-trigger";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const value = document.createElement("span");
  value.id = `${select.id}-selected-value`;
  value.className = "select-value";
  const indicator = document.createElement("span");
  indicator.className = "select-indicator";
  indicator.setAttribute("aria-hidden", "true");
  indicator.textContent = "[+]";
  trigger.append(value, indicator);
  const menu = document.createElement("div");
  menu.id = `${select.id}-options`;
  menu.className = "select-menu";
  menu.popover = "auto";
  menu.setAttribute("role", "listbox");
  trigger.setAttribute("aria-controls", menu.id);
  const labels = Array.from(select.labels ?? []);
  const labelIds = labels
    .map((label, index) => {
      label.id ||= `${select.id}-label-${index}`;
      return label.id;
    })
    .join(" ");
  trigger.setAttribute("aria-labelledby", `${labelIds} ${value.id}`.trim());
  if (labelIds) menu.setAttribute("aria-labelledby", labelIds);
  if (select.hasAttribute("aria-describedby"))
    trigger.setAttribute(
      "aria-describedby",
      select.getAttribute("aria-describedby")!,
    );
  select.before(wrapper);
  wrapper.append(select, trigger, menu);
  select.hidden = true;

  let active = -1,
    snapshot = "",
    search = "",
    lastKeyAt = 0;
  const isOpen = () => menu.matches(":popover-open");
  const enabled = () =>
    Array.from(select.options).flatMap((option, index) =>
      option.disabled ? [] : [index],
    );
  const activate = (index: number) => {
    active = index;
    Array.from(menu.children).forEach((option, i) =>
      option.classList.toggle("is-active", i === active),
    );
    const option = menu.children[active] as HTMLElement | undefined;
    if (option && isOpen()) {
      trigger.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else trigger.removeAttribute("aria-activedescendant");
  };
  const position = () => {
    if (!isOpen()) return;
    const bounds = trigger.getBoundingClientRect(),
      padding = 16,
      gap = 6;
    menu.style.width = `${Math.min(bounds.width, window.innerWidth - padding * 2)}px`;
    const below = window.innerHeight - bounds.bottom - gap - padding;
    const above = bounds.top - gap - padding;
    const up = below < Math.min(menu.scrollHeight + 2, 240) && above > below;
    menu.style.maxHeight = `${Math.max(0, Math.min(320, up ? above : below))}px`;
    menu.style.left = `${Math.max(padding, Math.min(bounds.left, window.innerWidth - menu.getBoundingClientRect().width - padding))}px`;
    menu.style.top = `${up ? bounds.top - gap - menu.getBoundingClientRect().height : bounds.bottom + gap}px`;
  };
  const close = () => {
    if (isOpen()) menu.hidePopover();
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    indicator.textContent = "[+]";
    search = "";
  };
  const sync = () => {
    const options = Array.from(select.options);
    const nextSnapshot = JSON.stringify(
      options.map((option) => [
        option.value,
        option.textContent,
        option.disabled,
      ]),
    );
    if (nextSnapshot !== snapshot) {
      menu.replaceChildren(
        ...options.map((option, index) => {
          const item = document.createElement("div");
          item.id = `${select.id}-option-${index}`;
          item.className = "select-option";
          item.setAttribute("role", "option");
          item.setAttribute("aria-disabled", String(option.disabled));
          item.textContent = option.textContent;
          item.dataset.index = String(index);
          return item;
        }),
      );
      snapshot = nextSnapshot;
    }
    value.textContent =
      select.selectedOptions[0]?.textContent ?? t("common.select");
    trigger.disabled = select.disabled || !enabled().length;
    Array.from(menu.children).forEach((option, index) =>
      option.setAttribute(
        "aria-selected",
        String(index === select.selectedIndex),
      ),
    );
    if (isOpen()) {
      position();
      activate(select.selectedIndex);
    }
  };
  const open = (last = false) => {
    if (trigger.disabled) return;
    const indices = enabled();
    menu.showPopover();
    trigger.setAttribute("aria-expanded", "true");
    indicator.textContent = "[-]";
    position();
    activate(
      indices.includes(select.selectedIndex)
        ? select.selectedIndex
        : last
          ? indices.at(-1)!
          : indices[0],
    );
  };
  const choose = (index: number) => {
    if (!select.options[index] || select.options[index].disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    close();
    sync();
    trigger.focus({ preventScroll: true });
    if (changed) {
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  trigger.addEventListener("click", () => (isOpen() ? close() : open()));
  trigger.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const indices = enabled();
    if (!indices.length) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!isOpen()) {
          open(event.key === "ArrowUp");
          return;
        }
        const current = indices.indexOf(active),
          direction = event.key === "ArrowDown" ? 1 : -1;
        activate(
          indices[(current + direction + indices.length) % indices.length],
        );
        return;
      }
      case "Home":
      case "End":
        event.preventDefault();
        if (!isOpen()) open();
        activate(event.key === "Home" ? indices[0] : indices.at(-1)!);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (isOpen()) choose(active);
        else open();
        return;
      case "Escape":
        if (isOpen()) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        return;
      case "Tab":
        close();
        return;
    }
    if (event.key.length !== 1) return;
    event.preventDefault();
    if (!isOpen()) open();
    const now = Date.now();
    search = now - lastKeyAt < 700 ? search + event.key : event.key;
    lastKeyAt = now;
    const normalize = (text: string) =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase(locale);
    const query = normalize(search);
    const repeated = [...query].every((character) => character === query[0]);
    const prefix = repeated ? query[0] : query;
    const start = Math.max(0, indices.indexOf(active));
    for (
      let offset = repeated ? 1 : 0;
      offset < indices.length + (repeated ? 1 : 0);
      offset++
    ) {
      const index = indices[(start + offset) % indices.length];
      if (
        normalize(select.options[index].textContent ?? "").startsWith(prefix)
      ) {
        activate(index);
        break;
      }
    }
  });
  menu.addEventListener("pointerdown", (event) => event.preventDefault());
  menu.addEventListener("pointermove", (event) => {
    const option = (event.target as Element).closest<HTMLElement>(
      '[role="option"]',
    );
    if (option && option.getAttribute("aria-disabled") !== "true")
      activate(Number(option.dataset.index));
  });
  menu.addEventListener("click", (event) => {
    const option = (event.target as Element).closest<HTMLElement>(
      '[role="option"]',
    );
    if (option) choose(Number(option.dataset.index));
  });
  menu.addEventListener("toggle", () => {
    if (!isOpen()) close();
  });
  const focusTrigger = (event: MouseEvent) => {
    event.preventDefault();
    trigger.focus();
  };
  labels.forEach((label) => label.addEventListener("click", focusTrigger));
  select.addEventListener("change", sync);
  // A scroll in the option list stays local; scrolling the page dismisses it.
  const onScroll = (event: Event) => {
    if (!(event.target instanceof Node) || !menu.contains(event.target))
      close();
  };
  window.addEventListener("resize", close);
  window.addEventListener("scroll", onScroll, true);
  sync();
  return {
    sync,
    dispose: () => {
      close();
      labels.forEach((label) =>
        label.removeEventListener("click", focusTrigger),
      );
      select.removeEventListener("change", sync);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    },
  };
}
