import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import yaml from 'js-yaml';

export function lintSkill(path, content) {
  const errors = [];
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    errors.push(`${path}: missing YAML frontmatter`);
    return { errors };
  }
  let fm;
  try {
    fm = yaml.load(match[1]);
  } catch (e) {
    errors.push(`${path}: invalid YAML in frontmatter: ${e.message}`);
    return { errors };
  }
  if (!fm || typeof fm.name !== 'string' || fm.name.length === 0) {
    errors.push(`${path}: missing or empty 'name' field`);
  }
  if (!fm || typeof fm.description !== 'string' || fm.description.length === 0) {
    errors.push(`${path}: missing or empty 'description' field`);
  }
  if (fm && fm.name) {
    const expected = basename(dirname(path));
    if (expected !== '.' && fm.name !== expected) {
      errors.push(`${path}: skill name '${fm.name}' does not match directory '${expected}'`);
    }
  }
  return { errors };
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === 'SKILL.md') out.push(full);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] || 'skills';
  const allErrors = [];
  for (const file of walk(root)) {
    const { errors } = lintSkill(file, readFileSync(file, 'utf8'));
    allErrors.push(...errors);
  }
  if (allErrors.length) {
    for (const e of allErrors) console.error(e);
    process.exit(1);
  }
  console.log(`OK — all skill files passed frontmatter lint`);
}
