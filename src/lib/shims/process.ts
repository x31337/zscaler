// Process shim for browser environment
export const cwd = () => '/';
export const chdir = (directory: string): never => {
  throw new Error('process.chdir() is not supported in browser environment');
};
export const env = {
  NODE_ENV: 'production',
  // Add any other environment variables needed
};
export const platform = 'browser';
export const versions = {
  node: '0.0.0',
  v8: '0.0.0',
};
export const stdout = {
  write: console.log.bind(console),
  isTTY: false,
};
export const stderr = {
  write: console.error.bind(console),
  isTTY: false,
};

// Default export for ESM imports
export default {
  cwd,
  chdir,
  env,
  platform,
  versions,
  stdout,
  stderr,
};

