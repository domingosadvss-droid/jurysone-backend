// playwright.config.js — Configuração do Playwright para JurysOne
// Execução: npx playwright test

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 15_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.JURYSONE_URL || 'http://localhost:3000/app-preview/dashboard.html',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    // Mobile — teste responsividade
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Inicia servidor local antes dos testes
  // webServer: {
  //   command: 'npx serve . -p 3000',
  //   port: 3000,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 15_000,
  // },
});
