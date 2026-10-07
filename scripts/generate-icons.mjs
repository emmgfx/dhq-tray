// Renders the app and menu bar (tray) icons from Lucide's rocket.
// Run with: npm run icons
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";

const require = createRequire(import.meta.url);
const rocketSvg = readFileSync(require.resolve("lucide-static/icons/rocket.svg"), "utf8");
const rocketPaths = rocketSvg.slice(
  rocketSvg.indexOf(">", rocketSvg.indexOf("<svg")) + 1,
  rocketSvg.indexOf("</svg>"),
);
const OUTPUT_DIR = new URL("../src-tauri/icons/", import.meta.url);

function renderPng(svg, widthPx, fileName) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: widthPx } }).render().asPng();
  writeFileSync(new URL(fileName, OUTPUT_DIR), png);
}

// Tray: macOS template images, black on transparent, 22pt tall (44px @2x).
const TRAY_ICON_SIZE_PX = 44;
const trayRocketSvg = rocketSvg.replaceAll("currentColor", "#000");
// Marks API activity in the empty bottom-right corner of the rocket.
const activityDot = '<circle cx="19.5" cy="19.5" r="3" fill="#000" stroke="none" />';

renderPng(trayRocketSvg, TRAY_ICON_SIZE_PX, "tray-icon.png");
renderPng(
  trayRocketSvg.replace("</svg>", `${activityDot}</svg>`),
  TRAY_ICON_SIZE_PX,
  "tray-icon-busy.png",
);

// App icon: macOS icon grid (824px rounded square on a 1024px canvas).
// `tauri icon` derives every bundle size from this file.
const APP_ICON_SIZE_PX = 1024;
const ROCKET_SCALE = 20; // 24px Lucide viewBox -> 480px
const rocketOffset = (APP_ICON_SIZE_PX - 24 * ROCKET_SCALE) / 2;
const appIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1" />
      <stop offset="1" stop-color="#4c1d95" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity="0.3" />
    </filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#background)" filter="url(#shadow)" />
  <g transform="translate(${rocketOffset} ${rocketOffset}) scale(${ROCKET_SCALE})"
     fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    ${rocketPaths}
  </g>
</svg>`;
renderPng(appIconSvg, APP_ICON_SIZE_PX, "app-icon.png");
