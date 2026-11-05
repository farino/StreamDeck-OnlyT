import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Static tile images as data URIs (same layout as the JW Library plugin).
 * Plugin layout: <root>/bin/plugin.js → tiles in <root>/imgs/tiles/
 */
export type TileName = "Offline";

function pluginRootDir(): string {
	const binDir = dirname(process.argv[1] ?? "");
	return join(binDir, "..");
}

const TILES_DIR = join(pluginRootDir(), "imgs", "tiles");

const cache = new Map<string, string>();

function loadTile(fileName: string): string {
	const cached = cache.get(fileName);
	if (cached) return cached;

	const pngPath = join(TILES_DIR, `${fileName}.png`);
	const svgPath = join(TILES_DIR, `${fileName}.svg`);

	if (existsSync(pngPath)) {
		const uri = `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`;
		cache.set(fileName, uri);
		return uri;
	}
	if (existsSync(svgPath)) {
		const uri = `data:image/svg+xml,${encodeURIComponent(readFileSync(svgPath, "utf8"))}`;
		cache.set(fileName, uri);
		return uri;
	}
	throw new Error(`Tile image not found: ${fileName} in ${TILES_DIR}`);
}

export function tileImage(name: TileName): string {
	return loadTile(name);
}
