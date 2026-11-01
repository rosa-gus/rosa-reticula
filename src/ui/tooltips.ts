export function mountTooltips(root: HTMLElement): () => void {
  let active: { trigger: HTMLButtonElement; panel: HTMLElement } | undefined;
  let frame = 0;

  const position = () => {
    if (!active) return;
    const { trigger, panel } = active;
    const anchor = trigger.getBoundingClientRect(),
      box = panel.getBoundingClientRect();
    const padding = 16,
      gap = 18;
    const left = Math.max(
      padding,
      Math.min(
        window.innerWidth - box.width - padding,
        anchor.right - box.width,
      ),
    );
    const above =
      anchor.bottom + gap + box.height > window.innerHeight - padding;
    const top = above ? anchor.top - gap - box.height : anchor.bottom + gap;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(padding, Math.min(window.innerHeight - box.height - padding, top))}px`;
    panel.style.setProperty(
      "--stem-x",
      `${Math.max(16, Math.min(box.width - 16, anchor.left + anchor.width / 2 - left))}px`,
    );
    panel.dataset.side = above ? "top" : "bottom";
    panel.dataset.positioned = "true";
  };
  const reposition = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(position);
  };
  const cleanups: (() => void)[] = [];
  for (const trigger of root.querySelectorAll<HTMLButtonElement>(
    ".tooltip-trigger",
  )) {
    const panel = root.querySelector<HTMLElement>(
      `#${trigger.getAttribute("popovertarget")}`,
    )!;
    // Opening precedes the queued toggle event; hide stale coordinates until measured.
    const onBeforeToggle = () => {
      delete panel.dataset.positioned;
    };
    const onToggle = () => {
      const open = panel.matches(":popover-open");
      trigger.setAttribute("aria-expanded", String(open));
      if (open) {
        active = { trigger, panel };
        position();
      } else if (active?.panel === panel) active = undefined;
    };
    panel.addEventListener("beforetoggle", onBeforeToggle);
    panel.addEventListener("toggle", onToggle);
    cleanups.push(() => {
      panel.removeEventListener("beforetoggle", onBeforeToggle);
      panel.removeEventListener("toggle", onToggle);
    });
  }
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
    cleanups.forEach((cleanup) => cleanup());
  };
}
