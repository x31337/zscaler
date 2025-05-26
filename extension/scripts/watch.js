const chokidar = require('chokidar');
const { exec } = require('child_process');
const path = require('path');

// Configuration
const config = {
  watchPaths: [
    'popup/**/*',
    'options/**/*',
    'background.js',
    'manifest.json'
  ],
  excludePaths: [
    '**/*.test.js',
    '**/*.map',
    '**/node_modules/**'
  ],
  reloadDelay: 500 // ms
};

// Color console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

// Watch for changes
console.log(`${colors.bright}Starting extension file watcher...${colors.reset}`);

const watcher = chokidar.watch(config.watchPaths, {
  ignored: config.excludePaths,
  persistent: true,
  ignoreInitial: true
});

// Handle file changes
watcher
  .on('change', path => handleChange('changed', path))
  .on('add', path => handleChange('added', path))
  .on('unlink', path => handleChange('deleted', path));

function handleChange(event, filepath) {
  const relativePath = path.relative(process.cwd(), filepath);
  console.log(`${colors.yellow}File ${event}: ${relativePath}${colors.reset}`);

  // Reload extension
  reloadExtension();
}

// Reload the extension
let reloadTimeout;
function reloadExtension() {
  if (reloadTimeout) {
    clearTimeout(reloadTimeout);
  }

  reloadTimeout = setTimeout(() => {
    exec('chrome-cli reload-extension "Zscaler Security"', (error) => {
      if (error) {
        console.log(`${colors.red}Failed to reload extension${colors.reset}`);
        console.log('Make sure chrome-cli is installed and the extension is loaded');
        return;
      }
      console.log(`${colors.green}Extension reloaded${colors.reset}`);
    });
  }, config.reloadDelay);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log(`${colors.bright}\nStopping file watcher...${colors.reset}`);
  watcher.close().then(() => process.exit(0));
});
