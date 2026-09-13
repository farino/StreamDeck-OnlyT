import { execFile } from "child_process";
import { join, dirname } from "path";
import streamDeck from "@elgato/streamdeck";

export type JWTarget = "PersonalStudy" | "Meetings";

export type JWNavigateResult =
	| "OK"
	| "NOT_RUNNING"
	| "WINDOW_NOT_FOUND"
	| "CONTROL_NOT_FOUND"
	| "ERROR";

/**
 * Resolve the path to jw-navigate.ps1 relative to the compiled plugin.js.
 * At runtime, plugin.js and jw-navigate.ps1 both live in the same bin/
 * directory inside the .sdPlugin folder.
 */
function scriptPath(): string {
	return join(dirname(process.argv[1] ?? __filename), "jw-navigate.ps1");
}

/**
 * Invoke the JW Library navigation PowerShell script.
 * Returns a result string indicating success or the specific failure mode.
 */
export function navigateJWLibrary(target: JWTarget): Promise<JWNavigateResult> {
	return new Promise((resolve) => {
		const ps1 = scriptPath();

		streamDeck.logger.info(`JW navigate: target=${target}, script=${ps1}`);

		execFile(
			"powershell.exe",
			["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Target", target],
			{ timeout: 10_000, windowsHide: true },
			(err, stdout, stderr) => {
				const output = (stdout ?? "").trim();

				if (err) {
					streamDeck.logger.warn(
						`JW navigate failed: exit=${(err as NodeJS.ErrnoException).code ?? "?"}, ` +
						`stdout="${output}", stderr="${(stderr ?? "").trim()}"`,
					);

					if (output === "NOT_RUNNING") {
						resolve("NOT_RUNNING");
					} else if (output === "WINDOW_NOT_FOUND") {
						resolve("WINDOW_NOT_FOUND");
					} else if (output.startsWith("CONTROL_NOT_FOUND") || output.startsWith("INVOKE_FAILED")) {
						resolve("CONTROL_NOT_FOUND");
					} else {
						resolve("ERROR");
					}
					return;
				}

				streamDeck.logger.info(`JW navigate OK: ${output}`);
				resolve("OK");
			},
		);
	});
}
