// Generates every app icon / splash asset from assets/memoire-icon.svg.
// Run after changing the SVG:  node scripts/generate-icons.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS = join(import.meta.dirname, "..", "assets");
const source = readFileSync(join(ASSETS, "memoire-icon.svg"), "utf8").replace(
  /<metadata>[\s\S]*?<\/metadata>/,
  "",
);

// The SVG is: <defs> gradient, a full-bleed <rect> background, then the white
// windmill + rings. Split it so the layers can be recombined per platform.
const defs = source.match(/<defs>[\s\S]*?<\/defs>/)[0];
const background = source.match(/<rect[\s\S]*?<\/rect>/)[0];
const artwork = source.slice(
  source.indexOf(background) + background.length,
  source.lastIndexOf("</svg>"),
);

// The artwork spans roughly y = -4..86 (outer ring top to tower base), so it
// is centred on y = 41 and scaled about the canvas middle.
const centred = (scale) =>
  `<g transform="translate(50 50) scale(${scale}) translate(-50 -41)">${artwork}</g>`;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${defs}${body}</svg>`;

function render(file, body, size) {
  const png = new Resvg(svg(body), { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
  writeFileSync(join(ASSETS, file), png);
  console.log(`wrote assets/${file} (${size}px)`);
}

// Android adaptive icons: launchers mask the foreground to a shape and only
// guarantee the centre 66% is visible, so the artwork is shrunk to 0.66.
render("android-icon-background.png", background, 1024);
render("android-icon-foreground.png", centred(0.66), 1024);
// Themed (Material You) icons use only the alpha channel of this layer.
render("android-icon-monochrome.png", centred(0.66), 1024);

// Splash: transparent white windmill, shown on the teal splash background.
render("splash-icon.png", centred(0.95), 1024);

// Web favicon: the full icon tile.
render("favicon.png", background + artwork, 48);
