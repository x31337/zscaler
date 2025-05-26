// Empty shim for Node.js built-ins that aren't needed in the browser
export default {};

// Empty shim for Node.js built-in modules that aren't needed in browser environment

// Common methods that might be imported directly
export function createServer(): never {
  throw new Error('This module is not supported in browser environment');
}

export function createConnection(): never {
  throw new Error('This module is not supported in browser environment');
}

export function connect(): never {
  throw new Error('This module is not supported in browser environment');
}

// Events module shims
export class EventEmitter {
  constructor() {
    throw new Error('EventEmitter is not supported in browser environment');
  }
}

// Crypto module shims
export const randomBytes = (size: number): never => {
  throw new Error('crypto.randomBytes is not supported in browser environment');
};

// DNS module shims
export const lookup = (): never => {
  throw new Error('dns.lookup is not supported in browser environment');
};

// Net module shims
export const Socket = (): never => {
  throw new Error('net.Socket is not supported in browser environment');
};

// Common constants and promises
export const constants = {
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  S_IFMT: 61440,
  S_IFREG: 32768,
  S_IFDIR: 16384,
  S_IFCHR: 8192,
  S_IFBLK: 24576,
  S_IFIFO: 4096,
  S_IFLNK: 40960,
  S_IFSOCK: 49152,
};

export const promises = {};

// Default export for imports like 'import crypto from "crypto"'
export default {
  createServer,
  createConnection,
  connect,
  EventEmitter,
  randomBytes,
  lookup,
  Socket,
  constants,
  promises,
};
