// Constrain paths supplied by imported genealogy data to the intended archive.
import fs from 'node:fs/promises';
import path from 'node:path';

export function assertRelativePath(value) {
  if (typeof value !== 'string' || !value || /[\\\0:]/.test(value)
    || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe archive path: ${JSON.stringify(value)}`);
  }
  return value;
}

export async function safePath(root, relative, { allowMissing = false } = {}) {
  assertRelativePath(relative);
  const boundary = await fs.realpath(root);
  const target = path.resolve(root, relative);
  let existing = target;
  const tail = [];
  let resolved;
  while (true) {
    try { resolved = await fs.realpath(existing); break; }
    catch (error) {
      if (!allowMissing || error.code !== 'ENOENT' || path.dirname(existing) === existing) throw error;
      tail.unshift(path.basename(existing));
      existing = path.dirname(existing);
    }
  }
  const difference = path.relative(boundary, resolved);
  if (difference === '..' || difference.startsWith(`..${path.sep}`) || path.isAbsolute(difference)) {
    throw new Error(`Unsafe archive path: symlink leaves archive (${relative})`);
  }
  return path.join(resolved, ...tail);
}

export function mediaRelativePath(file) {
  assertRelativePath(file);
  return file.includes('/') ? `assets/${file}` : `assets/optimized/${file}`;
}

export async function safeMediaPath(file, { root = process.cwd() } = {}) {
  return safePath(root, mediaRelativePath(file));
}
