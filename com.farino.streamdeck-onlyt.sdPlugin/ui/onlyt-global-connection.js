/**
 * Plugin-wide settings shared by every action's property inspector
 * (Stream Deck GLOBAL settings, never per-action settings):
 *  - OnlyT connection: Host / Port / API Code
 *  - OnlyT main window lock: prevent resizing + keep on one monitor
 * Renders into #onlyt-connection. Editing in one inspector updates the rest.
 */
(function (global) {
	const DEFAULTS = { host: "127.0.0.1", port: 8096, apiCode: "" };
	const PI_EVENT_GET_MONITORS = "onlytGetMonitors";
	const PI_EVENT_MONITORS = "onlytMonitors";

	let pluginUuid = "";
	let actionUuid = "";
	let ws = null;
	/** Last full global settings object from Stream Deck (kept so saves merge, never overwrite). */
	let lastGlobal = {};
	let settings = { host: "", port: "", apiCode: "" };
	let lock = { enabled: false, monitor: "" };
	let monitors = [];
	let monitorsReceived = false;

	const TEMPLATE =
		'<div class="sdpi-heading">OnlyT connection (all actions)</div>' +
		'<div class="sdpi-hint onlyt-global-hint">Shared by every action in this plugin. Changing it here updates all of them.</div>' +
		'<div class="sdpi-item"><label for="onlytHost">Host</label>' +
		'<input type="text" id="onlytHost" placeholder="localhost" /></div>' +
		'<div class="sdpi-hint">Enter &ldquo;localhost&rdquo; or the IP address of the OnlyT machine.</div>' +
		'<div class="sdpi-item"><label for="onlytPort">Port</label>' +
		'<input type="number" id="onlytPort" min="8096" max="8224" placeholder="8096" /></div>' +
		'<div class="sdpi-hint">Open the port in OnlyT and allow it through your firewall. Default: 8096 (8096&ndash;8224).</div>' +
		'<div class="sdpi-item"><label for="onlytApiCode">API Code</label>' +
		'<input type="text" id="onlytApiCode" placeholder="Optional" /></div>' +
		'<div class="sdpi-hint">Only needed if OnlyT has an API code configured.</div>' +
		'<div class="sdpi-item"><label></label>' +
		'<button type="button" id="onlytClear" class="sdpi-button">Clear</button></div>' +
		'<div class="sdpi-status"><span class="status-dot" id="onlytStatusDot"></span>' +
		'<span id="onlytStatusText">Checking connection...</span></div>' +
		'<div class="sdpi-heading">OnlyT window (all actions)</div>' +
		'<div class="sdpi-item sdpi-item-checkbox"><label for="onlytLockWindow">Lock window</label>' +
		'<input type="checkbox" id="onlytLockWindow" /></div>' +
		'<div class="sdpi-hint">Size and place the OnlyT control window first, then tick Lock: the user can no longer resize or move it. If a monitor is chosen below, the window is placed on it first. Only works while Stream Deck is running and OnlyT is not run as administrator.</div>' +
		'<div class="sdpi-item"><label for="onlytLockMonitor">Monitor</label>' +
		'<select id="onlytLockMonitor"><option value="">Any monitor (lock size only)</option></select></div>' +
		'<div class="sdpi-item"><label for="onlytLockScreenNo">Screen no.</label>' +
		'<input type="number" id="onlytLockScreenNo" min="1" max="16" placeholder="e.g. 2" /></div>' +
		'<div class="sdpi-hint">Or type the screen number (1, 2, 3, 4...) as shown in Windows display settings. Leave empty for any monitor.</div>' +
		'<div class="sdpi-item"><label></label>' +
		'<button type="button" id="onlytRefreshMonitors" class="sdpi-button">Refresh monitors</button></div>' +
		'<div class="sdpi-hint" id="onlytMonitorStatus"></div>';

	function el(id) {
		return document.getElementById(id);
	}

	function render() {
		const root = el("onlyt-connection");
		if (root && !el("onlytHost")) {
			root.className = "onlyt-connection-section";
			root.innerHTML = TEMPLATE;
		}
	}

	function populateFields() {
		if (!el("onlytHost")) return;
		const active = document.activeElement;
		const set = function (id, value) {
			const input = el(id);
			if (input && input !== active) input.value = value == null ? "" : value;
		};
		set("onlytHost", settings.host);
		set("onlytPort", settings.port);
		set("onlytApiCode", settings.apiCode);
		el("onlytLockWindow").checked = lock.enabled;
		populateMonitors();
	}

	function populateMonitors() {
		const select = el("onlytLockMonitor");
		if (!select) return;

		select.innerHTML = "";
		const any = document.createElement("option");
		any.value = "";
		any.textContent = "Any monitor (lock size only)";
		select.appendChild(any);

		let found = lock.monitor === "";
		monitors.forEach(function (m) {
			const opt = document.createElement("option");
			opt.value = m.deviceName;
			opt.textContent = m.label;
			select.appendChild(opt);
			if (m.deviceName === lock.monitor) found = true;
		});

		// Keep a saved monitor selectable even if it is currently unplugged.
		if (!found) {
			const opt = document.createElement("option");
			opt.value = lock.monitor;
			opt.textContent = lock.monitor + " (not connected)";
			select.appendChild(opt);
		}
		select.value = lock.monitor;

		const screenNo = el("onlytLockScreenNo");
		if (screenNo && screenNo !== document.activeElement) {
			screenNo.value = screenNumberOf(lock.monitor);
		}
	}

	/** "\\.\DISPLAY2" -> "2" (empty when no monitor is chosen). */
	function screenNumberOf(deviceName) {
		const match = /(\d+)$/.exec(deviceName || "");
		return match ? match[1] : "";
	}

	/** 2 -> "\\.\DISPLAY2" */
	function deviceNameForScreen(number) {
		return number > 0 ? "\\\\.\\DISPLAY" + number : "";
	}

	/** Merge `changes` into the last known global settings and persist them. */
	function sendGlobal(changes) {
		if (!ws || ws.readyState !== WebSocket.OPEN || !pluginUuid) return;
		lastGlobal = Object.assign({}, lastGlobal, changes);
		ws.send(
			JSON.stringify({
				event: "setGlobalSettings",
				context: pluginUuid,
				payload: lastGlobal,
			}),
		);
	}

	function sendConnection() {
		sendGlobal({
			host: settings.host,
			port: settings.port,
			apiCode: settings.apiCode,
			connectionMigrated: true,
		});
	}

	function readFields() {
		settings.host = el("onlytHost").value.trim();
		const portText = el("onlytPort").value.trim();
		settings.port = portText ? parseInt(portText, 10) || "" : "";
		settings.apiCode = el("onlytApiCode").value;
	}

	function onFieldChanged() {
		readFields();
		sendConnection();
		testConnection();
	}

	function onClear() {
		settings = { host: "", port: "", apiCode: "" };
		el("onlytHost").value = "";
		el("onlytPort").value = "";
		el("onlytApiCode").value = "";
		sendConnection();
		testConnection();
	}

	function saveLock() {
		sendGlobal({ lockMainWindow: lock.enabled, lockMonitor: lock.monitor });
		populateMonitors();
	}

	function onLockToggled() {
		lock.enabled = el("onlytLockWindow").checked;
		saveLock();
	}

	/** Monitor picked from the dropdown. */
	function onMonitorSelected() {
		lock.monitor = el("onlytLockMonitor").value;
		saveLock();
	}

	/** Screen number typed as a fallback when the list is empty or wrong. */
	function onScreenNumberTyped() {
		const number = parseInt(el("onlytLockScreenNo").value, 10);
		lock.monitor = deviceNameForScreen(number);
		saveLock();
	}

	function setMonitorStatus(text) {
		const status = el("onlytMonitorStatus");
		if (status) status.textContent = text;
	}

	function requestMonitors() {
		if (!ws || ws.readyState !== WebSocket.OPEN || !actionUuid) return;
		monitorsReceived = false;
		setMonitorStatus("Loading monitors...");
		setTimeout(function () {
			if (!monitorsReceived) {
				setMonitorStatus("Could not read the monitor list - type the screen number instead.");
			}
		}, 4000);
		ws.send(
			JSON.stringify({
				event: "sendToPlugin",
				action: actionUuid,
				context: pluginUuid,
				payload: { event: PI_EVENT_GET_MONITORS },
			}),
		);
	}

	function testConnection() {
		const dot = el("onlytStatusDot");
		const text = el("onlytStatusText");
		if (!dot || !text) return;

		const host = settings.host || DEFAULTS.host;
		const port = settings.port || DEFAULTS.port;

		dot.className = "status-dot";
		text.textContent = "Checking connection...";

		fetch("http://" + host + ":" + port + "/api/v4/system/", {
			method: "GET",
			headers: settings.apiCode ? { ApiCode: settings.apiCode } : {},
		})
			.then(function (res) {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.json();
			})
			.then(function (data) {
				dot.className = "status-dot online";
				text.textContent = "Connected \u2014 OnlyT v" + ((data && data.onlyTVersion) || "?");
			})
			.catch(function () {
				dot.className = "status-dot offline";
				text.textContent = "Cannot reach OnlyT at " + host + ":" + port;
			});
	}

	function onMessage(data) {
		if (data.event === "didReceiveGlobalSettings" && data.payload) {
			const incoming = data.payload.settings || {};
			lastGlobal = Object.assign({}, incoming);
			settings = {
				host: incoming.host || "",
				port: incoming.port || "",
				apiCode: incoming.apiCode || "",
			};
			lock = {
				enabled: incoming.lockMainWindow === true,
				monitor: incoming.lockMonitor || "",
			};
			populateFields();
			testConnection();
		} else if (data.event === "sendToPropertyInspector" && data.payload && data.payload.event === PI_EVENT_MONITORS) {
			monitors = data.payload.monitors || [];
			monitorsReceived = true;
			setMonitorStatus(monitors.length ? "" : "No monitors reported - type the screen number instead.");
			populateMonitors();
		}
	}

	function actionUuidFromInfo(inActionInfo) {
		try {
			return JSON.parse(inActionInfo || "{}").action || "";
		} catch (_e) {
			return "";
		}
	}

	function wirePropertyInspector(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo, options) {
		// Global settings commands from a property inspector use the PI's own
		// registration UUID as context (not the manifest plugin id).
		pluginUuid = inPropertyInspectorUUID;
		actionUuid = actionUuidFromInfo(inActionInfo);
		render();

		el("onlytHost").addEventListener("change", onFieldChanged);
		el("onlytPort").addEventListener("change", onFieldChanged);
		el("onlytApiCode").addEventListener("change", onFieldChanged);
		el("onlytClear").addEventListener("click", onClear);
		el("onlytLockWindow").addEventListener("change", onLockToggled);
		el("onlytLockMonitor").addEventListener("change", onMonitorSelected);
		el("onlytLockScreenNo").addEventListener("change", onScreenNumberTyped);
		el("onlytRefreshMonitors").addEventListener("click", requestMonitors);

		ws = new WebSocket("ws://127.0.0.1:" + inPort);

		ws.onopen = function () {
			ws.send(JSON.stringify({ event: inRegisterEvent, uuid: inPropertyInspectorUUID }));
			ws.send(JSON.stringify({ event: "getGlobalSettings", context: pluginUuid }));
			requestMonitors();
			if (options && typeof options.onOpen === "function") {
				options.onOpen(ws);
			}
		};

		ws.onmessage = function (evt) {
			const data = JSON.parse(evt.data);
			onMessage(data);
			if (options && typeof options.onMessage === "function") {
				options.onMessage(data, ws);
			}
		};

		return ws;
	}

	global.OnlyTGlobalConnection = { wirePropertyInspector: wirePropertyInspector };
})(window);
