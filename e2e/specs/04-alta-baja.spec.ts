import { test, expect } from '../support/fixtures';
import type { Page } from '@playwright/test';

const AREA = 'CALIDAD';

async function abrirAlta(page: Page) {
  await page.getByRole('button', { name: /➕ Alta/ }).click();
  await expect(page.locator('#alta-modal')).toHaveClass(/\bopen\b/);
}

/** Selecciona el área y el primer puesto disponible; devuelve el puesto elegido. */
async function elegirAreaYPuesto(page: Page, area = AREA) {
  await page.locator('#alta-area').selectOption(area);
  const puesto = await page.locator('#alta-puesto option').nth(1).getAttribute('value');
  expect(puesto, 'debe existir al menos un puesto para el área').toBeTruthy();
  await page.locator('#alta-puesto').selectOption(puesto!);
  return puesto!;
}

test.describe('Alta y baja de personal', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
    await app.irA('employees');
  });

  test('el botón Registrar se habilita solo con Nombre, Área y Puesto', async ({ page }) => {
    await abrirAlta(page);
    const enviar = page.locator('#alta-submit-btn');
    await expect(enviar).toBeDisabled();

    await page.locator('#alta-nombre').fill('PRUEBA QA, SOLO NOMBRE');
    await expect(enviar).toBeDisabled();

    await page.locator('#alta-area').selectOption(AREA);
    await expect(enviar).toBeDisabled();

    await elegirAreaYPuesto(page);
    await expect(enviar).toBeEnabled();
    // La vista previa informa cuántos exámenes heredará el puesto
    await expect(page.locator('#alta-exams-preview')).toBeVisible();
    await expect(page.locator('#alta-ingreso')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('registra un empleado nuevo, hereda los exámenes del puesto y persiste', async ({ app, page }) => {
    const antes = await app.datos();
    await abrirAlta(page);
    await page.locator('#alta-nombre').fill('QA AUTOMATIZADO, EMPLEADO NUEVO');
    const puesto = await elegirAreaYPuesto(page);
    const examsEsperados = Number(await page.locator('#alta-exams-count').innerText());
    await page.locator('#alta-email').fill('qa.nuevo@example.com');
    await page.locator('#alta-numero').fill('990001');
    await page.locator('#alta-submit-btn').click();

    await expect(page.locator('#alta-modal')).not.toHaveClass(/\bopen\b/);
    await app.esperarToast('Alta registrada');
    expect((await app.datos()).empleados).toBe(antes.empleados + 1);

    const extras = await app.localStorageJSON<any[]>('nmc-extra-employees');
    expect(extras).toHaveLength(1);
    expect(extras![0]).toMatchObject({
      nombre: 'QA AUTOMATIZADO, EMPLEADO NUEVO',
      area: AREA, puesto, numero: '990001', email: 'qa.nuevo@example.com',
      estatus: 'Pendiente', _manual: true,
    });
    expect(extras![0].exam_ids).toHaveLength(examsEsperados);

    // Sobrevive a la recarga y se puede buscar
    await app.recargar();
    expect((await app.datos()).empleados).toBe(antes.empleados + 1);
    await app.irA('employees');
    await app.buscarEmpleado('990001');
    await expect(app.filasEmpleado).toHaveCount(1);
    await expect(app.filasEmpleado.first()).toContainText('qa.nuevo@example.com');
  });

  test('rechaza un nombre duplicado (sin distinguir mayúsculas)', async ({ app, page }) => {
    const antes = await app.datos();
    await abrirAlta(page);
    await page.locator('#alta-nombre').fill('espinoza gonzalez, irma lorenia'); // ya existe (EMP-001)
    await elegirAreaYPuesto(page);
    await page.locator('#alta-submit-btn').click();

    await expect(page.locator('#alta-error')).toBeVisible();
    await expect(page.locator('#alta-error')).toContainText('Ya existe un empleado');
    await expect(page.locator('#alta-modal')).toHaveClass(/\bopen\b/);
    expect((await app.datos()).empleados).toBe(antes.empleados);
  });

  test('el nombre se trata como texto (sin inyección de HTML/JS)', async ({ app, page }) => {
    const payload = 'XSS QA <img src=x onerror="window.__xss=1">';
    await abrirAlta(page);
    await page.locator('#alta-nombre').fill(payload);
    await elegirAreaYPuesto(page);
    await page.locator('#alta-submit-btn').click();
    await app.esperarToast('Alta registrada');

    await app.buscarEmpleado('XSS QA');
    await expect(app.filasEmpleado).toHaveCount(1);
    await app.filasEmpleado.first().click();
    await expect(page.locator('#emp-modal')).toHaveClass(/\bopen\b/);

    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    await expect(page.locator('#emp-container img[src="x"], #emp-modal img[src="x"]')).toHaveCount(0);
  });

  test('baja reversible: marca al empleado como Inactivo y persiste', async ({ app, page }) => {
    await app.abrirEmpleadoPorNumero('25313');
    await page.locator('#emp-modal').getByRole('button', { name: /Baja/ }).click();

    const baja = page.locator('#baja-modal');
    await expect(baja).toHaveClass(/\bopen\b/);
    // Por seguridad la opción por defecto es la reversible
    await expect(page.locator('#baja-tipo-inact')).toBeChecked();
    await expect(page.locator('#baja-elim-warning')).toBeHidden();
    await page.locator('#baja-confirm-btn').click();

    await app.esperarToast('marcado como Inactivo');
    const st = await app.localStorageJSON('nmc-employee-data');
    expect(st.statuses['25313']).toBe('Inactivo');

    await app.recargar();
    await app.irA('employees');
    await page.locator('#emp-status').selectOption('__INACTIVOS__');
    await expect(app.filasEmpleado.filter({ hasText: '25313' })).toHaveCount(1);
  });

  test('baja definitiva: elimina al empleado y no reaparece tras recargar', async ({ app, page }) => {
    const antes = await app.datos();
    await app.abrirEmpleadoPorNumero('25313');
    await page.locator('#emp-modal').getByRole('button', { name: /Baja/ }).click();

    await page.locator('#baja-lbl-elim').click();
    await expect(page.locator('#baja-elim-warning')).toBeVisible();
    await page.locator('#baja-confirm-btn').click();
    await app.esperarToast('eliminado del sistema');

    expect((await app.datos()).empleados).toBe(antes.empleados - 1);
    expect(await app.localStorageJSON('nmc-deleted-employees')).toContain('25313');

    await app.recargar();
    expect((await app.datos()).empleados).toBe(antes.empleados - 1);
    await app.irA('employees');
    await app.buscarEmpleado('25313');
    await expect(page.locator('#emp-container')).toContainText('No se encontraron empleados');
  });

  test('cerrar la baja con "Cancelar" no modifica al empleado', async ({ app, page }) => {
    const antes = await app.datos();
    await app.abrirEmpleadoPorNumero('25313');
    await page.locator('#emp-modal').getByRole('button', { name: /Baja/ }).click();
    await page.locator('#baja-modal').getByRole('button', { name: /Cancelar/ }).click();
    await expect(page.locator('#baja-modal')).not.toHaveClass(/\bopen\b/);
    expect(await app.datos()).toEqual(antes);
  });
});
