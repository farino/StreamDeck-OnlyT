/**
 * Generates the final PNG icon set for the Stream Deck plugin manifest from
 * the artwork sources in `assets/icons/`.
 *
 * Sources (provided by the designer, committed alongside the code):
 *   assets/icons/ActionIcon20.png   (~20x20)  -> action list icon
 *   assets/icons/ActionIcon40.png   (~40x40)  -> action list icon @2x
 *   assets/icons/Category28.png     (~28x28)  -> plugin category icon
 *   assets/icons/Category56.png     (~56x56)  -> plugin category icon @2x
 *   assets/icons/Thumbnail.png      (>=288)   -> key image + Marketplace tile
 *   assets/icons/Wallpaper.png      (1920x960)-> Marketplace listing hero (used
 *                                                for docs/ upload, not bundled)
 *
 * Elgato enforces exact dimensions for each output, so every source is passed
 * through sharp with `fit: "contain"` on a transparent background to guarantee
 * the target size while preserving the artwork's aspect ratio.
 *
 * Run with: npm run icons
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";

const SD_PLUGIN = "com.farino.streamdeck-onlyt.sdPlugin";
const IMG_ROOT = join(SD_PLUGIN, "imgs");
const SRC_ROOT = join("assets", "icons");

const SOURCES = {
	actionIcon20: join(SRC_ROOT, "ActionIcon20.png"),
	actionIcon40: join(SRC_ROOT, "ActionIcon40.png"),
	category28: join(SRC_ROOT, "Category28.png"),
	category56: join(SRC_ROOT, "Category56.png"),
	thumbnail: join(SRC_ROOT, "Thumbnail.png"),
};

/**
 * Each entry describes one final PNG that Stream Deck / Marketplace expects.
 * `transparent` controls the background used when `fit: "contain"` letterboxes
 * a source of a different aspect ratio.
 */
const outputs = [
	// Action list icon (shown in the Stream Deck app's actions sidebar).
	{ src: SOURCES.actionIcon20, out: join(IMG_ROOT, "actions/timer/icon.png"), w: 20, h: 20, transparent: true },
	{ src: SOURCES.actionIcon40, out: join(IMG_ROOT, "actions/timer/icon@2x.png"), w: 40, h: 40, transparent: true },

	// Key artwork (shown on the physical Stream Deck key before setImage kicks
	// in and any time the plugin is not actively rendering). We use the coloured
	// Thumbnail so the key stays visible on the device's black background.
	{ src: SOURCES.thumbnail, out: join(IMG_ROOT, "actions/timer/key.png"), w: 72, h: 72, transparent: false },
	{ src: SOURCES.thumbnail, out: join(IMG_ROOT, "actions/timer/key@2x.png"), w: 144, h: 144, transparent: false },

	// Plugin category icon (shown as the section header in the actions list).
	{ src: SOURCES.category28, out: join(IMG_ROOT, "plugin/category-icon.png"), w: 28, h: 28, transparent: true },
	{ src: SOURCES.category56, out: join(IMG_ROOT, "plugin/category-icon@2x.png"), w: 56, h: 56, transparent: true },

	// Plugin / Marketplace tile icon (manifest `Icon` field).
	{ src: SOURCES.thumbnail, out: join(IMG_ROOT, "plugin/marketplace.png"), w: 288, h: 288, transparent: false },
	{ src: SOURCES.thumbnail, out: join(IMG_ROOT, "plugin/marketplace@2x.png"), w: 576, h: 576, transparent: false },
];

for (const { src, out, w, h, transparent } of outputs) {
	if (!existsSync(src)) {
		throw new Error(`Missing source asset: ${src}`);
	}
	ensureDir(out);

	const buffer = readFileSync(src);
	const pipeline = sharp(buffer).resize(w, h, {
		fit: "contain",
		background: transparent
			? { r: 0, g: 0, b: 0, alpha: 0 }
			: { r: 0, g: 0, b: 0, alpha: 1 },
	});

	if (transparent) {
		await pipeline.png({ compressionLevel: 9, palette: false }).toFile(out);
	} else {
		await pipeline.flatten({ background: "#000000" }).png({ compressionLevel: 9 }).toFile(out);
	}

	console.log(`Created ${out} (${w}x${h})`);
}

console.log("\nDone. All PNG icons regenerated from assets/icons/*.png.");

// -----------------------------------------------------------------------------
// Helpers.
// -----------------------------------------------------------------------------

function ensureDir(filePath) {
	const dir = dirname(filePath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
