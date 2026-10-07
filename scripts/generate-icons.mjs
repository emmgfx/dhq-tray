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
// Badges sit in the bottom-right corner; a gap is cut around them so they do
// not merge with the rocket's strokes.
const TRAY_ICON_SIZE_PX = 44;
const trayRocketSvg = rocketSvg.replaceAll("currentColor", "#000");
const withBadge = (badge) => {
  const rocketStart = trayRocketSvg.indexOf(">", trayRocketSvg.indexOf("<svg")) + 1;
  const rocketEnd = trayRocketSvg.indexOf("</svg>");
  return `${trayRocketSvg.slice(0, rocketStart)}
    <mask id="badge-gap">
      <rect width="24" height="24" fill="#fff" />
      <circle cx="19" cy="18.8" r="5.3" fill="#000" />
    </mask>
    <g mask="url(#badge-gap)">${trayRocketSvg.slice(rocketStart, rocketEnd)}</g>
    ${badge}
  </svg>`;
};
// A deployment is running.
const deployingBadge = '<circle cx="19" cy="18.8" r="3.2" fill="#000" stroke="none" />';
// A deployment failed and has not been seen yet: a bold "!".
const failedBadge = `
  <rect x="18" y="13.6" width="2.4" height="6" rx="1.2" fill="#000" />
  <circle cx="19.2" cy="21.9" r="1.3" fill="#000" />`;

renderPng(trayRocketSvg, TRAY_ICON_SIZE_PX, "tray-icon.png");
renderPng(withBadge(deployingBadge), TRAY_ICON_SIZE_PX, "tray-icon-deploying.png");
renderPng(withBadge(failedBadge), TRAY_ICON_SIZE_PX, "tray-icon-failed.png");

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
