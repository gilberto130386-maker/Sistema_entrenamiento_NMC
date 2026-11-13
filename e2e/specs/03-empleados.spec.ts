import { test, expect } from '../support/fixtures';

const POR_PAGINA = 18; // EMP_PS en js/sistema.js
const NUM_EMP = '25313'; // EMP-001 en js/datos.js

test.describe('Directorio de Empleados', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
    await app.irA('employees');
  });

  test('lista todos los empleados paginados de 18 en 18', async ({ app }) => {
    const { empleados } = await app.datos();
    await expect(app.filasEmpleado).toHaveCount(Math.min(empleados, POR_PAGINA));
    await expect.poll(() => app.totalEmpleados()).toBe(empleados);
    await expect(app.pagerEmpleado).toContainText(`1/${Math.ceil(empleados / POR_PAGINA)}`);

    await app.pagerEmpleado.getByRole('button', { name: '2', exact: true }).click();
    await expect(app.pagerEmpleado).toContainText(`2/${Math.ceil(empleados / POR_PAGINA)}`);
  });

  test('busca por número de empleado', async ({ app }) => {
    await app.buscarEmpleado(NUM_EMP);
    await expect(app.filasEmpleado).toHaveCount(1);
    await expect(app.filasEmpleado.first()).toContainText(NUM_EMP);
  });

  test('busca por nombre (parcial, sin mayúsculas)', async ({ app, page }) => {
    const esperado = await page.evaluate(() =>
      // @ts-ignore
      EMPLOYEES.filter((e) => e.nombre.toLowerCase().includes('espinoza')
        || e.puesto.toLowerCase().includes('espinoza')
        || e.area.toLowerCase().includes('espinoza')).length);
    await app.buscarEmpleado('espinoza');
    await expect.poll(() => app.totalEmpleados()).toBe(esperado);
  });

  test('sin coincidencias muestra estado vacío', async ({ app, page }) => {
    await app.buscarEmpleado('zzz-nadie-zzz');
    await expect(page.locator('#emp-container')).toContainText('No se encontraron empleados');
  });

  test('filtra por estatus Aprobado / Pendiente', async ({ app, page }) => {
    const d = await app.datos();
    await page.locator('#emp-status').selectOption('Aprobado');
    await expect.poll(() => app.totalEmpleados()).toBe(d.aprobados);
    for (const fila of await app.filasEmpleado.all()) await expect(fila).toContainText('Aprobado');

    await page.locator('#emp-status').selectOption('Pendiente');
    await expect.poll(() => app.totalEmpleados()).toBe(d.pendientes);
  });

  test('filtra por área y muestra la barra informativa', async ({ app, page }) => {
    const enArea = await page.evaluate(() =>
      // @ts-ignore
      EMPLOYEES.filter((e) => e.area === 'MOLDEO').length);
    await page.locator('#emp-area').selectOption('MOLDEO');
    await expect.poll(() => app.totalEmpleados()).toBe(enArea);
    await expect(page.locator('#emp-email-bar')).toBeVisible();
    await expect(page.locator('#emp-email-bar-sub')).toContainText(`${enArea} empleados en total`);
  });

  test('filtros combinados: área + Knowledge Certification', async ({ app, page }) => {
    const esperado = await page.evaluate(() =>
      // @ts-ignore
      EMPLOYEES.filter((e) => e.area === 'CALIDAD' && e.cert_examen === 'Aplica').length);
    await page.locator('#emp-area').selectOption('CALIDAD');
    await page.locator('#emp-cert').selectOption('Aplica');
    await expect.poll(() => app.totalEmpleados()).toBe(esperado);
  });

  test('cambia entre vista Tabla y Tarjetas', async ({ app, page }) => {
    await page.locator('#emp-mode').selectOption('grid');
    await expect(page.locator('#emp-container .emp-card')).toHaveCount(POR_PAGINA);
    await expect(page.locator('#emp-container table')).toHaveCount(0);

    await page.locator('#emp-mode').selectOption('table');
    await expect(app.filasEmpleado).toHaveCount(POR_PAGINA);
  });

  test('abre el modal de detalle y lo cierra con el botón ✕', async ({ app, page }) => {
    await app.abrirEmpleadoPorNumero(NUM_EMP);
    const modal = page.locator('#emp-modal');
    await expect(modal).toContainText(/espinoza/i);
    await modal.locator('.modal-close').first().click();
    await expect(modal).not.toHaveClass(/\bopen\b/);
  });

  test('cambiar el estatus desde el modal actualiza KPIs y persiste tras recargar', async ({ app, page }) => {
    const antes = await app.datos();
    await app.abrirEmpleadoPorNumero(NUM_EMP);
    await page.locator('#emp-modal select.status-sel').selectOption('Aprobado');
    await app.esperarToast('Estatus: Aprobado');

    const despues = await app.datos();
    expect(despues.aprobados).toBe(antes.aprobados + 1);
    expect(despues.pendientes).toBe(antes.pendientes - 1);

    const guardado = await app.localStorageJSON('nmc-employee-data');
    expect(guardado.statuses[NUM_EMP]).toBe('Aprobado');

    await app.recargar();
    expect((await app.datos()).aprobados).toBe(antes.aprobados + 1);
    await app.abrirEmpleadoPorNumero(NUM_EMP);
    await expect(page.locator('#emp-modal select.status-sel')).toHaveValue('Aprobado');
  });

  test('marcar un examen completado actualiza el progreso y persiste', async ({ app, page }) => {
    await app.abrirEmpleadoPorNumero(NUM_EMP);
    const checks = page.locator('#emp-modal .exam-check-btn');
    const total = await checks.count();
    expect(total).toBeGreaterThan(0);

    await checks.first().click();
    await expect(checks.first()).toHaveClass(/\bchecked\b/);
    await expect(page.locator('#ep-lbl-EMP-001')).toHaveText(`1 / ${total} completados`);

    await app.recargar();
    await app.abrirEmpleadoPorNumero(NUM_EMP);
    await expect(page.locator('#emp-modal .exam-check-btn.checked')).toHaveCount(1);
    // La tabla del directorio refleja el avance
    await page.locator('#emp-modal .modal-close').first().click();
    await expect(app.filasEmpleado.first()).toContainText(`1 / ${total} completados`);

    // Desmarcar regresa a 0
    await app.filasEmpleado.first().click();
    await page.locator('#emp-modal .exam-check-btn.checked').click();
    await expect(page.locator('#ep-lbl-EMP-001')).toHaveText(`0 / ${total} completados`);
  });
});
