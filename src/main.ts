import "./style.css";
import { initializeLocale } from "./i18n/runtime.ts";
import { mount } from "./app/controller.ts";

await initializeLocale();
mount(document.querySelector<HTMLDivElement>("#app")!);
