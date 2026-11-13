import { readFile } from 'node:fs/promises';
import { test, expect, prepararPagina } from '../support/fixtures';
import { AppPage } from '../support/app.page';

test.describe('Respaldo de datos', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
  });

  test('descarga manual: genera un .json válido con todas las llaves nmc-*', async ({ app, page }) => {
    // Generar algún dato de usuario para que forme parte del respaldo
    await app.abrirEmpleadoPorNumero('25313');
    await page.locator('#emp-modal select.status-sel').selectOption('Aprobado');
    await page.locator('#emp-modal .modal-close').first().click();

    await app.irA('respaldo');
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Descargar respaldo ahora/ }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/^respaldo-nmc_\d{4}-\d{2}-\d{2}_\d{6}\.json$/);

    const json = JSON.parse(await readFile((await descarga.path())!, 'utf8'));
    expect(json).toMatchObject({ app: 'NMC-Sistema-Entrenamiento', formato: 1 });
    expect(json.claves).toBe(Object.keys(json.datos).length);
    expect(Object.keys(json.datos)).toContain('nmc-employee-data');
    expect(Object.keys(json.datos)).not.toContain('nmc-respaldo-config'); // preferencia excluida
    expect(JSON.parse(json.datos['nmc-employee-data']).statuses['25313']).toBe('Aprobado');
    await app.esperarToast('Respaldo descargado');
  });

  test('restaurar un respaldo reemplaza los datos y recarga la página', async ({ app, page }) => {
    // 1) Estado A: EMP 25313 Aprobado → descargar respaldo
    await app.abrirEmpleadoPorNumero('25313');
    await page.locator('#emp-modal select.status-sel').selectOption('Aprobado');
    await page.locator('#emp-modal .modal-close').first().click();
    await app.irA('respaldo');
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Descargar respaldo ahora/ }).click(),
    ]);
    const archivo = (await descarga.path())!;

    // 2) Estado B: se cambia a Suspendido
    await app.abrirEmpleadoPorNumero('25313');
    await page.locator('#emp-modal select.status-sel').selectOption('Suspendido');
    await page.locator('#emp-modal .modal-close').first().click();

    // 3) Restaurar → aceptar confirmación → la página recarga con el estado A
    await app.irA('respaldo');
    let confirmacion = '';
    page.once('dialog', (d) => { confirmacion = d.message(); d.accept(); });
    const recarga = page.waitForEvent('load');
    await page.locator('#respaldo-file-input').setInputFiles(archivo);
    await recarga;
    expect(confirmacion).toContain('¿Restaurar este respaldo?');

    await app.esperarListo();
    const st = await app.localStorageJSON('nmc-employee-data');
    expect(st.statuses['25313']).toBe('Aprobado');
  });

  test('rechaza un archivo que no es un respaldo del sistema', async ({ app, page }) => {
    await app.irA('respaldo');
    const antes = await page.evaluate(() => JSON.stringify(localStorage));

    let alerta = '';
    page.once('dialog', (d) => { alerta = d.message(); d.accept(); });
    await page.locator('#respaldo-file-input').setInputFiles({
      name: 'otro.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'OtraApp', datos: { 'nmc-x': '1' } })),
    });
    await expect.poll(() => alerta).toContain('no es un respaldo de este sistema');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(antes);
  });

  test('rechaza un respaldo con llaves ajenas al prefijo nmc-', async ({ app, page }) => {
    await app.irA('respaldo');
    let alerta = '';
    page.once('dialog', (d) => { alerta = d.message(); d.accept(); });
    await page.locator('#respaldo-file-input').setInputFiles({
      name: 'malo.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        app: 'NMC-Sistema-Entrenamiento', formato: 1, datos: { 'token-ajeno': 'x' },
      })),
    });
    await expect.poll(() => alerta).toContain('llave no válida');
    expect(await page.evaluate(() => localStorage.getItem('token-ajeno'))).toBeNull();
  });

  test('rechaza un archivo que no es JSON', async ({ app, page }) => {
    await app.irA('respaldo');
    let alerta = '';
    page.once('dialog', (d) => { alerta = d.message(); d.accept(); });
    await page.locator('#respaldo-file-input').setInputFiles({
      name: 'roto.json', mimeType: 'application/json', buffer: Buffer.from('{no es json'),
    });
    await expect.poll(() => alerta).toContain('no es un JSON válido');
  });
});

test.describe('Respaldo automático al abrir', () => {
  test('con la opción activa, al abrir la app descarga un respaldo', async ({ page }) => {
    await prepararPagina(page, { autoRespaldo: true });
    const app = new AppPage(page);
    const descarga = page.waitForEvent('download');
    await app.abrir();
    expect((await descarga).suggestedFilename()).toMatch(/^respaldo-nmc_.*\.json$/);
  });

  test('desactivar la opción evita la descarga en la siguiente apertura', async ({ page }) => {
    await prepararPagina(page, { autoRespaldo: true });
    const app = new AppPage(page);
    await app.abrir();
    await app.irA('respaldo');
    const toggle = page.locator('#view-respaldo input[type="checkbox"]');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    expect((await app.localStorageJSON('nmc-respaldo-config')).auto).toBe(false);

    let descargas = 0;
    page.on('download', () => descargas++);
    await app.recargar();
    await page.waitForTimeout(2_000); // el respaldo automático se dispara a los 1.2 s
    expect(descargas).toBe(0);
  });
});
