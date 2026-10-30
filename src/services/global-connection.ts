import streamDeck from "@elgato/streamdeck";

import {
	type PluginGlobalSettings,
	type ConnectionSettings,
} from "../types";
import {
	extractLegacyConnection,
	hasConfiguredGlobalConnection,
	majorityConnection,
} from "../utils/connection-settings";
import { applyPluginConnection } from "./plugin-connection";

const MIGRATION_DEBOUNCE_MS = 800;

const legacyCandidates: ConnectionSettings[] = [];
/** Callbacks that remove legacy host/port/api from an instance once global settings own them. */
const pendingStrips = new Set<() => void>();
let migrationTimer: NodeJS.Timeout | null = null;
let globalLoaded = false;

export function applyGlobalSettingsPayload(
	raw: Record<string, unknown> | undefined,
): void {
	if (hasConfiguredGlobalConnection(raw)) {
		applyPluginConnection({
			host: raw?.host as string | undefined,
			port: raw?.port as number | string | undefined,
			apiCode: raw?.apiCode as string | undefined,
		});
	}
}

export async function loadGlobalConnectionSettings(): Promise<void> {
	if (globalLoaded) return;
	globalLoaded = true;

	const global =
		await streamDeck.settings.getGlobalSettings<PluginGlobalSettings>();
	applyGlobalSettingsPayload(global as Record<string, unknown>);
}

/**
 * An action instance still carries legacy host/port/api. Use it as a vote for
 * the global profile and remove it from the instance (via `strip`) afterwards.
 */
export function registerLegacyConnection(
	raw: Record<string, unknown> | undefined,
	strip: () => void,
): void {
	const legacy = extractLegacyConnection(raw);
	if (!legacy) return;

	legacyCandidates.push(legacy);
	pendingStrips.add(strip);
	void applyLegacyFallbackUntilMigrated();
	scheduleConnectionMigration();
}

/** Keep OnlyT online using legacy instance settings until global migration finishes. */
async function applyLegacyFallbackUntilMigrated(): Promise<void> {
	const global =
		await streamDeck.settings.getGlobalSettings<PluginGlobalSettings>();
	if (hasConfiguredGlobalConnection(global as Record<string, unknown>)) {
		return;
	}

	const picked = majorityConnection(legacyCandidates);
	if (picked) {
		applyPluginConnection(picked);
	}
}

function scheduleConnectionMigration(): void {
	if (migrationTimer) {
		clearTimeout(migrationTimer);
	}
	migrationTimer = setTimeout(() => {
		void runConnectionMigration();
	}, MIGRATION_DEBOUNCE_MS);
}

async function runConnectionMigration(): Promise<void> {
	const global =
		await streamDeck.settings.getGlobalSettings<PluginGlobalSettings>();
	const globalRecord = global as Record<string, unknown>;

	if (!hasConfiguredGlobalConnection(globalRecord)) {
		const picked = majorityConnection(legacyCandidates);
		if (!picked) return;

		const payload: PluginGlobalSettings = {
			...picked,
			connectionMigrated: true,
		};

		await streamDeck.settings.setGlobalSettings(payload);
		applyPluginConnection(payload);
		streamDeck.logger.info(
			`Migrated OnlyT connection to global settings (host=${payload.host}, port=${payload.port})`,
		);
	} else {
		applyGlobalSettingsPayload(globalRecord);
	}

	flushPendingStrips();
}

function flushPendingStrips(): void {
	const strips = [...pendingStrips];
	pendingStrips.clear();
	legacyCandidates.length = 0;
	for (const strip of strips) {
		strip();
	}
}
