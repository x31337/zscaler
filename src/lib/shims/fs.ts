// Comprehensive shim for fs module functionality needed in browser environment
function throwNotSupported(): never {
  throw new Error('File system operations are not supported in browser environment');
}

// Synchronous operations
export const createWriteStream = throwNotSupported;
export const accessSync = throwNotSupported;
export const readFileSync = throwNotSupported;
export const writeFileSync = throwNotSupported;
export const mkdirSync = throwNotSupported;
export const existsSync = throwNotSupported;
export const readdirSync = throwNotSupported;
export const statSync = throwNotSupported;
export const unlinkSync = throwNotSupported;
export const rmdirSync = throwNotSupported;
export const lstatSync = throwNotSupported;

// Promise-based operations
export const promises = {
  readFile: async () => throwNotSupported(),
  writeFile: async () => throwNotSupported(),
  mkdir: async () => throwNotSupported(),
  readdir: async () => throwNotSupported(),
  stat: async () => throwNotSupported(),
  unlink: async () => throwNotSupported(),
  rmdir: async () => throwNotSupported(),
  lstat: async () => throwNotSupported(),
  access: async () => throwNotSupported()
};

// Default export with all operations
export default {
  createWriteStream,
  accessSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmdirSync,
  lstatSync,
  promises
};

