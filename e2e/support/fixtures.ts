import { test as base, expect, type Page } from '@playwright/test';
import { join } from 'node:path';
import { AppPage } from './app.page';

/** Ruta a un archivo dentro de un paquete de node_modules (en la raíz del repo). */
const pkgFile = (pkg: string, file: string) =>
  join(__dirname, '..', '..', 'node_modules', pkg, file);

/** Librerías que la app carga desde cdnjs → archivo local equivalente en node_modules
 *  (mismas versiones que el HTML: xlsx 0.18.5, jspdf 2.5.1, jspdf-autotable 3.5.31). */
const CDN_LIBS: Record<string, string> = {
  'xlsx.full.min.js': pkgFile('xlsx', 'dist/xlsx.full.min.js'),
  'jspdf.umd.min.js': pkgFile('jspdf', 'dist/jspdf.umd.min.js'),
  'jspdf.plugin.autotable.min.js': pkgFile('jspdf-autotable', 'dist/jspdf.plugin.autotable.min.js'),
};

/**
 * Prepara una página para que la app sea determinista y sin red externa:
 *  - Fuentes de Google → abortadas (no afectan la funcionalidad).
 *  - cdnjs → se sirven las mismas versiones desde node_modules.
 *  - Respaldo automático al abrir → desactivado por defecto (genera una
 *    descarga en cada carga). Las pruebas de Respaldo lo reactivan.
 */
export async function prepararPagina(page: Page, opts: { autoRespaldo?: boolean } = {}) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/cdnjs\.cloudflare\.com/, (route) => {
    const file = route.request().url().split('/').pop() ?? '';
    const local = CDN_LIBS[file];
    return local
      ? route.fulfill({ path: local, contentType: 'text/javascript; charset=utf-8' })
      : route.abort();
  });
  if (!opts.autoRespaldo) {
    await page.addInitScript(() => {
      try {
        if (!localStorage.getItem('nmc-respaldo-config')) {
          localStorage.setItem('nmc-respaldo-config', JSON.stringify({ auto: false }));
        }
      } catch {}
    });
  }
}

type Fixtures = {
  /** Errores JS no capturados durante la prueba (se valida que esté vacío al final). */
  pageErrors: string[];
  app: AppPage;
};

export const test = base.extend<Fixtures>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(errors);
  },

  app: async ({ page, pageErrors }, use, testInfo) => {
    await prepararPagina(page);
    const app = new AppPage(page);
    await use(app);
    // Guardián global: ninguna prueba debe provocar excepciones JS no capturadas.
    // Las pruebas que documentan un bug conocido con test.fail() quedan exentas.
    if (testInfo.expectedStatus === 'passed') {
      expect(pageErrors, 'Errores JS no capturados en la página').toEqual([]);
    }
  },
});

export { expect };
