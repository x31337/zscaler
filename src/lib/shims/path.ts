// Basic path operations that might be needed
export function join(...paths: string[]): string {
  return paths.join('/').replace(/\/+/g, '/');
}

export function resolve(...paths: string[]): string {
  return join(...paths);
}

export function dirname(path: string): string {
  return path.split('/').slice(0, -1).join('/') || '/';
}

export function basename(path: string, ext?: string): string {
  let base = path.split('/').pop() || '';
  if (ext && base.endsWith(ext)) {
    base = base.slice(0, -ext.length);
  }
  return base;
}

export function extname(path: string): string {
  const base = basename(path);
  const lastDotIndex = base.lastIndexOf('.');
  return lastDotIndex < 0 ? '' : base.slice(lastDotIndex);
}

export default {
  join,
  resolve,
  dirname,
  basename,
  extname
};

