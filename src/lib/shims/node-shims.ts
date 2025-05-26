// Shims for Node.js built-in modules that are used in browser context
export const url = {
  URL: window.URL,
  urlToHttpOptions: (url: URL) => ({
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    auth: url.username || url.password
      ? `${url.username}:${url.password}`
      : undefined
  })
};

export const util = {
  promisify: (fn: Function) => fn,
  types: {
    isPromise: (obj: any) => obj instanceof Promise
  }
};

export const stream = {
  Readable: class Readable {
    constructor() {
      throw new Error('Streams are not supported in browser environment');
    }
  },
  Writable: class Writable {
    constructor() {
      throw new Error('Streams are not supported in browser environment');
    }
  }
};

export const fs = {
  promises: {
    readFile: async () => {
      throw new Error('File system operations are not supported in browser environment');
    },
    writeFile: async () => {
      throw new Error('File system operations are not supported in browser environment');
    }
  }
};

export const path = {
  join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
  resolve: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
  dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
  basename: (path: string) => path.split('/').pop() || ''
};

export const os = {
  platform: () => 'browser',
  tmpdir: () => '/tmp',
  homedir: () => '/'
};

export const child_process = {
  spawn: () => {
    throw new Error('Process spawning is not supported in browser environment');
  },
  exec: () => {
    throw new Error('Process execution is not supported in browser environment');
  }
};

export const net = {
  Socket: class Socket {
    constructor() {
      throw new Error('Raw sockets are not supported in browser environment');
    }
  }
};

export const tls = {
  connect: () => {
    throw new Error('TLS connections are not supported in browser environment');
  }
};

export const crypto = {
  randomBytes: (size: number) => {
    const array = new Uint8Array(size);
    window.crypto.getRandomValues(array);
    return array;
  }
};

export const events = {
  EventEmitter: class EventEmitter {
    private listeners: { [key: string]: Function[] } = {};

    on(event: string, listener: Function) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(listener);
      return this;
    }

    emit(event: string, ...args: any[]) {
      const eventListeners = this.listeners[event];
      if (eventListeners) {
        eventListeners.forEach(listener => listener(...args));
      }
      return !!eventListeners;
    }

    removeListener(event: string, listener: Function) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(l => l !== listener);
      }
      return this;
    }
  }
};
