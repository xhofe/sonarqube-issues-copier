import assert from 'node:assert/strict';
import { formatPrompt, type Issue } from './format.ts';

const issues: Issue[] = [
  {
    project: 'my-project',
    component: 'my-project:src/foo.ts',
    line: 88,
    type: 'CODE_SMELL',
    severity: 'MINOR',
    rule: 'javascript:S1481',
    message: 'Remove this unused import',
  },
  {
    project: 'my-project',
    component: 'my-project:src/bar.ts',
    line: 10,
    type: 'VULNERABILITY',
    severity: 'CRITICAL',
    rule: 'javascript:S2076',
    message: 'OS command injection',
  },
  {
    project: 'my-project',
    component: 'my-project:src/foo.ts',
    line: 42,
    type: 'BUG',
    severity: 'MAJOR',
    rule: 'javascript:S1234',
    message: 'Null pointers should not be dereferenced',
  },
  {
    project: 'my-project',
    component: 'my-project:src/foo.ts',
    type: 'BUG',
    severity: 'MAJOR',
    rule: 'javascript:S1',
    message: 'no line',
  },
];

const text = formatPrompt(issues, {
  project: 'my-project',
  branch: 'main',
  copied: issues.length,
});

assert.ok(
  text.startsWith(
    'Here are some issues found by a SonarQube scan. Please fix them.\n',
  ),
);
assert.ok(text.includes('Project: my-project'));
assert.ok(text.includes('Branch: main'));
assert.ok(text.includes('Copied: 4'));
assert.ok(!text.includes('truncated'));
assert.ok(text.indexOf('## src/bar.ts') < text.indexOf('## src/foo.ts'));
assert.ok(!text.includes('my-project:src/'));
assert.ok(text.includes('## src/foo.ts'));
assert.ok(
  text.includes(
    '- L42 [BUG/MAJOR] javascript:S1234 — Null pointers should not be dereferenced',
  ),
);

const foo = text.slice(text.indexOf('## src/foo.ts'));
assert.ok(foo.indexOf('L42') < foo.indexOf('L88'));
assert.ok(foo.indexOf('L88') < foo.indexOf('L?'));

const truncated = formatPrompt(issues, {
  project: 'my-project',
  copied: 10000,
  total: 15230,
  truncated: true,
});
assert.equal(
  truncated.includes('Copied: 10000 / Total: 15230 — truncated by API'),
  true,
);

console.log('ok');
