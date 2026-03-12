/* global module, require */
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const cwd = '/opt/rafaygen-agent-live';
let envVars = {};

['.env.local', '.env.production', '.env'].forEach((file) => {
  const filePath = path.join(cwd, file);
  if (fs.existsSync(filePath)) {
    envVars = { ...envVars, ...dotenv.parse(fs.readFileSync(filePath)) };
  }
});

module.exports = {
  apps: [
    {
      name: 'rafaygen-agent-live',
      script: 'node_modules/.bin/next',
      args: 'start --port 5001',
      cwd,
      autorestart: true,
      max_memory_restart: '1G',
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: '5001',
        ...envVars,
      },
    },
  ],
};
