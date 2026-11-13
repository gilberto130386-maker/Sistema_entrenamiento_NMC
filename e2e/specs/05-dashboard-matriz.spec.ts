import { test, expect } from '../support/fixtures';

const kpi = (key: string) => `#dash-kpis [data-kpi="${key}"] .kpi-val`;

test.describe('Dashboard KPI', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
    await app.irA('dashboard');
  });

  test('los KPIs coinciden con los datos de empleados', async ({ app, page }) => {
    const d = await app.datos();
    const enProceso = await page.evaluate(() =>
      // @ts-ignore
      EMPLOYEES.filter((e) => e.estatus === 'En Proceso').length);

    // Los valores tienen animación count-up: toHaveText reintenta hasta el valor final
    await expect(page.locator(kpi('empleados'))).toHaveText(String(d.empleados));
    await expect(page.locator(kpi('aprobados'))).toHaveText(String(d.aprobados));
    await expect(page.locator(kpi('pendientes'))).toHaveText(String(d.pendientes));
    await expect(page.locator(kpi('enproceso'))).toHaveText(String(enProceso));

    const pct = ((d.aprobados / d.empleados) * 100).toFixed(1);
    await expect(page.locator('#dash-kpis [data-kpi="aprobados"] .kpi-sub')).toHaveText(`${pct}%`);
  });

  // BUG MENOR: la tarjeta "Cumplimiento" se pinta con 1 decimal (p. ej. 19.4%) pero la
  // animación countUp() redondea el valor final a entero (19%), así que no coincide con
  // el subtítulo de "Aprobados" en el mismo tablero (js/sistema.js countUp: Math.round).
  test.fail('el KPI Cumplimiento conserva el decimal tras la animación', {
    annotation: { type: 'bug', description: 'countUp() en js/sistema.js redondea "19.4%" → "19%"' },
  }, async ({ app, page }) => {
    const d = await app.datos();
    const pct = ((d.aprobados / d.empleados) * 100).toFixed(1);
    await page.waitForTimeout(1_000); // deja terminar la animación (700 ms)
    await expect(page.locator(kpi('cumplimiento'))).toHaveText(`${pct}%`, { timeout: 1_500 });
  });

  test('el KPI Aprobados se actualiza al aprobar a un empleado', async ({ app, page }) => {
    const d = await app.datos();
    await app.abrirEmpleadoPorNumero('25313');
    await page.locator('#emp-modal select.status-sel').selectOption('Aprobado');
    await page.locator('#emp-modal .modal-close').first().click();

    await app.irA('dashboard');
    await expect(page.locator(kpi('aprobados'))).toHaveText(String(d.aprobados + 1));
    await expect(page.locator(kpi('pendientes'))).toHaveText(String(d.pendientes - 1));
  });

  test('ocultar un KPI muestra la barra de restauración y persiste tras recargar', async ({ app, page }) => {
    const bar = page.locator('#kpi-restore-bar');
    await expect(page.locator('#dash-kpis [data-kpi]')).toHaveCount(5);

    await page.locator('#dash-kpis [data-kpi="pendientes"] .kpi-hide-btn').click();
    await expect(page.locator('#dash-kpis [data-kpi]')).toHaveCount(4);
    await expect(page.locator('#dash-kpis [data-kpi="pendientes"]')).toHaveCount(0);
    await expect(bar).toBeVisible();
    await expect(page.locator('#kpi-restore-chips')).toContainText('Pendientes');
    expect(await app.localStorageJSON('nmc-hidden-kpis')).toEqual(['pendientes']);

    await app.recargar();
    await app.irA('dashboard');
    await expect(page.locator('#dash-kpis [data-kpi="pendientes"]')).toHaveCount(0);

    // Restaurar uno a uno desde su chip
    await page.locator('#kpi-restore-chips').getByRole('button', { name: /Pendientes/ }).click();
    await expect(page.locator('#dash-kpis [data-kpi]')).toHaveCount(5);
    await expect(bar).toBeHidden();
  });

  test('"Mostrar todos" restaura todos los KPIs ocultos', async ({ page }) => {
    for (const key of ['empleados', 'aprobados', 'enproceso']) {
      await page.locator(`#dash-kpis [data-kpi="${key}"] .kpi-hide-btn`).click();
    }
    await expect(page.locator('#dash-kpis [data-kpi]')).toHaveCount(2);
    await page.getByRole('button', { name: /Mostrar todos/ }).click();
    await expect(page.locator('#dash-kpis [data-kpi]')).toHaveCount(5);
    await expect(page.locator('#kpi-restore-bar')).toBeHidden();
  });

  test('la gráfica "Empleados por Área" muestra el área con más personal', async ({ page }) => {
    const [area, n] = await page.evaluate(() => {
      const c: Record<string, number> = {};
      // @ts-ignore
      EMPLOYEES.forEach((e) => { const a = (e.area || '').trim(); if (a) c[a] = (c[a] || 0) + 1; });
      return Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    });
    await expect(page.locator('#area-chart')).toContainText(area);
    await expect(page.locator('#area-chart')).toContainText(String(n));
  });
});

test.describe('Matriz Examen × Área', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
    await app.irA('matrix');
  });

  const filas = '#matrix-container tbody tr';

  test('muestra una fila por examen con el conteo de empleados correcto', async ({ app, page }) => {
    const { exams } = await app.datos();
    await expect(page.locator(filas)).toHaveCount(exams);

    const n = await page.evaluate(() =>
      // @ts-ignore
      getExamEmps(EXAMS.find((e) => e.id === 'REG-003')).length);
    const fila = page.locator(filas).filter({ hasText: 'REG-003' });
    // Penúltima celda = "Emps."
    await expect(fila.locator('td').nth(-2)).toHaveText(String(n));
  });

  test('filtra por ID o tema', async ({ page }) => {
    await page.locator('#mtx-q').fill('REG-003');
    await expect(page.locator(filas)).toHaveCount(1);
    await page.locator('#mtx-q').fill('');
    await expect(page.locator(filas)).not.toHaveCount(1);
  });

  test('clic en una fila abre el detalle del examen', async ({ app, page }) => {
    await page.locator(filas).filter({ hasText: 'REG-002' }).click();
    await expect(app.vista('exams')).toHaveClass(/\bactive\b/);
    await expect(page.locator('#exam-detail')).toContainText('REG-002');
  });
});
