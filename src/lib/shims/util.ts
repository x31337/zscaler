// Basic shim for util module functionality needed in browser environment
function promisify<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    throw new Error('util.promisify is not supported in browser environment');
  };
}

// Common util functions that might be needed
function inspect(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

function format(format: string, ...args: any[]): string {
  return format.replace(/%[sdjifoO%]/g, (match: string) => {
    if (match === '%%') return '%';
    if (args.length === 0) return match;
    const value = args.shift();
    switch (match) {
      case '%s': return String(value);
      case '%d': return Number(value).toString();
      case '%i': return Math.floor(Number(value)).toString();
      case '%f': return Number(value).toString();
      case '%j': return JSON.stringify(value);
      case '%o':
      case '%O': return inspect(value);
      default: return match;
    }
  });
}

function types() {
  return {
    isDate: (obj: any): obj is Date => obj instanceof Date,
    isRegExp: (obj: any): obj is RegExp => obj instanceof RegExp,
    isArray: Array.isArray,
    isObject: (obj: any): boolean => obj !== null && typeof obj === 'object',
    isNull: (obj: any): obj is null => obj === null,
    isUndefined: (obj: any): obj is undefined => obj === undefined,
    isNullOrUndefined: (obj: any): boolean => obj == null,
    isString: (obj: any): obj is string => typeof obj === 'string',
    isNumber: (obj: any): obj is number => typeof obj === 'number',
    isBoolean: (obj: any): obj is boolean => typeof obj === 'boolean',
    isFunction: (obj: any): obj is Function => typeof obj === 'function',
  };
}

export {
  promisify,
  inspect,
  format,
  types,
};

export default {
  promisify,
  inspect,
  format,
  types,
};

