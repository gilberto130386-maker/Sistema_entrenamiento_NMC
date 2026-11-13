import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Configuración E2E — Control de Entrenamientos NMC.
 *
 * La app es una SPA estática (HTML + JS sin build). Se sirve con un servidor
 * estático sin dependencias (e2e/support/static-server.mjs). Las librerías de
 * CDN (xlsx, jspdf, jspdf-autotable) se sirven desde node_modules mediante
 * page.route() en el fixture, así las pruebas no dependen de internet.
 */
export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: BASE_URL,
    locale: 'es-MX',
    timezoneId: 'America/Hermosillo',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // Permite usar un Chromium preinstalado (p. ej. en contenedores sin `playwright install`)
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: `node e2e/support/static-server.mjs ${PORT}`,
    url: `${BASE_URL}/Sistema_entrenamiento_NMC.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
