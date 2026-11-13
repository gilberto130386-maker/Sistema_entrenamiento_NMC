import { test, expect } from '../support/fixtures';
import type { Page } from '@playwright/test';

const filasGestion = (page: Page) => page.locator('#g-body tbody tr');

async function crearExamen(page: Page, datos: { tema: string; url?: string; estatus?: string }) {
  await page.getByRole('button', { name: '➕ Nuevo examen' }).click();
  const modal = page.locator('#gx-modal');
  await expect(modal).toHaveClass(/\bopen\b/);
  await expect(page.locator('#gx-modal-title')).toHaveText('Nuevo Examen');
  await page.locator('#gx-tema').fill(datos.tema);
  if (datos.url !== undefined) await page.locator('#gx-url').fill(datos.url);
  if (datos.estatus) await page.locator('#gx-estatus').selectOption(datos.estatus);
  await modal.getByRole('button', { name: /Guardar/ }).click();
}

test.describe('Capa de Gestión — exámenes', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
    await app.irA('gestion');
  });

  test('muestra las pestañas con los contadores del catálogo', async ({ app, page }) => {
    const { exams } = await app.datos();
    await expect(page.getByRole('button', { name: `🔗 Links de Exámenes (${exams})` })).toBeVisible();
    await expect(page.getByRole('button', { name: /🧷 Puestos \(\d+\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /🔀 Asignaciones \(\d+\)/ })).toBeVisible();
    await expect(filasGestion(page)).toHaveCount(exams);

    await page.getByRole('button', { name: /🧷 Puestos/ }).click();
    await expect(page.getByRole('button', { name: '➕ Nuevo puesto' })).toBeVisible();
    await page.getByRole('button', { name: /🏢 Organigrama/ }).click();
    await expect(page.locator('#g-body')).not.toBeEmpty();
  });

  test('el tema es obligatorio al crear un examen', async ({ app, page }) => {
    const { exams } = await app.datos();
    await crearExamen(page, { tema: '   ' });
    await expect(page.locator('#gx-error')).toBeVisible();
    await expect(page.locator('#gx-error')).toContainText('obligatorio');
    await expect(page.locator('#gx-modal')).toHaveClass(/\bopen\b/);
    expect((await app.datos()).exams).toBe(exams);
  });

  test('crear un examen lo agrega con el siguiente ID, al catálogo y persiste', async ({ app, page }) => {
    const { exams } = await app.datos();
    const siguienteId = await page.evaluate(() => (window as any)._nextExamId());
    const tema = 'QA E2E — Examen de prueba automatizada';

    await crearExamen(page, { tema, url: 'https://forms.office.com/r/qa-e2e' });
    await app.esperarToast(`Examen creado: ${siguienteId}`);
    await expect(page.locator('#gx-modal')).not.toHaveClass(/\bopen\b/);
    await expect(filasGestion(page)).toHaveCount(exams + 1);
    await expect(filasGestion(page).filter({ hasText: siguienteId })).toContainText(tema);

    // Aparece también en el Catálogo de Exámenes
    await app.irA('exams');
    await app.buscarExamen(siguienteId);
    await expect(app.filasExamen).toHaveCount(1);
    await expect(app.filasExamen.first()).toContainText(tema);

    // Persiste tras recargar (vía localStorage 'nmc-dataset')
    await app.recargar();
    expect((await app.datos()).exams).toBe(exams + 1);
  });

  test('editar un examen cambia su tema y estatus', async ({ app, page }) => {
    const fila = filasGestion(page).filter({ hasText: 'REG-001' });
    await fila.getByRole('button', { name: '✏️' }).click();
    await expect(page.locator('#gx-modal-title')).toHaveText('Editar Examen');
    await expect(page.locator('#gx-id')).toHaveValue('REG-001');

    await page.locator('#gx-tema').fill('REG-001 editado por QA');
    await page.locator('#gx-estatus').selectOption('Inactivo');
    await page.locator('#gx-modal').getByRole('button', { name: /Guardar/ }).click();
    await app.esperarToast('Examen actualizado: REG-001');

    await app.irA('exams');
    await page.locator('#ex-status').selectOption('Inactivo');
    await expect(app.filasExamen).toHaveCount(1);
    await expect(app.filasExamen.first()).toContainText('REG-001 editado por QA');
  });

  test('eliminar un examen pide confirmación; cancelar no borra nada', async ({ app, page }) => {
    const { exams } = await app.datos();
    page.once('dialog', (d) => d.dismiss());
    await filasGestion(page).filter({ hasText: 'REG-039' }).getByRole('button', { name: '🗑️' }).click();
    expect((await app.datos()).exams).toBe(exams);
  });

  test('eliminar un examen confirmado lo quita del catálogo y persiste', async ({ app, page }) => {
    const { exams } = await app.datos();
    let mensaje = '';
    page.once('dialog', (d) => { mensaje = d.message(); d.accept(); });
    await filasGestion(page).filter({ hasText: 'REG-039' }).getByRole('button', { name: '🗑️' }).click();

    expect(mensaje).toContain('REG-039');
    await app.esperarToast('Examen eliminado: REG-039');
    await expect(filasGestion(page)).toHaveCount(exams - 1);

    await app.recargar();
    expect((await app.datos()).exams).toBe(exams - 1);
    await app.buscarExamen('REG-039');
    await expect(page.locator('#ex-tbody')).toContainText('Sin resultados');
  });

  test('un link con esquema javascript: no se renderiza como enlace', async ({ app, page }) => {
    await crearExamen(page, { tema: 'QA link malicioso', url: 'javascript:alert(1)' });
    const fila = filasGestion(page).filter({ hasText: 'QA link malicioso' });
    await expect(fila).toContainText('Sin link');
    await expect(fila.locator('a')).toHaveCount(0);

    await app.irA('exams');
    await app.buscarExamen('QA link malicioso');
    await expect(app.filasExamen).toHaveCount(1);
    await expect(app.filasExamen.first().locator('a[href^="javascript"]')).toHaveCount(0);
  });

  // BUG CONOCIDO: el buscador usa oninput="renderGestion()" y renderGestion() reescribe
  // root.innerHTML (incluido el propio <input id="g-q">). Tras la 1.ª tecla el input se
  // recrea y pierde el foco, así que al teclear "kanban" solo queda "k".
  test.fail('escribir tecla a tecla en el buscador conserva el foco y el texto', {
    annotation: { type: 'bug', description: 'js/gestion.js renderGestion() recrea #g-q en cada input' },
  }, async ({ page }) => {
    await page.locator('#g-q').click();
    await page.keyboard.type('kanban', { delay: 30 });
    await expect(page.locator('#g-q')).toHaveValue('kanban', { timeout: 2_000 });
    await expect(page.locator('#g-q')).toBeFocused({ timeout: 1_000 });
  });

  test('la búsqueda filtra la tabla de exámenes', async ({ page }) => {
    await page.locator('#g-q').fill('kanban');
    await expect(filasGestion(page).first()).toContainText(/kanban/i);
    for (const fila of await filasGestion(page).all()) await expect(fila).toContainText(/kanban/i);
  });
});
