/* global module, require, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const cwd = '/opt/rafaygen-llm-studio-Hostinger';
let envVars = {};

['.env.local', '.env.production', '.env'].forEach(f => {
  const fp = path.join(cwd, f);
  if (fs.existsSync(fp)) {
    const r = dotenv.parse(fs.readFileSync(fp));
    envVars = { ...envVars, ...r };
    console.log(`Loaded ${Object.keys(r).length} vars from ${f}`);
  }
});

module.exports = {
  apps: [{
    name: 'rafaygen',
    script: 'node_modules/.bin/next',
    args: 'start --port 5000',
    cwd: cwd,
    env: {
      NODE_ENV: 'production',
      PORT: '5000',
      ...envVars
    }
  }]
};
