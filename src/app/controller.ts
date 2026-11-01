import {
  t,
  locale,
  formatNumber,
  setLocale,
  subscribeLocale,
  localize,
  supportedLocales,
  languageNames,
  type StaticMessageKey,
} from "../i18n/runtime.ts";
import { errorMessage, workerError } from "../i18n/errors.ts";
import { AppError } from "../core/errors.ts";
import type { Frame, Parameters } from "../core/types.ts";
import { profiles, copyRecipe, original } from "../profiles/registry.ts";
import { parseRecipe, validateParameters } from "../profiles/schema.ts";
import { ProcessingClient } from "../processing/client.ts";
import {
  decode,
  download,
  exportPng,
  paint,
  prepare,
} from "../browser/image.ts";
import { examples, sample } from "../browser/sample.ts";
import type { Example } from "../browser/sample.ts";
import { workbench } from "../ui/workbench.ts";
import { mountTooltips } from "../ui/tooltips.ts";
import { mountSelect } from "../ui/select.ts";
import { mountTheme } from "../ui/theme.ts";

export function mount(root: HTMLElement): void {
  root.innerHTML = workbench();
  const disposeTooltips = mountTooltips(root);
  const el = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const disposeTheme = mountTheme(el<HTMLButtonElement>("theme-toggle"));
  const resultCanvas = el<HTMLCanvasElement>("result-canvas"),
    originalCanvas = el<HTMLCanvasElement>("original-canvas");
  const exportButton = el<HTMLButtonElement>("export-png"),
    status = el("status");
  const profileSelect = el<HTMLSelectElement>("profile");
  const profileMenu = mountSelect(profileSelect),
    curveMenu = mountSelect(el<HTMLSelectElement>("curve"));
  let recipes = profiles.map(copyRecipe),
    baseline = copyRecipe(profiles[0]),
    recipe = copyRecipe(baseline);
  let bitmap: ImageBitmap | undefined,
    prepared: Frame | undefined,
    preparationKey = "";
  let sourceId = 0,
    revision = 0,
    readyRevision = -1,
    loadToken = 0,
    loading = false;
  let filename = "",
    timer: ReturnType<typeof setTimeout> | undefined;
  let notice: (() => string) | undefined;
  let refreshSource = () => {};
  let refreshOutput = () => {};
  let profileDescription: "preset" | "imported" | "saved" = "preset";
  const setMetadata = (
    target: HTMLElement,
    parts: (string | HTMLElement)[],
  ) => {
    target.replaceChildren(
      ...parts.flatMap((part, index) => {
        const content =
          typeof part === "string" ? document.createTextNode(part) : part;
        if (!index) return [content];
        const separator = document.createElement("span");
        separator.className = "metadata-separator";
        separator.setAttribute("aria-hidden", "true");
        return [
          document.createTextNode(" "),
          separator,
          document.createTextNode(" "),
          content,
        ];
      }),
    );
  };
  let renderStatus = () => {};
  const message = (
    text: () => string,
    error = false,
    detail?: () => string,
  ) => {
    renderStatus = () => {
      if (detail) setMetadata(status, [text(), detail()]);
      else status.textContent = text();
      status.classList.toggle("error", error);
    };
    renderStatus();
  };
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem("rosa-reticula:profiles:v1") ?? "[]",
    );
    if (Array.isArray(stored))
      recipes.push(
        ...stored
          .slice(0, 50)
          .map(parseRecipe)
          .filter((r) => !profiles.some((p) => p.profile.id === r.profile.id)),
      );
  } catch {
    message(() => t("errors.storedProfiles"), true);
  }
  const builtInNames: Record<
    string,
    Extract<StaticMessageKey, `profiles.${string}`> | undefined
  > = {
    "rosa-original": "profiles.rosaOriginal",
    "rosa-dense": "profiles.rosaDense",
    "rosa-soft": "profiles.rosaSoft",
    "bayer-study": "profiles.bayerStudy",
  };
  const refreshProfiles = () => {
    profileSelect.replaceChildren(
      ...recipes.map((r) => {
        const option = document.createElement("option");
        option.value = r.profile.id;
        option.textContent = builtInNames[r.profile.id]
          ? t(builtInNames[r.profile.id]!)
          : r.profile.name;
        return option;
      }),
    );
    profileSelect.value = baseline.profile.id;
    profileMenu.sync();
  };
  const updateModified = () => {
    const modified =
      JSON.stringify(recipe.parameters) !== JSON.stringify(baseline.parameters);
    el("modified").hidden = !modified;
  };
  const syncControls = () => {
    for (const input of root.querySelectorAll<HTMLInputElement>(
      "[data-param]",
    )) {
      const key = input.dataset.param as keyof Parameters,
        value = recipe.parameters[key];
      input.value = String(value);
      const output = root.querySelector<HTMLOutputElement>(`#${key}-value`);
      if (output)
        output.textContent =
          typeof value === "number"
            ? formatNumber(value, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : String(value).toUpperCase();
    }
    el<HTMLInputElement>("width").value = String(recipe.parameters.width);
    for (const key of ["palette", "shadows", "signature"] as const)
      el<HTMLInputElement>(key).value = recipe.parameters[key].join(", ");
    const curve = JSON.stringify(recipe.parameters.curve);
    el<HTMLSelectElement>("curve").value =
      curve === JSON.stringify(original.curve)
        ? "original"
        : curve === "[[0,0],[1,1]]"
          ? "linear"
          : "custom";
    profileMenu.sync();
    curveMenu.sync();
    updateModified();
  };
  const client = new ProcessingClient((response) => {
    if (response.revision !== revision && response.revision !== -1) return;
    if (response.type === "error") {
      exportButton.disabled = true;
      el("drop-zone").setAttribute("aria-busy", "false");
      message(() => errorMessage(workerError(response.code)), true);
      return;
    }
    paint(resultCanvas, response.frame);
    readyRevision = response.revision;
    exportButton.disabled = false;
    const pendingNotice = notice;
    message(
      pendingNotice ?? (() => t("status.processed")),
      Boolean(pendingNotice),
      pendingNotice
        ? undefined
        : () => `${formatNumber(Math.round(response.elapsed))} ms`,
    );
    notice = undefined;
    const resized =
      bitmap &&
      (bitmap.width !== response.frame.width ||
        bitmap.height !== response.frame.height);
    refreshOutput = () => {
      const dimensions = `${formatNumber(response.frame.width)} × ${formatNumber(response.frame.height)} px`;
      setMetadata(el("dimensions"), [
        dimensions,
        "sRGB",
        ...(resized ? [t("preview.resized")] : []),
      ]);
      setMetadata(el("export-details"), [
        dimensions,
        "PNG",
        t("workbench.opaque"),
      ]);
    };
    refreshOutput();
    el("drop-zone").setAttribute("aria-busy", "false");
  });
  const process = () => {
    if (!bitmap || loading) return;
    try {
      const p = validateParameters(recipe.parameters);
      const key = `${p.width}:${p.background}`;
      if (!prepared || key !== preparationKey) {
        prepared = prepare(bitmap, p);
        preparationKey = key;
        sourceId++;
        paint(originalCanvas, prepared);
        el("canvas-wrap").style.aspectRatio =
          `${prepared.width} / ${prepared.height}`;
        el("canvas-wrap").style.setProperty(
          "--image-width",
          `${prepared.width}px`,
        );
        el("canvas-wrap").style.setProperty(
          "--image-ratio",
          String(prepared.width / prepared.height),
        );
      }
      client.submit({
        revision,
        sourceId,
        frame: prepared,
        parameters: structuredClone(p),
      });
    } catch (error) {
      el("drop-zone").setAttribute("aria-busy", "false");
      message(() => errorMessage(error, "prepare"), true);
    }
  };
  const schedule = () => {
    revision++;
    exportButton.disabled = true;
    updateModified();
    el("drop-zone").setAttribute("aria-busy", "true");
    message(() => t("status.processing"));
    clearTimeout(timer);
    timer = setTimeout(process, 80);
  };
  const change = (patch: Partial<Parameters>) => {
    try {
      recipe.parameters = validateParameters({
        ...recipe.parameters,
        ...patch,
      });
      syncControls();
      schedule();
    } catch (error) {
      message(() => errorMessage(error), true);
      syncControls();
    }
  };
  const useImage = async (
    factory: () => Promise<ImageBitmap>,
    name: string,
    detail: () => string,
    example?: Example,
  ) => {
    const token = ++loadToken;
    loading = true;
    revision++;
    exportButton.disabled = true;
    clearTimeout(timer);
    notice = undefined;
    message(() => t("status.loadingImage"));
    let next: ImageBitmap | undefined;
    try {
      next = await factory();
      if (token !== loadToken) {
        next.close();
        return;
      }
      const nextPrepared = prepare(next, recipe.parameters);
      bitmap?.close();
      bitmap = next;
      prepared = nextPrepared;
      sourceId++;
      preparationKey = `${recipe.parameters.width}:${recipe.parameters.background}`;
      filename = name;
      el("filename").textContent = name;
      const loaded = next;
      refreshSource = () => {
        const dimensions = t("preview.originalSize", {
          width: formatNumber(loaded.width),
          height: formatNumber(loaded.height),
        });
        if (!example) {
          setMetadata(el("file-detail"), [dimensions, detail()]);
          return;
        }
        const author = document.createElement("a");
        author.textContent = example.author;
        author.href = example.url;
        author.target = "_blank";
        author.rel = "noopener noreferrer";
        author.title = `${example.author} / ${example.license.name} / ${example.license.url}`;
        setMetadata(el("file-detail"), [dimensions, author]);
      };
      refreshSource();
      root
        .querySelectorAll<HTMLButtonElement>("[data-example]")
        .forEach((button) => {
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.example === example?.file),
          );
        });
      paint(originalCanvas, prepared);
      el("canvas-wrap").style.aspectRatio =
        `${prepared.width} / ${prepared.height}`;
      el("canvas-wrap").style.setProperty(
        "--image-width",
        `${prepared.width}px`,
      );
      el("canvas-wrap").style.setProperty(
        "--image-ratio",
        String(prepared.width / prepared.height),
      );
      loading = false;
      schedule();
    } catch (error) {
      if (next && next !== bitmap) next.close();
      if (token !== loadToken) return;
      loading = false;
      const retained = Boolean(bitmap);
      notice = () =>
        retained
          ? t("errors.previousImage", { message: errorMessage(error) })
          : errorMessage(error);
      if (bitmap) schedule();
      message(notice, true);
    }
  };
  const openFile = (file?: File) => {
    if (file)
      void useImage(
        () => decode(file),
        file.name,
        () =>
          `${formatNumber(file.size / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`,
      );
  };
  const loadSample = (example: Example) => {
    void useImage(
      () => sample(example),
      example.file,
      () => t("status.sample"),
      example,
    );
  };
  for (const example of examples) {
    const button = document.createElement("button");
    button.textContent = `[${example.file.replace(/\.[^.]+$/, "")}]`;
    button.dataset.example = example.file;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => loadSample(example));
    el("example-list").append(button);
  }
  refreshProfiles();
  syncControls();
  for (const input of root.querySelectorAll<HTMLInputElement>("[data-param]")) {
    input.addEventListener("input", () =>
      change({
        [input.dataset.param!]:
          input.type === "range" ? Number(input.value) : input.value,
      }),
    );
  }
  el<HTMLInputElement>("width").addEventListener("change", (e) =>
    change({ width: Number((e.target as HTMLInputElement).value) }),
  );
  for (const key of ["palette", "shadows", "signature"] as const)
    el<HTMLInputElement>(key).addEventListener("change", () => {
      const values = el<HTMLInputElement>(key)
        .value.split(",")
        .map((v) => (v.trim() === "" ? NaN : Number(v.trim())));
      change({ [key]: values });
    });
  el<HTMLSelectElement>("curve").addEventListener("change", (e) =>
    change({
      curve:
        (e.target as HTMLSelectElement).value === "linear"
          ? [
              [0, 0],
              [1, 1],
            ]
          : original.curve,
    }),
  );
  const refreshDescription = () => {
    if (profileDescription !== "preset") {
      el("profile-description").textContent = t(
        profileDescription === "imported"
          ? "profiles.importedDescription"
          : "profiles.savedDescription",
      );
      return;
    }
    const fixed = (value: number) =>
      formatNumber(value, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    const descriptions: Record<string, string[]> = {
      "rosa-original": ["Bayer 4×4", t("workbench.pairsGrid")],
      "rosa-dense": [
        t("profiles.contrast", { value: fixed(1.3) }),
        t("profiles.levels", { count: 7 }),
        t("profiles.pairs", { value: fixed(1) }),
      ],
      "rosa-soft": [
        t("profiles.contrast", { value: fixed(0.95) }),
        t("profiles.screen", { value: fixed(0.65) }),
        t("profiles.pairs", { value: fixed(0.4) }),
      ],
      "bayer-study": [
        "Bayer 4×4",
        t("profiles.levels", { count: 5 }),
        t("profiles.linear"),
      ],
    };
    const description = el("profile-description");
    setMetadata(
      description,
      descriptions[baseline.profile.id] ?? [t("profiles.customDescription")],
    );
    if (baseline.profile.id === "rosa-original")
      description.append(
        document.createElement("br"),
        t("profiles.levels", { count: 9 }),
      );
  };
  profileSelect.addEventListener("change", () => {
    baseline = copyRecipe(
      recipes.find((r) => r.profile.id === profileSelect.value)!,
    );
    recipe = copyRecipe(baseline);
    profileDescription = "preset";
    refreshDescription();
    syncControls();
    schedule();
  });
  const resetAdjustments = () => {
    recipe = copyRecipe(baseline);
    syncControls();
    schedule();
  };
  el("reset").addEventListener("click", resetAdjustments);
  el("modified").addEventListener("click", resetAdjustments);
  el("swap-colors").addEventListener("click", () =>
    change({
      shadow: recipe.parameters.highlight,
      highlight: recipe.parameters.shadow,
    }),
  );
  el("select-image").addEventListener("click", () =>
    el<HTMLInputElement>("image-file").click(),
  );
  el<HTMLInputElement>("image-file").addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    openFile(input.files?.[0]);
    input.value = "";
  });
  const dropZone = el("drop-zone");
  let dragDepth = 0;
  dropZone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    dropZone.classList.add("dragging");
  });
  dropZone.addEventListener("dragover", (e) => e.preventDefault());
  dropZone.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) dropZone.classList.remove("dragging");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove("dragging");
    openFile(e.dataTransfer?.files[0]);
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  const splitLine = el("split-line"),
    canvasWrap = el("canvas-wrap");
  let splitPosition = 50,
    dragOffset = 0;
  const setSplit = (value: number) => {
    splitPosition = Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
    canvasWrap.style.setProperty("--split", `${splitPosition}%`);
    splitLine.setAttribute("aria-valuenow", String(splitPosition));
    splitLine.setAttribute(
      "aria-valuetext",
      t("preview.splitValue", {
        original: formatNumber(Math.round(splitPosition)),
        treated: formatNumber(Math.round(100 - splitPosition)),
      }),
    );
  };
  splitLine.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const bounds = canvasWrap.getBoundingClientRect();
    dragOffset =
      event.clientX - (bounds.left + (bounds.width * splitPosition) / 100);
    splitLine.focus({ preventScroll: true });
    splitLine.setPointerCapture(event.pointerId);
    splitLine.classList.add("is-dragging");
  });
  splitLine.addEventListener("pointermove", (event) => {
    if (!splitLine.hasPointerCapture(event.pointerId)) return;
    const bounds = canvasWrap.getBoundingClientRect();
    if (bounds.width)
      setSplit(
        ((event.clientX - dragOffset - bounds.left) / bounds.width) * 100,
      );
  });
  const endSplitDrag = (event: PointerEvent) => {
    if (splitLine.hasPointerCapture(event.pointerId))
      splitLine.releasePointerCapture(event.pointerId);
    splitLine.classList.remove("is-dragging");
  };
  splitLine.addEventListener("pointerup", endSplitDrag);
  splitLine.addEventListener("pointercancel", endSplitDrag);
  splitLine.addEventListener("lostpointercapture", () =>
    splitLine.classList.remove("is-dragging"),
  );
  splitLine.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 10 : 1;
    let value: number;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        value = splitPosition - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        value = splitPosition + step;
        break;
      case "PageDown":
        value = splitPosition - 10;
        break;
      case "PageUp":
        value = splitPosition + 10;
        break;
      case "Home":
        value = 0;
        break;
      case "End":
        value = 100;
        break;
      default:
        return;
    }
    event.preventDefault();
    setSplit(value);
  });
  const setView = (view: string) => {
    root
      .querySelectorAll<HTMLButtonElement>("[data-view]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.view === view)),
      );
    el("canvas-wrap").dataset.view = view;
    splitLine.hidden = view !== "split";
  };
  root
    .querySelectorAll<HTMLButtonElement>("[data-view]")
    .forEach((b) =>
      b.addEventListener("click", () => setView(b.dataset.view!)),
    );
  for (const mode of ["fit", "actual"])
    el(mode).addEventListener("click", () => {
      dropZone.classList.toggle("actual-size", mode === "actual");
      el("fit").setAttribute("aria-pressed", String(mode === "fit"));
      el("actual").setAttribute("aria-pressed", String(mode === "actual"));
    });
  exportButton.addEventListener("click", async () => {
    if (readyRevision !== revision || loading) return;
    try {
      await exportPng(
        resultCanvas,
        `${filename.replace(/\.[^.]+$/, "")}-rosa.png`,
      );
    } catch (error) {
      message(() => errorMessage(error), true);
    }
  });
  el("export-recipe").addEventListener("click", () =>
    download(
      new Blob([JSON.stringify(recipe, null, 2) + "\n"], {
        type: "application/json",
      }),
      "rosa-reticula-recipe.json",
    ),
  );
  el("import-recipe").addEventListener("click", () =>
    el<HTMLInputElement>("recipe-file").click(),
  );
  el<HTMLInputElement>("recipe-file").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      if (file.size > 100_000) throw new AppError("recipeSize");
      const imported = parseRecipe(JSON.parse(await file.text()));
      imported.profile = {
        ...imported.profile,
        id: `import-${crypto.randomUUID()}`,
        name: imported.profile.name,
      };
      recipes.push(imported);
      baseline = copyRecipe(imported);
      recipe = copyRecipe(imported);
      refreshProfiles();
      syncControls();
      profileDescription = "imported";
      refreshDescription();
      schedule();
    } catch (error) {
      message(
        () =>
          errorMessage(
            error,
            error instanceof SyntaxError ? "recipeJson" : "unknown",
          ),
        true,
      );
    }
  });
  el("save-profile").addEventListener("click", () => {
    const input = el<HTMLInputElement>("profile-name"),
      name = input.value.trim();
    if (!name) {
      message(() => t("errors.profileName"), true);
      input.focus();
      return;
    }
    const custom = recipes.filter(
      (r) => !profiles.some((p) => p.profile.id === r.profile.id),
    );
    if (custom.length >= 50) {
      message(() => t("errors.profileLimit"), true);
      return;
    }
    const saved = copyRecipe(recipe);
    saved.profile = { id: `custom-${crypto.randomUUID()}`, name, version: 1 };
    try {
      localStorage.setItem(
        "rosa-reticula:profiles:v1",
        JSON.stringify([...custom, saved]),
      );
      recipes.push(saved);
      baseline = copyRecipe(saved);
      recipe = copyRecipe(saved);
      input.value = "";
      refreshProfiles();
      syncControls();
      profileDescription = "saved";
      refreshDescription();
      message(() => t("status.saved"));
    } catch {
      message(() => t("errors.profileSave"), true);
    }
  });
  const languageSelect = el<HTMLSelectElement>("language");
  languageSelect.replaceChildren(
    ...supportedLocales.map((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.lang = tag;
      option.textContent = languageNames[tag];
      return option;
    }),
  );
  languageSelect.value = locale;
  const languageMenu = mountSelect(languageSelect);
  languageSelect.addEventListener("change", async () => {
    const next = languageSelect.value as typeof locale;
    try {
      await setLocale(next);
    } catch {
      languageSelect.value = locale;
      languageMenu.sync();
      message(() => t("errors.language"), true);
    }
  });
  const unsubscribeLocale = subscribeLocale(() => {
    localize(root);
    languageSelect.value = locale;
    languageMenu.sync();
    refreshProfiles();
    syncControls();
    refreshDescription();
    refreshSource();
    refreshOutput();
    setSplit(splitPosition);
    renderStatus();
  });
  refreshDescription();
  setSplit(splitPosition);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      client.dispose();
      bitmap?.close();
      clearTimeout(timer);
      disposeTooltips();
      profileMenu.dispose();
      curveMenu.dispose();
      disposeTheme();
      languageMenu.dispose();
      unsubscribeLocale();
    }
  });
  setView("result");
  loadSample(examples[0]);
}
