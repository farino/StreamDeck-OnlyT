/**
 * Generate white-on-transparent PNG icons for Bell and Pause actions.
 * Action-list icons are 20×20 (@2x = 40×40). Bell strokes are ~4px at 1x.
 * Run: node scripts/generate-action-icons.mjs
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = join("com.farino.streamdeck-onlyt.sdPlugin", "imgs", "actions");

// Native 20×20 artwork — stroke-width 4 = 4px at the Stream Deck action size.
const ICONS = {
	bell: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
		<path fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"
			d="M5.5 9c0-2.6 2-4.8 4.5-4.8S14.5 6.4 14.5 9v3.2L16.5 15H3.5l2-2.8V9z"/>
		<path fill="none" stroke="white" stroke-width="4" stroke-linecap="round"
			d="M8 16.2c.8 1.4 3.2 1.4 4 0"/>
		<circle cx="10" cy="3.2" r="1.6" fill="white"/>
	</svg>`,
	pause: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
		<rect x="4" y="3" width="4" height="14" rx="1.2" fill="white"/>
		<rect x="12" y="3" width="4" height="14" rx="1.2" fill="white"/>
	</svg>`,
};

for (const [name, svg] of Object.entries(ICONS)) {
	const dir = join(ROOT, name);
	mkdirSync(dir, { recursive: true });
	const buf = Buffer.from(svg);
	await sharp(buf)
		.resize(20, 20, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toFile(join(dir, "icon.png"));
	await sharp(buf)
		.resize(40, 40, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toFile(join(dir, "icon@2x.png"));
	console.log(`Created ${dir}/icon.png (+ @2x)`);
}
