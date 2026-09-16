// ==UserScript==
// @name         SonarQube Issues Copier
// @namespace    sonarqube-issues-copier
// @version      0.0.0
// @author       Andy Hsu
// @description  Copy issues from SonarQube to clipboard
// @license      MIT
// @icon         https://sonarcloud.io/favicon.ico
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
	"use strict";
	var s = new Set();
	var _css = async (t) => {
		if (s.has(t)) return;
		s.add(t);
		((c) => {
			if (typeof GM_addStyle === "function") GM_addStyle(c);
			else (document.head || document.documentElement).appendChild(document.createElement("style")).append(c);
		})(t);
	};
	var _GM_setClipboard = (() => typeof GM_setClipboard != "undefined" ? GM_setClipboard : void 0)();
	_css(".sq-issues-copier{z-index:2147483646;color:#fff;cursor:pointer;background:#236a97;border:none;border-radius:999px;align-items:center;gap:8px;padding:10px 16px 10px 12px;font:600 13px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:inline-flex;position:fixed;bottom:20px;right:20px;box-shadow:0 4px 14px #236a9759}.sq-issues-copier:hover{background:#1b5579}.sq-issues-copier:focus-visible{outline-offset:3px;outline:2px solid #236a97}.sq-issues-copier:disabled{cursor:wait;opacity:.8}.sq-issues-copier[hidden]{display:none}.sq-issues-copier svg{flex-shrink:0;width:16px;height:16px}");
	function relativePath(issue) {
		const prefix = `${issue.project}:`;
		return issue.component.startsWith(prefix) ? issue.component.slice(prefix.length) : issue.component;
	}
	function formatPrompt(issues, meta) {
		const lines = [
			"Here are some issues found by a SonarQube scan. Please fix them.",
			"",
			`Project: ${meta.project}`
		];
		if (meta.branch) lines.push(`Branch: ${meta.branch}`);
		if (meta.truncated) lines.push(`Copied: ${meta.copied} / Total: ${meta.total ?? "?"} — truncated by API`);
		else lines.push(`Copied: ${meta.copied}`);
		lines.push("");
		const groups = new Map();
		for (const issue of issues) {
			const file = relativePath(issue);
			const list = groups.get(file) ?? [];
			list.push(issue);
			groups.set(file, list);
		}
		const files = [...groups.keys()].sort((a, b) => a.localeCompare(b));
		for (const file of files) {
			const group = groups.get(file);
			group.sort((a, b) => (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER));
			lines.push(`## ${file}`);
			for (const issue of group) {
				const loc = issue.line == null ? "L?" : `L${issue.line}`;
				const type = issue.type ?? "?";
				const severity = issue.severity ?? "?";
				lines.push(`- ${loc} [${type}/${severity}] ${issue.rule} — ${issue.message}`);
			}
			lines.push("");
		}
		return `${lines.join("\n").trimEnd()}\n`;
	}
	var IDLE = "复制 Issues";
	var COPY_ICON = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"/></svg>";
	var PAGE_SIZE = 500;
	var FILTER_KEYS = [
		"resolved",
		"types",
		"severities",
		"branch",
		"pullRequest",
		"organization",
		"assignedToMe",
		"inNewCodePeriod",
		"issueStatuses",
		"impactSeverities",
		"impactSoftwareQualities",
		"rules",
		"tags",
		"languages",
		"scopes",
		"assignees",
		"author"
	];
	var AuthError = class extends Error {
		constructor() {
			super("Unauthorized");
			this.name = "AuthError";
		}
	};
	function isSonarApp() {
		const instance = document.querySelector("[data-instance]")?.getAttribute("data-instance");
		if (instance === "SonarQube" || instance === "SonarCloud") return true;
		if (/SonarQube|SonarCloud/.test(document.title)) return true;
		for (const script of document.scripts) {
			const text = script.textContent;
			if (text && /window\.instance\s*=\s*['"]Sonar(?:Qube|Cloud)['"]/.test(text)) return true;
		}
		return false;
	}
	function isIssuesListPath(pathname) {
		const path = pathname.replace(/\/+$/, "");
		return path.endsWith("/project/issues") || path.endsWith("/issues");
	}
	function shouldShowButton() {
		return isSonarApp() && isIssuesListPath(location.pathname);
	}
	function apiRoot(pathname) {
		const path = pathname.replace(/\/+$/, "");
		if (path.endsWith("/project/issues")) return path.slice(0, -15);
		if (path.endsWith("/issues")) return path.slice(0, -7);
		return "";
	}
	function buildSearchParams(url) {
		const out = new URLSearchParams();
		const id = url.searchParams.get("id");
		if (id) out.set("componentKeys", id);
		for (const key of FILTER_KEYS) {
			const value = url.searchParams.get(key);
			if (value !== null && value !== "") out.set(key, value);
		}
		out.set("ps", String(PAGE_SIZE));
		return out;
	}
	async function fetchAllIssues(pathname, search, onProgress) {
		const issues = [];
		let total;
		let truncated = false;
		let page = 1;
		while (true) {
			search.set("p", String(page));
			let res;
			try {
				res = await fetch(`${apiRoot(pathname)}/api/issues/search?${search}`, { credentials: "include" });
			} catch (err) {
				if (issues.length === 0) throw err;
				truncated = true;
				break;
			}
			if (res.status === 401) throw new AuthError();
			if (!res.ok) {
				if (issues.length === 0) throw new Error(`HTTP ${res.status}`);
				truncated = true;
				break;
			}
			let data;
			try {
				data = await res.json();
			} catch (err) {
				if (issues.length === 0) throw err;
				truncated = true;
				break;
			}
			total = data.paging?.total ?? data.total ?? total;
			const batch = data.issues ?? [];
			issues.push(...batch);
			onProgress(issues.length, total);
			if (batch.length < PAGE_SIZE) break;
			if (total !== void 0 && issues.length >= total) break;
			page += 1;
		}
		if (total !== void 0 && issues.length < total) truncated = true;
		return {
			issues,
			total,
			truncated
		};
	}
	async function copyText(text) {
		try {
			_GM_setClipboard(text, "text");
		} catch {
			await navigator.clipboard.writeText(text);
		}
	}
	function onRouteChange(cb) {
		const wrap = (fn) => function(...args) {
			const ret = fn.apply(this, args);
			cb();
			return ret;
		};
		history.pushState = wrap(history.pushState);
		history.replaceState = wrap(history.replaceState);
		window.addEventListener("popstate", cb);
	}
	function setupButton() {
		let btn;
		let label;
		let busy = false;
		let resetTimer = 0;
		const setLabel = (text, revert = false) => {
			if (!label) return;
			label.textContent = text;
			window.clearTimeout(resetTimer);
			if (revert) resetTimer = window.setTimeout(() => {
				if (label) label.textContent = IDLE;
			}, 2e3);
		};
		const ensureButton = () => {
			if (btn) return btn;
			btn = document.createElement("button");
			btn.type = "button";
			btn.className = "sq-issues-copier";
			btn.innerHTML = `${COPY_ICON}<span>${IDLE}</span>`;
			label = btn.querySelector("span");
			document.documentElement.append(btn);
			btn.addEventListener("click", async () => {
				if (busy || !btn || btn.hidden) return;
				busy = true;
				btn.disabled = true;
				setLabel("正在拉取…");
				try {
					const url = new URL(location.href);
					const result = await fetchAllIssues(url.pathname, buildSearchParams(url), (copied, total) => {
						setLabel(total == null ? `正在拉取 ${copied}…` : `正在拉取 ${copied}/${total}…`);
					});
					const project = result.issues[0]?.project ?? url.searchParams.get("id") ?? "(unknown)";
					await copyText(formatPrompt(result.issues, {
						project,
						branch: url.searchParams.get("branch") ?? void 0,
						copied: result.issues.length,
						total: result.total,
						truncated: result.truncated
					}));
					setLabel(`已复制 ${result.issues.length} 条`, true);
				} catch (err) {
					setLabel(err instanceof AuthError ? "未登录 (401)" : "拉取失败", true);
				} finally {
					busy = false;
					if (btn) btn.disabled = false;
				}
			});
			return btn;
		};
		const syncVisibility = () => {
			if (!shouldShowButton()) {
				if (btn) btn.hidden = true;
				return;
			}
			ensureButton().hidden = false;
		};
		let watching = false;
		const start = () => {
			syncVisibility();
			if (!watching && isSonarApp()) {
				watching = true;
				onRouteChange(syncVisibility);
			}
		};
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
		else start();
	}
	setupButton();
})();
