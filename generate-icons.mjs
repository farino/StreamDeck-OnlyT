/**
 * Generates PNG icons for the Stream Deck plugin manifest from the SVG sources.
 *
 * - Action / category icons use a white line-art clock at their native size and
 *   are rendered on a transparent background, matching Marketplace convention.
 * - The marketplace hero image uses a coloured branded SVG.
 *
 * Run with: npm run icons
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";

const SD_PLUGIN = "com.farino.streamdeck-onlyt.sdPlugin";
const IMG_ROOT = join(SD_PLUGIN, "imgs");
const SVG_SRC_ROOT = join("assets", "icons");

// -----------------------------------------------------------------------------
// SVG sources (updated to white line-art on transparent backgrounds).
// -----------------------------------------------------------------------------

const CLOCK_SVG_20 = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
	<circle cx="10" cy="11" r="7.5" fill="none" stroke="#ffffff" stroke-width="1.4"/>
	<line x1="10" y1="11" x2="10" y2="6.5" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>
	<line x1="10" y1="11" x2="13.5" y2="11" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>
	<line x1="8" y1="2" x2="12" y2="2" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

const CLOCK_SVG_72 = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
	<circle cx="36" cy="40" r="26" fill="none" stroke="#ffffff" stroke-width="3.5"/>
	<line x1="36" y1="40" x2="36" y2="24" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
	<line x1="36" y1="40" x2="49" y2="40" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
	<line x1="28" y1="8" x2="44" y2="8" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
	<line x1="36" y1="6" x2="36" y2="12" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
</svg>`;

const CLOCK_SVG_28 = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
	<circle cx="14" cy="16" r="9.5" fill="none" stroke="#ffffff" stroke-width="1.6"/>
	<line x1="14" y1="16" x2="14" y2="9" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
	<line x1="14" y1="16" x2="19" y2="16" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
	<line x1="10" y1="3.5" x2="18" y2="3.5" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

const MARKETPLACE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="294" height="226" viewBox="0 0 294 226">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#1e272e"/>
			<stop offset="1" stop-color="#0d1418"/>
		</linearGradient>
	</defs>
	<rect width="294" height="226" rx="18" fill="url(#bg)"/>
	<circle cx="147" cy="92" r="52" fill="none" stroke="#00d084" stroke-width="5"/>
	<line x1="147" y1="92" x2="147" y2="55" stroke="#00d084" stroke-width="5" stroke-linecap="round"/>
	<line x1="147" y1="92" x2="180" y2="92" stroke="#00d084" stroke-width="5" stroke-linecap="round"/>
	<line x1="128" y1="30" x2="166" y2="30" stroke="#00d084" stroke-width="6" stroke-linecap="round"/>
	<line x1="147" y1="26" x2="147" y2="34" stroke="#00d084" stroke-width="6" stroke-linecap="round"/>
	<text x="147" y="180" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="bold" fill="#ffffff">Meeting Timer</text>
	<text x="147" y="204" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="#a0b0b8">for OnlyT</text>
</svg>`;

// -----------------------------------------------------------------------------
// Persist SVG sources so they stay in sync with the PNG output.
// -----------------------------------------------------------------------------

const svgSources = [
	{ path: join(SVG_SRC_ROOT, "icon.svg"), svg: CLOCK_SVG_20 },
	{ path: join(SVG_SRC_ROOT, "icon@2x.svg"), svg: CLOCK_SVG_20 },
	{ path: join(SVG_SRC_ROOT, "key.svg"), svg: CLOCK_SVG_72 },
	{ path: join(SVG_SRC_ROOT, "key@2x.svg"), svg: CLOCK_SVG_72 },
	{ path: join(SVG_SRC_ROOT, "category-icon.svg"), svg: CLOCK_SVG_28 },
	{ path: join(SVG_SRC_ROOT, "category-icon@2x.svg"), svg: CLOCK_SVG_28 },
	{ path: join(SVG_SRC_ROOT, "marketplace.svg"), svg: MARKETPLACE_SVG },
];

for (const { path, svg } of svgSources) {
	ensureDir(path);
	writeFileSync(path, svg + "\n");
}

// -----------------------------------------------------------------------------
// PNG outputs.
// -----------------------------------------------------------------------------

const pngs = [
	{ svg: CLOCK_SVG_20, out: join(IMG_ROOT, "actions/timer/icon.png"), w: 20, h: 20, transparent: true },
	{ svg: CLOCK_SVG_20, out: join(IMG_ROOT, "actions/timer/icon@2x.png"), w: 40, h: 40, transparent: true },
	{ svg: CLOCK_SVG_72, out: join(IMG_ROOT, "actions/timer/key.png"), w: 72, h: 72, transparent: true },
	{ svg: CLOCK_SVG_72, out: join(IMG_ROOT, "actions/timer/key@2x.png"), w: 144, h: 144, transparent: true },
	{ svg: CLOCK_SVG_28, out: join(IMG_ROOT, "plugin/category-icon.png"), w: 28, h: 28, transparent: true },
	{ svg: CLOCK_SVG_28, out: join(IMG_ROOT, "plugin/category-icon@2x.png"), w: 56, h: 56, transparent: true },
	{ svg: MARKETPLACE_SVG, out: join(IMG_ROOT, "plugin/marketplace.png"), w: 294, h: 226, transparent: false },
	{ svg: MARKETPLACE_SVG, out: join(IMG_ROOT, "plugin/marketplace@2x.png"), w: 588, h: 452, transparent: false },
];

for (const { svg, out, w, h, transparent } of pngs) {
	ensureDir(out);
	const pipeline = sharp(Buffer.from(svg))
		.resize(w, h, {
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		});

	if (!transparent) {
		// Marketplace hero already has its own background; flatten just in case.
		await pipeline.png({ compressionLevel: 9 }).toFile(out);
	} else {
		await pipeline.png({ compressionLevel: 9, palette: false }).toFile(out);
	}

	console.log(`Created ${out} (${w}x${h})`);
}

console.log("\nDone. All PNG icons regenerated from SVG sources.");

// -----------------------------------------------------------------------------
// Helpers.
// -----------------------------------------------------------------------------

function ensureDir(filePath) {
	const dir = dirname(filePath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
