import { test, expect } from '../support/fixtures';
import { VISTAS } from '../support/app.page';

test.describe('Carga inicial y navegación', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
  });

  test('carga la app con título, datos base y vista Exámenes activa', async ({ app, page }) => {
    await expect(page).toHaveTitle('Control de Entrenamientos — NMC');
    await expect(app.vista('exams')).toHaveClass(/\bactive\b/);
    await expect(app.navBtn('exams')).toHaveClass(/\bactive\b/);

    const d = await app.datos();
    expect(d.exams).toBeGreaterThan(0);
    expect(d.empleados).toBeGreaterThan(0);
    // Las librerías de exportación quedaron disponibles (servidas localmente)
    expect(await page.evaluate(() => typeof (window as any).XLSX)).toBe('object');
    expect(await page.evaluate(() => typeof (window as any).jspdf?.jsPDF)).toBe('function');
  });

  for (const vista of VISTAS) {
    test(`el menú lateral activa la vista "${vista}" y desactiva las demás`, async ({ app, page }) => {
      await app.irA(vista);
      await expect(page.locator('.view.active')).toHaveCount(1);
      await expect(page.locator('.nav-btn.active')).toHaveCount(1);
      await expect(app.navBtn(vista)).toHaveClass(/\bactive\b/);
      await expect(app.vista(vista)).toBeVisible();
    });
  }

  test('el logo regresa a la vista de Exámenes', async ({ app, page }) => {
    await app.irA('dashboard');
    await page.locator('.hdr .logo').click();
    await expect(app.vista('exams')).toHaveClass(/\bactive\b/);
  });

  test('contraer el menú lateral persiste tras recargar', async ({ app, page }) => {
    await page.locator('#btn-nav-collapse').click();
    expect(await page.evaluate(() => localStorage.getItem('nmc-sidenav-collapsed'))).toBe('1');

    await app.recargar();
    expect(await page.evaluate(() => localStorage.getItem('nmc-sidenav-collapsed'))).toBe('1');

    await page.locator('#btn-nav-collapse').click();
    expect(await page.evaluate(() => localStorage.getItem('nmc-sidenav-collapsed'))).toBe('0');
  });

  test('el menú ⋮ abre y cierra', async ({ page }) => {
    const menu = page.locator('#kebab-menu');
    await expect(menu).toBeHidden();
    await page.locator('#kebab-btn').click();
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Descargar Excel');
    await page.locator('#kebab-btn').click();
    await expect(menu).toBeHidden();
  });

  test('la tecla Escape cierra un modal abierto', async ({ page }) => {
    await page.locator('#kebab-btn').click();
    await page.getByRole('button', { name: /Links de Exámenes/ }).click();
    const modal = page.locator('#exam-links-modal');
    await expect(modal).toHaveClass(/\bopen\b/);
    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/\bopen\b/);
  });

  // BUG CONOCIDO — se marca con test.fail(): la suite sigue en verde mientras
  // el defecto exista, y avisará ("expected to fail") cuando se corrija.
  test.fail('no existen IDs duplicados en el documento', {
    annotation: {
      type: 'bug',
      description: 'id="fileInput" duplicado: Sistema_entrenamiento_NMC.html:101 (Excel legado) y :319 (Analizador)',
    },
  }, async ({ page }) => {
    // Un id duplicado hace que getElementById/querySelector('#id') devuelva
    // siempre el primero, conectando listeners al elemento equivocado.
    const duplicados = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
      return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    });
    expect(duplicados, 'IDs duplicados').toEqual([]);
  });
});
