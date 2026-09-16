export type Issue = {
  component: string;
  project: string;
  line?: number;
  type?: string;
  severity?: string;
  rule: string;
  message: string;
};

export type PromptMeta = {
  project: string;
  branch?: string;
  copied: number;
  total?: number;
  truncated?: boolean;
};

export function relativePath(issue: Issue): string {
  const prefix = `${issue.project}:`;
  return issue.component.startsWith(prefix)
    ? issue.component.slice(prefix.length)
    : issue.component;
}

export function formatPrompt(issues: Issue[], meta: PromptMeta): string {
  const lines = [
    'Here are some issues found by a SonarQube scan. Please fix them.',
    '',
    `Project: ${meta.project}`,
  ];
  if (meta.branch) lines.push(`Branch: ${meta.branch}`);
  if (meta.truncated) {
    lines.push(
      `Copied: ${meta.copied} / Total: ${meta.total ?? '?'} — truncated by API`,
    );
  } else {
    lines.push(`Copied: ${meta.copied}`);
  }
  lines.push('');

  const groups = new Map<string, Issue[]>();
  for (const issue of issues) {
    const file = relativePath(issue);
    const list = groups.get(file) ?? [];
    list.push(issue);
    groups.set(file, list);
  }

  const files = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    const group = groups.get(file)!;
    group.sort((a, b) => (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER));
    lines.push(`## ${file}`);
    for (const issue of group) {
      const loc = issue.line == null ? 'L?' : `L${issue.line}`;
      const type = issue.type ?? '?';
      const severity = issue.severity ?? '?';
      lines.push(
        `- ${loc} [${type}/${severity}] ${issue.rule} — ${issue.message}`,
      );
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
