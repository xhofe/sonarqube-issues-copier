import { GM_setClipboard } from '$';
import './style.css';
import { formatPrompt, type Issue } from './format.ts';

const IDLE = '复制 Issues';
const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const PAGE_SIZE = 500;
const FILTER_KEYS = [
  'resolved',
  'types',
  'severities',
  'branch',
  'pullRequest',
  'organization',
  'assignedToMe',
  'inNewCodePeriod',
  'issueStatuses',
  'impactSeverities',
  'impactSoftwareQualities',
  'rules',
  'tags',
  'languages',
  'scopes',
  'assignees',
  'author',
] as const;

type SearchResponse = {
  total?: number;
  paging?: { total?: number };
  issues?: Issue[];
};

class AuthError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'AuthError';
  }
}

function isSonarApp(): boolean {
  const instance = document
    .querySelector('[data-instance]')
    ?.getAttribute('data-instance');
  if (instance === 'SonarQube' || instance === 'SonarCloud') return true;
  if (/SonarQube|SonarCloud/.test(document.title)) return true;
  for (const script of document.scripts) {
    const text = script.textContent;
    if (text && /window\.instance\s*=\s*['"]Sonar(?:Qube|Cloud)['"]/.test(text)) {
      return true;
    }
  }
  return false;
}

function isIssuesListPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '');
  return path.endsWith('/project/issues') || path.endsWith('/issues');
}

function shouldShowButton(): boolean {
  return isSonarApp() && isIssuesListPath(location.pathname);
}

function apiRoot(pathname: string): string {
  const path = pathname.replace(/\/+$/, '');
  if (path.endsWith('/project/issues')) {
    return path.slice(0, -'/project/issues'.length);
  }
  if (path.endsWith('/issues')) {
    return path.slice(0, -'/issues'.length);
  }
  return '';
}

function buildSearchParams(url: URL): URLSearchParams {
  const out = new URLSearchParams();
  const id = url.searchParams.get('id');
  if (id) out.set('componentKeys', id);
  for (const key of FILTER_KEYS) {
    const value = url.searchParams.get(key);
    if (value !== null && value !== '') out.set(key, value);
  }
  out.set('ps', String(PAGE_SIZE));
  return out;
}

async function fetchAllIssues(
  pathname: string,
  search: URLSearchParams,
  onProgress: (copied: number, total?: number) => void,
): Promise<{ issues: Issue[]; total?: number; truncated: boolean }> {
  const issues: Issue[] = [];
  let total: number | undefined;
  let truncated = false;
  let page = 1;

  while (true) {
    search.set('p', String(page));
    let res: Response;
    try {
      res = await fetch(`${apiRoot(pathname)}/api/issues/search?${search}`, {
        credentials: 'include',
      });
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

    let data: SearchResponse;
    try {
      data = (await res.json()) as SearchResponse;
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
    if (total !== undefined && issues.length >= total) break;
    page += 1;
  }

  if (total !== undefined && issues.length < total) truncated = true;
  return { issues, total, truncated };
}

async function copyText(text: string): Promise<void> {
  try {
    GM_setClipboard(text, 'text');
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

function onRouteChange(cb: () => void): void {
  const wrap =
    (fn: History['pushState']): History['pushState'] =>
    function (this: History, ...args: Parameters<History['pushState']>) {
      const ret = fn.apply(this, args);
      cb();
      return ret;
    };
  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
  window.addEventListener('popstate', cb);
}

function setupButton(): void {
  let btn: HTMLButtonElement | undefined;
  let label: HTMLSpanElement | undefined;
  let busy = false;
  let resetTimer = 0;

  const setLabel = (text: string, revert = false) => {
    if (!label) return;
    label.textContent = text;
    window.clearTimeout(resetTimer);
    if (revert) {
      resetTimer = window.setTimeout(() => {
        if (label) label.textContent = IDLE;
      }, 2000);
    }
  };

  const ensureButton = () => {
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sq-issues-copier';
    btn.innerHTML = `${COPY_ICON}<span>${IDLE}</span>`;
    label = btn.querySelector('span')!;
    document.documentElement.append(btn);

    btn.addEventListener('click', async () => {
      if (busy || !btn || btn.hidden) return;
      busy = true;
      btn.disabled = true;
      setLabel('正在拉取…');
      try {
        const url = new URL(location.href);
        const result = await fetchAllIssues(
          url.pathname,
          buildSearchParams(url),
          (copied, total) => {
            setLabel(
              total == null
                ? `正在拉取 ${copied}…`
                : `正在拉取 ${copied}/${total}…`,
            );
          },
        );
        const project =
          result.issues[0]?.project ?? url.searchParams.get('id') ?? '(unknown)';
        const text = formatPrompt(result.issues, {
          project,
          branch: url.searchParams.get('branch') ?? undefined,
          copied: result.issues.length,
          total: result.total,
          truncated: result.truncated,
        });
        await copyText(text);
        setLabel(`已复制 ${result.issues.length} 条`, true);
      } catch (err) {
        setLabel(err instanceof AuthError ? '未登录 (401)' : '拉取失败', true);
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

setupButton();
