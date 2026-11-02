import { t, escapeHtml } from "../i18n/runtime.ts";

import type { StaticMessageKey } from "../i18n/runtime.ts";
import packageInfo from "../../package.json" with { type: "json" };
const { license, version } = packageInfo;
const label = (key: StaticMessageKey) =>
  `<span data-i18n="${key}">${escapeHtml(t(key))}</span>`;

type ControlId =
  | "contrast"
  | "screen"
  | "pairs"
  | "protection"
  | "blur"
  | "duotone";

const controls = [
  ["contrast", "controls.contrast", 0, 3, 0.01],
  ["screen", "controls.screen", 0, 1, 0.01],
  ["pairs", "controls.pairs", 0, 1, 0.01],
  ["protection", "controls.protection", 0, 1, 0.01],
] as const;

function help(id: ControlId, key: StaticMessageKey): string {
  return `<span class="help"><button type="button" class="tooltip-trigger" popovertarget="${id}-help" aria-label="${escapeHtml(t(`help.${id}`))}" data-i18n-aria-label="help.${id}" aria-expanded="false" aria-controls="${id}-help" aria-describedby="${id}-help">[?]</button><span id="${id}-help" class="app-tooltip" popover="auto" role="tooltip"><span class="tooltip-content"><span class="tooltip-title">${label(key)}</span>${label(`explanations.${id}`)}</span></span></span>`;
}

function controlHeading(id: ControlId, key: StaticMessageKey): string {
  return `<div class="control-heading"><div class="control-title"><label for="${id}">${label(key)}</label>${help(id, key)}</div><output for="${id}" id="${id}-value"></output></div>`;
}

export function workbench(): string {
  return `
    <header class="masthead">
      <a class="header-identity" href="./" aria-label="${escapeHtml(t("workbench.home"))}" data-i18n-aria-label="workbench.home"><img class="brand-mark" src="${import.meta.env?.BASE_URL ?? "./"}rosa-reticula-brand.png" width="32" height="32" alt=""><span class="brand-copy"><span class="wordmark">Rosa Retícula</span><span class="brand-detail"><span class="brand-label">workbench</span><span class="metadata-separator" aria-hidden="true"></span><span class="brand-version">v${version}</span></span></span></a>
      <div class="header-actions"><div class="language-control"><label for="language" class="sr-only">${label("common.language")}</label><select id="language" aria-label="${escapeHtml(t("common.language"))}" data-i18n-aria-label="common.language"></select></div><span class="local-note meta">${label("workbench.local")}</span><button id="theme-toggle" class="theme-toggle" type="button" aria-label="${escapeHtml(t("workbench.activateLight"))}">${label("workbench.light")}</button></div>
    </header>
    <main>
      <h1 class="sr-only">${label("workbench.title")}</h1>
      <p class="workbench-description">${label("workbench.description")}</p>
      <section class="workbench" aria-label="${escapeHtml(t("workbench.editor"))}" data-i18n-aria-label="workbench.editor">
        <div class="source-heading"><div class="source-name"><span id="filename">${label("workbench.loadingSample")}</span><span class="meta metadata" id="file-detail"></span></div><button id="select-image" title="${escapeHtml(t("workbench.openTitle"))}" data-i18n-title="workbench.openTitle">${label("workbench.open")}</button><input id="image-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></div>
        <div class="preview-panel">
          <div class="preview-toolbar"><div class="segmented view-control" role="group" aria-label="${escapeHtml(t("workbench.view"))}" data-i18n-aria-label="workbench.view"><button data-view="result" aria-pressed="true">${label("workbench.treated")}</button><button data-view="original" aria-pressed="false">${label("workbench.original")}</button><button data-view="split" aria-pressed="false">${label("workbench.compare")}</button></div></div>
          <div id="drop-zone" class="preview-stage" aria-label="${escapeHtml(t("workbench.dropLabel"))}" data-i18n-aria-label="workbench.dropLabel">
            <div id="canvas-wrap" class="canvas-wrap"><canvas id="result-canvas" aria-label="${escapeHtml(t("workbench.treatedImage"))}" data-i18n-aria-label="workbench.treatedImage"></canvas><div id="original-layer" class="original-layer"><canvas id="original-canvas" aria-label="${escapeHtml(t("workbench.originalImage"))}" data-i18n-aria-label="workbench.originalImage"></canvas></div><div id="split-line" class="split-line" role="slider" tabindex="0" aria-label="${escapeHtml(t("workbench.split"))}" data-i18n-aria-label="workbench.split" aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"  title="${escapeHtml(t("workbench.splitHelp"))}" data-i18n-title="workbench.splitHelp" hidden><span aria-hidden="true">&lt;|&gt;</span></div></div>
            <div class="drop-overlay"><span>${label("workbench.drop")}</span><span class="meta">PNG / JPEG / WebP</span></div>
          </div>
          <div class="preview-footer"><span class="meta metadata" id="dimensions">${label("workbench.loadingSample")}</span><div class="segmented zoom-control" role="group" aria-label="Zoom"><button id="fit" aria-pressed="true">${label("workbench.fit")}</button><button id="actual" aria-pressed="false">[1:1]</button></div></div>
          <div class="source-bar"><span class="meta">${label("workbench.examples")}</span><div id="example-list" class="example-list" role="group" aria-label="${escapeHtml(t("workbench.exampleImages"))}" data-i18n-aria-label="workbench.exampleImages"></div></div>
        </div>
        <aside class="settings" aria-label="${escapeHtml(t("workbench.settings"))}" data-i18n-aria-label="workbench.settings">
          <div class="settings-content">
            <section class="setting-section profile-section"><div class="profile-heading"><label for="profile">${label("workbench.profile")}</label><button id="modified" class="meta is-modified" type="button" aria-label="${escapeHtml(t("workbench.restoreProfile"))}" data-i18n-aria-label="workbench.restoreProfile" title="${escapeHtml(t("workbench.restoreProfile"))}" data-i18n-title="workbench.restoreProfile" hidden>${label("workbench.modified")}</button></div><select id="profile" aria-describedby="profile-description"></select><p id="profile-description" class="field-note metadata">Bayer 4×4<span class="metadata-separator" aria-hidden="true"></span>${label("workbench.pairsGrid")}<br>${label("workbench.nineLevels")}</p></section>
            <section class="setting-section"><h2 class="section-label">${label("workbench.tone")}</h2><div class="sliders">${controls.map(([id, label, min, max, step]) => `<div class="control">${controlHeading(id, label)}<input id="${id}" data-param="${id}" aria-describedby="${id}-help" type="range" min="${min}" max="${max}" step="${step}"></div>`).join("")}</div></section>
            <section class="setting-section"><div class="section-heading"><div class="section-title"><h2 class="section-label">${label("workbench.duotone")}</h2>${help("duotone", "controls.duotone")}</div><button id="swap-colors" class="text-button">${label("workbench.swap")}</button></div><div class="colors" role="group" aria-label="${escapeHtml(t("workbench.duotone"))}" data-i18n-aria-label="workbench.duotone" aria-describedby="duotone-help"><label class="color-control"><input id="shadow" data-param="shadow" type="color" aria-label="${escapeHtml(t("workbench.shadowColor"))}" data-i18n-aria-label="workbench.shadowColor"><span>${label("workbench.shadow")}<output id="shadow-value"></output></span></label><label class="color-control"><input id="highlight" data-param="highlight" type="color" aria-label="${escapeHtml(t("workbench.highlightColor"))}" data-i18n-aria-label="workbench.highlightColor"><span>${label("workbench.highlight")}<output id="highlight-value"></output></span></label></div></section>
            <details class="setting-section advanced"><summary><span class="disclosure-mark" aria-hidden="true"></span>${label("workbench.advanced")}</summary><div class="advanced-content"><div class="control">${controlHeading("blur", "controls.blur")}<input id="blur" data-param="blur" aria-describedby="blur-help" type="range" min="0" max="5" step=".1"></div><div class="stacked"><label for="curve">${label("workbench.curve")}</label><select id="curve"><option value="original" data-i18n="workbench.rosaOriginal">${escapeHtml(t("workbench.rosaOriginal"))}</option><option value="linear" data-i18n="workbench.linear">${escapeHtml(t("workbench.linear"))}</option><option value="custom" disabled data-i18n="workbench.customCurve">${escapeHtml(t("workbench.customCurve"))}</option></select></div><label class="stacked" for="palette">${label("workbench.levels")}<input id="palette" type="text" spellcheck="false" aria-describedby="palette-help"></label><p class="field-note" id="palette-help">${label("workbench.levelsHelp")}</p><label class="stacked" for="shadows">${label("workbench.shadows")}<input id="shadows" type="text" spellcheck="false"></label><label class="stacked" for="signature">${label("workbench.signature")}<input id="signature" type="text" spellcheck="false"></label><p class="field-note">${label("workbench.rangeHelp")}</p><label class="background-control" for="background">${label("workbench.background")}<input id="background" data-param="background" type="color"></label></div></details>
            <details class="setting-section recipes"><summary><span class="disclosure-mark" aria-hidden="true"></span>${label("workbench.recipes")}</summary><div class="advanced-content"><label class="stacked" for="profile-name">${label("workbench.saveAs")}<input id="profile-name" type="text" maxlength="60" placeholder="${escapeHtml(t("workbench.profilePlaceholder"))}" data-i18n-placeholder="workbench.profilePlaceholder"></label><button id="save-profile">${label("workbench.save")}</button><div class="recipe-actions"><button id="import-recipe">${label("workbench.import")}</button><button id="export-recipe">${label("workbench.exportRecipe")}</button></div><input id="recipe-file" type="file" accept=".json,application/json" hidden><p class="field-note">${label("workbench.recipeHelp")}</p></div></details>
          </div>
          <div class="export-area"><button id="reset" class="text-button">${label("workbench.reset")}</button><section class="output-settings" aria-labelledby="output-title"><h2 id="output-title" class="section-label">${label("workbench.output")}</h2><div class="output-format"><label for="export-format">${label("workbench.format")}</label><select id="export-format"><option value="png">PNG</option><option value="webp" data-i18n="workbench.webpLossless">${escapeHtml(t("workbench.webpLossless"))}</option></select></div><div class="output-width"><label for="width">${label("workbench.width")}</label><span class="input-unit"><input id="width" type="number" min="1" max="4096" step="1" value="1200" aria-describedby="width-help"><span>px</span></span></div><p id="width-help" class="field-note">${label("workbench.sizeHelp")}<br>${label("workbench.resizeHelp")}</p></section><button id="export-image" class="primary" disabled>[<span id="export-label">${escapeHtml(t("workbench.exportImage", { format: "PNG" }))}</span> <span class="icon-arrow export-arrow" aria-hidden="true">&#x2197;&#xFE0E;</span>]</button><span id="export-details" class="export-note meta">PNG<span class="metadata-separator" aria-hidden="true"></span>${label("workbench.opaque")}</span></div>
        </aside>
      </section>
      <div class="processing-footer"><div id="status" class="status meta" role="status" aria-live="polite">${label("workbench.initializing")}</div></div>
      <footer class="page-footer">
        <div class="footer-identity"><span class="footer-wordmark">Rosa Retícula</span><span class="footer-byline meta">${label("workbench.by")} <a class="author-link" href="https://rosa-gus.github.io/portfolio" target="_blank" rel="noopener noreferrer"><span class="author-accent">rosa</span>-gus</a></span></div>
        <nav class="footer-links" aria-label="${escapeHtml(t("workbench.resources"))}" data-i18n-aria-label="workbench.resources"><a href="https://github.com/rosa-gus/rosa-reticula" target="_blank" rel="noopener noreferrer">[${label("workbench.repository")} <span class="icon-arrow" aria-hidden="true">&#x2197;&#xFE0E;</span>]</a><a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener noreferrer">[${label("workbench.license")} ${license} <span class="icon-arrow" aria-hidden="true">&#x2197;&#xFE0E;</span>]</a></nav>
      </footer>
    </main>`;
}
