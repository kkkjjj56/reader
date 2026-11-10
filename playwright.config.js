import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:8000', viewport: {width:1440,height:1000} },
  projects: [{name:'chrome', use:{channel:'chrome'}}, {name:'edge',use:{channel:'msedge'}}],
  webServer: {command:'node server.js', url:'http://127.0.0.1:8000', reuseExistingServer:!process.env.CI},
});
