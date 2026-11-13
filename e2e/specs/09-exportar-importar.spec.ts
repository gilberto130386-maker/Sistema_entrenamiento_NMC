import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { test, expect } from '../support/fixtures';

test.describe('Exportaciones', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
  });

  test('⋮ → Descargar Excel genera un .xlsx con exámenes, empleados y KPI', async ({ app, page }) => {
    const d = await app.datos();
    await page.locator('#kebab-btn').click();
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Descargar Excel/ }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/^NMC_Control_Entrenamientos_\d{4}-\d{2}-\d{2}\.xlsx$/);

    const wb = XLSX.read(await readFile((await descarga.path())!));
    expect(wb.SheetNames).toEqual(['Lista1_Examenes', 'Lista2_Empleados', 'KPI']);

    const examenes = XLSX.utils.sheet_to_json<any>(wb.Sheets['Lista1_Examenes']);
    const empleados = XLSX.utils.sheet_to_json<any>(wb.Sheets['Lista2_Empleados']);
    expect(examenes).toHaveLength(d.exams);
    expect(empleados).toHaveLength(d.empleados);
    expect(empleados.find((e) => String(e.Numero) === '25313')).toMatchObject({
      ID: 'EMP-001', Area: 'CALIDAD', Estatus: 'Pendiente',
    });

    const [encabezado, valores] = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['KPI'], { header: 1 });
    expect(encabezado).toEqual(['Total Empleados', 'Aprobados', 'Pendientes', 'Cumplimiento %', 'Total Exámenes']);
    expect(valores[0]).toBe(d.empleados);
    expect(valores[1]).toBe(d.aprobados);
    expect(valores[4]).toBe(d.exams);
    await app.esperarToast('Excel descargado');
  });

  test('Skill Matrix → Generar PDF (A3) descarga un PDF válido del área elegida', async ({ app, page }) => {
    await app.irA('skillmatrix');
    await page.locator('#sm-area-filter').selectOption('CALIDAD');
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Generar PDF \(A3\)/ }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/^Skill_Matrix_CALIDAD.*\.pdf$/);
    const pdf = await readFile((await descarga.path())!);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5_000);
  });

  test('Empleados → Reporte PDF descarga un PDF', async ({ app, page }) => {
    await app.irA('employees');
    await page.locator('#btn-emp-report').click();
    const modal = page.locator('#report-modal');
    await expect(modal).toHaveClass(/\bopen\b/);
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      modal.getByRole('button', { name: /Generar/ }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/\.pdf$/);
    const pdf = await readFile((await descarga.path())!);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

test.describe('Importar calificaciones (JSON del Analizador)', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
  });

  test('marca los exámenes y aprueba al empleado que completa el 100 %', async ({ app, page }) => {
    const examIds: string[] = await page.evaluate(() =>
      // @ts-ignore
      getEmpExams(EMPLOYEES.find((e) => e.numero === '25313')).map((x) => x.id));
    expect(examIds.length).toBeGreaterThan(0);
    const antes = await app.datos();

    const payload = {
      v: 1, source: 'QA-E2E', generated: '2026-01-01T00:00:00.000Z', passThr: 0.8,
      results: [
        ...examIds.map((examReg) => ({ num: '025313', examReg, pct: 100 })), // con cero a la izquierda
        { num: '000000', examReg: 'REG-001', pct: 90 },                       // sin coincidencia
      ],
    };
    await page.locator('#sync-file-input').setInputFiles({
      name: 'calificaciones.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(payload)),
    });

    await app.esperarToast(`${examIds.length} exámenes marcados`);
    await expect(app.toast).toContainText('1 empleado(s) → Aprobado');
    await expect(app.toast).toContainText('1 sin coincidencia');
    expect((await app.datos()).aprobados).toBe(antes.aprobados + 1);

    // Persistido: tras recargar sigue aprobado y con todos los checks
    await app.recargar();
    await app.abrirEmpleadoPorNumero('25313');
    await expect(page.locator('#emp-modal select.status-sel')).toHaveValue('Aprobado');
    await expect(page.locator('#emp-modal .exam-check-btn.checked')).toHaveCount(examIds.length);
  });

  test('importar el mismo paquete dos veces es idempotente', async ({ app, page }) => {
    const payload = {
      v: 1, generated: '2026-01-02T00:00:00.000Z',
      results: [{ num: '25313', examReg: 'REG-002', pct: 100 }],
    };
    const archivo = {
      name: 'c.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)),
    };
    await page.locator('#sync-file-input').setInputFiles(archivo);
    await app.esperarToast('1 exámenes marcados');

    await page.locator('#sync-file-input').setInputFiles(archivo);
    await expect(app.toast).toContainText('sin novedades');
    await expect(app.toast).toContainText('1 registro(s) ya estaban aplicados');
  });

  test('un JSON con formato inesperado se rechaza sin cambiar datos', async ({ app, page }) => {
    const antes = await app.datos();
    await page.locator('#sync-file-input').setInputFiles({
      name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ hola: 1 })),
    });
    await app.esperarToast('Paquete de sincronización inválido');
    expect(await app.datos()).toEqual(antes);
  });

  test('un archivo que no es JSON muestra error', async ({ app, page }) => {
    await page.locator('#sync-file-input').setInputFiles({
      name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('no-json'),
    });
    await app.esperarToast('no es un JSON válido');
  });
});
