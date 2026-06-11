import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintSkill } from '../scripts/lint-skills.mjs';

test('passes a skill with valid frontmatter', () => {
  const content = `---
name: example-skill
description: Use when doing X to accomplish Y.
---

# Example
Body.
`;
  const result = lintSkill('example-skill/SKILL.md', content);
  assert.deepEqual(result.errors, []);
});

test('flags missing name field', () => {
  const content = `---
description: Use when doing X.
---

# Example`;
  const result = lintSkill('example/SKILL.md', content);
  assert.ok(result.errors.some(e => e.includes('name')));
});

test('flags name that does not match directory', () => {
  const content = `---
name: wrong-name
description: Use when doing X.
---
`;
  const result = lintSkill('skills/example/SKILL.md', content);
  assert.ok(result.errors.some(e => e.includes('does not match directory')));
});

test('flags missing description', () => {
  const content = `---
name: example
---
`;
  const result = lintSkill('skills/example/SKILL.md', content);
  assert.ok(result.errors.some(e => e.includes('description')));
});

test('flags missing frontmatter entirely', () => {
  const result = lintSkill('skills/example/SKILL.md', '# No frontmatter here\nBody only.\n');
  assert.ok(result.errors.some(e => e.includes('missing YAML frontmatter')));
});

test('flags invalid YAML inside frontmatter', () => {
  const content = `---
name: [unclosed
description: x
---
`;
  const result = lintSkill('skills/example/SKILL.md', content);
  assert.ok(result.errors.some(e => e.includes('invalid YAML')));
});
