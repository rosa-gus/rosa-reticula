import { defaultPulse, validatePulse, animationPlan, type PulseSettings } from "../core/pulse.ts";
import type { Frame, Parameters } from "../core/types.ts";
import { ProcessingClient } from "../processing/client.ts";
import type { AnimationResponse } from "../processing/animation.worker.ts";
import { paint } from "../browser/image.ts";
import { AppError } from "../core/errors.ts";
import { t, formatNumber } from "../i18n/runtime.ts";
import { mountSelect } from "./select.ts";

/** Owns animation state; shared image controls and recipes remain in the controller. */
export function mountVideo(
  root: HTMLElement,
  changed: () => void,
  failed: (error: unknown) => void,
  onModeChange: (active: boolean) => void,
) {
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  let mode: "image" | "video" = "image";
  let pulse = { ...defaultPulse }, cycles = 2, fps = 24;
  let source: Frame | undefined, parameters: Parameters | undefined;
  let sourceId = 0, revision = 0, playing = false, seconds = 0, anchor = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let exportWorker: Worker | undefined, cancelExport: (() => void) | undefined;
  let disposed = false, progress = 0, frameStarted = 0;
  const menus = ["pulse-model", "pulse-curve", "pulse-polarity", "pulse-fps", "video-format"].map((id) => mountSelect(el<HTMLSelectElement>(id)));
  const format = () => el<HTMLSelectElement>("video-format").value === "mp4" ? "mp4" as const : "gif" as const;
  const plan = () => animationPlan(pulse, cycles, fps, format());
  const time = () => playing ? (seconds + (performance.now() - anchor) / 1000) % plan().duration : seconds;
  const timeLabel = (value: number) => formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const syncPlayback = () => {
    const now = time(), duration = plan().duration;
    el("pulse-play").textContent = t(playing ? "video.pause" : "video.play");
    el("pulse-play").setAttribute("aria-pressed", String(playing));
    el<HTMLInputElement>("pulse-timeline").value = String(now / duration);
    el("pulse-time").textContent = `${timeLabel(now)} / ${timeLabel(duration)} s`;
  };
  const sync = () => {
    for (const input of root.querySelectorAll<HTMLInputElement>("[data-pulse]")) {
      const key = input.dataset.pulse as "frequency" | "intensity" | "radius" | "softness" | "minimum" | "speed" | "scale" | "complexity" | "pulsation";
      input.value = String(pulse[key]);
      el(`${input.id}-value`).textContent = key === "frequency" ? `${timeLabel(pulse[key])} Hz`
        : key === "speed" ? `${timeLabel(pulse[key])}×`
        : `${formatNumber(Math.round(pulse[key] * 100))}%`;
    }
    el<HTMLSelectElement>("pulse-model").value = pulse.model;
    el<HTMLInputElement>("pulse-seed").value = String(pulse.seed);
    for (const element of root.querySelectorAll<HTMLElement>("[data-light-model]"))
      element.hidden = element.dataset.lightModel !== pulse.model;
    el("light-overlay").hidden = mode !== "video" || pulse.model !== "point";
    el<HTMLInputElement>("pulse-x").value = String(Math.round(pulse.x * 100));
    el<HTMLInputElement>("pulse-y").value = String(Math.round(pulse.y * 100));
    el<HTMLSelectElement>("pulse-curve").value = pulse.curve;
    el<HTMLSelectElement>("pulse-polarity").value = pulse.polarity;
    el<HTMLInputElement>("pulse-cycles").value = String(cycles);
    el<HTMLSelectElement>("pulse-fps").value = String(fps);
    const { duration, frames } = plan();
    el("pulse-duration").textContent = t("video.duration", { seconds: timeLabel(duration), frames: formatNumber(frames) });
    el("mp4-note").hidden = format() !== "mp4";
    el("mp4-quality").hidden = format() !== "mp4";
    const width = source?.width ?? 1, height = source?.height ?? 1;
    const diameter = 2 * pulse.radius * Math.min(width, height);
    const overlay = el("light-overlay");
    overlay.style.setProperty("--light-x", `${pulse.x * 100}%`);
    overlay.style.setProperty("--light-y", `${pulse.y * 100}%`);
    overlay.style.setProperty("--light-width", `${diameter / width * 100}%`);
    overlay.style.setProperty("--light-height", `${diameter / height * 100}%`);
    // Keep the resize handle reachable even when the light extends off canvas.
    overlay.style.setProperty("--light-edge", `${Math.min(97, (pulse.x + diameter / width / 2) * 100)}%`);
    menus.forEach((menu) => menu.sync());
    if (exportWorker) el("video-progress").textContent = t("video.exporting", { progress: formatNumber(progress) });
    syncPlayback();
  };
  const preview = new ProcessingClient((response) => {
    if (disposed || mode !== "video" || (response.revision !== revision && response.revision !== -1)) return;
    if (response.type === "error") {
      playing = false;
      syncPlayback();
      failed(new AppError(response.code));
      return;
    }
    paint(el<HTMLCanvasElement>("result-canvas"), response.frame);
    syncPlayback();
    if (playing && !document.hidden) timer = setTimeout(render, Math.max(0, 1000 / fps - (performance.now() - frameStarted)));
  });
  function render() {
    clearTimeout(timer);
    if (disposed || mode !== "video" || !source || !parameters) return;
    frameStarted = performance.now();
    preview.submit({ revision: ++revision, sourceId, frame: source, parameters: structuredClone(parameters), pulse: { settings: { ...pulse }, seconds: time() / plan().duration * cycles / pulse.frequency, loopDuration: cycles / pulse.frequency } });
  }
  const setPlaying = (value: boolean) => {
    seconds = time();
    anchor = performance.now();
    playing = value;
    syncPlayback();
    render();
  };
  const update = (patch: Partial<PulseSettings>) => {
    try {
      pulse = validatePulse({ ...pulse, ...patch });
      seconds = 0; anchor = performance.now();
      sync(); render(); changed();
    } catch (error) { failed(error); sync(); }
  };
  const setMode = (next: "image" | "video") => {
    if (mode === next) return;
    seconds = time(); anchor = performance.now(); playing = false;
    mode = next;
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
      const selected = button.dataset.mode === mode;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    el("editor-panel").setAttribute("aria-labelledby", `mode-${mode}`);
    for (const id of ["playback", "video-output", "light-overlay"]) el(id).hidden = mode !== "video";
    el("image-format-row").hidden = mode === "video";
    onModeChange(mode === "video");
    if (mode === "video") {
      // Start with the treated preview when entering animation mode.
      root.querySelector<HTMLButtonElement>('[data-view="result"]')!.click();
      sync(); render();
    } else { revision++; clearTimeout(timer); }
    changed();
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    button.addEventListener("click", () => setMode(button.dataset.mode as "image" | "video"));
    button.addEventListener("keydown", (event) => {
      let next: "image" | "video";
      if (event.key === "Home") next = "image";
      else if (event.key === "End") next = "video";
      else if (["ArrowLeft", "ArrowRight"].includes(event.key)) next = mode === "image" ? "video" : "image";
      else return;
      event.preventDefault(); setMode(next); el(`mode-${next}`).focus();
    });
  }
  for (const input of root.querySelectorAll<HTMLInputElement>("[data-pulse]"))
    input.addEventListener("input", () => update({ [input.dataset.pulse!]: Number(input.value) }));
  el<HTMLSelectElement>("pulse-model").addEventListener("change", (event) => update({ model: (event.target as HTMLSelectElement).value as PulseSettings["model"] }));
  el<HTMLInputElement>("pulse-seed").addEventListener("change", (event) => update({ seed: Number((event.target as HTMLInputElement).value) }));
  el("pulse-randomize").addEventListener("click", () => update({ seed: crypto.getRandomValues(new Uint32Array(1))[0] }));
  el<HTMLSelectElement>("pulse-curve").addEventListener("change", (event) => update({ curve: (event.target as HTMLSelectElement).value as PulseSettings["curve"] }));
  el<HTMLSelectElement>("pulse-polarity").addEventListener("change", (event) => update({ polarity: (event.target as HTMLSelectElement).value as PulseSettings["polarity"] }));
  for (const axis of ["x", "y"] as const) el<HTMLInputElement>(`pulse-${axis}`).addEventListener("change", (event) => update({ [axis]: Number((event.target as HTMLInputElement).value) / 100 }));
  el("pulse-center").addEventListener("click", () => update({ x: 0.5, y: 0.5 }));
  for (const id of ["pulse-cycles", "pulse-fps", "video-format"]) el(id).addEventListener("change", () => {
    const nextCycles = Number(el<HTMLInputElement>("pulse-cycles").value), nextFps = Number(el<HTMLSelectElement>("pulse-fps").value);
    try {
      animationPlan(pulse, nextCycles, nextFps, format());
      cycles = nextCycles; fps = nextFps; seconds = 0; anchor = performance.now();
      sync(); render(); changed();
    } catch (error) { failed(error); sync(); }
  });
  el("pulse-play").addEventListener("click", () => setPlaying(!playing));
  el("pulse-restart").addEventListener("click", () => { seconds = 0; anchor = performance.now(); syncPlayback(); render(); });
  el<HTMLInputElement>("pulse-timeline").addEventListener("input", (event) => {
    playing = false;
    seconds = Number((event.target as HTMLInputElement).value) * plan().duration;
    syncPlayback(); render();
  });
  for (const id of ["light-position", "light-radius"]) {
    const handle = el(id);
    let startX = 0, startY = 0, startPulse = { ...pulse };
    handle.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault(); handle.focus({ preventScroll: true });
      startX = event.clientX; startY = event.clientY; startPulse = { ...pulse };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const rect = el("canvas-wrap").getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (id === "light-radius") update({ radius: Math.max(0.05, Math.min(1.5, startPulse.radius + (event.clientX - startX) / Math.min(rect.width, rect.height))) });
      else update({ x: Math.max(0, Math.min(1, startPulse.x + (event.clientX - startX) / rect.width)), y: Math.max(0, Math.min(1, startPulse.y + (event.clientY - startY) / rect.height)) });
    });
    const end = (event: PointerEvent) => { if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); };
    handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end);
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const delta = (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) * (event.shiftKey ? 0.1 : 0.01);
      if (id === "light-radius") update({ radius: Math.max(0.05, Math.min(1.5, pulse.radius + delta)) });
      else {
        const axis = ["ArrowLeft", "ArrowRight"].includes(event.key) ? "x" : "y";
        update({ [axis]: Math.max(0, Math.min(1, pulse[axis] + delta)) });
      }
    });
  }
  const visibility = () => {
    if (document.hidden) { seconds = time(); anchor = performance.now(); clearTimeout(timer); }
    else { anchor = performance.now(); render(); }
  };
  document.addEventListener("visibilitychange", visibility);
  el("cancel-video-export").addEventListener("click", () => cancelExport?.());
  sync();
  return {
    get active() { return mode === "video"; },
    get format() { return format(); },
    get durationLabel() { return `${timeLabel(plan().duration)} s`; },
    updateSource(frame: Frame, p: Parameters) {
      source = frame; parameters = structuredClone(p); sourceId++;
      sync(); render();
    },
    refresh: sync,
    reset() { pulse = { ...defaultPulse }; cycles = 2; fps = 24; seconds = 0; anchor = performance.now(); sync(); render(); changed(); },
    async export(): Promise<Blob | undefined> {
      if (!source || !parameters || exportWorker) throw new AppError("videoExport");
      if (source.width * source.height * plan().frames > 500_000_000) throw new AppError("videoSize");
      setPlaying(false);
      const worker = new Worker(new URL("../processing/animation.worker.ts", import.meta.url), { type: "module" });
      exportWorker = worker; progress = 0;
      el("cancel-video-export").hidden = false;
      el("video-progress").hidden = false;
      sync();
      try {
        return await new Promise<Blob | undefined>((resolve, reject) => {
          cancelExport = () => resolve(undefined);
          worker.onmessage = ({ data }: MessageEvent<AnimationResponse>) => {
            if (data.type === "progress") {
              progress = data.progress;
              el("video-progress").textContent = t("video.exporting", { progress: formatNumber(progress) });
            } else if (data.type === "result") resolve(new Blob([data.buffer], { type: data.mime }));
            else reject(new AppError(data.code));
          };
          worker.onerror = () => reject(new AppError("videoExport"));
          worker.onmessageerror = () => reject(new AppError("videoExport"));
          const frame = { ...source!, rgba: source!.rgba.slice() };
          worker.postMessage({ frame, parameters: structuredClone(parameters), pulse: { ...pulse }, cycles, fps, format: format() }, [frame.rgba.buffer]);
        });
      } finally {
        worker.terminate(); exportWorker = undefined; cancelExport = undefined;
        el("cancel-video-export").hidden = true; el("video-progress").hidden = true;
      }
    },
    dispose() {
      disposed = true; clearTimeout(timer); preview.dispose();
      cancelExport?.(); exportWorker?.terminate();
      menus.forEach((menu) => menu.dispose());
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}
