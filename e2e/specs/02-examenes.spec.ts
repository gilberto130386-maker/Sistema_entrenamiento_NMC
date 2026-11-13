import { test, expect } from '../support/fixtures';

const POR_PAGINA = 15; // EX_PS en js/sistema.js

test.describe('Catálogo de Exámenes', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
  });

  test('pagina el catálogo de 15 en 15 y reporta el total', async ({ app, page }) => {
    const { exams } = await app.datos();
    const paginas = Math.ceil(exams / POR_PAGINA);

    await expect(app.filasExamen).toHaveCount(Math.min(exams, POR_PAGINA));
    await expect.poll(() => app.totalExamenes()).toBe(exams);
    await expect(app.pagerExamen).toContainText(`1/${paginas}`);

    // Ir a la última página
    await app.pagerExamen.getByRole('button', { name: '»' }).click();
    await expect(app.pagerExamen).toContainText(`${paginas}/${paginas}`);
    await expect(app.filasExamen).toHaveCount(exams - (paginas - 1) * POR_PAGINA);

    // La primera fila de la última página es el examen esperado
    // @ts-ignore — `filtExams` es un `let` global de js/sistema.js
    const idEsperado = await page.evaluate((i) => filtExams[i].id, (paginas - 1) * POR_PAGINA);
    await expect(app.filasExamen.first()).toHaveAttribute('data-id', idEsperado);
  });

  test('busca por ID de examen', async ({ app }) => {
    await app.buscarExamen('REG-003');
    await expect(app.filasExamen).toHaveCount(1);
    await expect(app.filasExamen.first()).toHaveAttribute('data-id', 'REG-003');
  });

  test('busca por tema sin distinguir mayúsculas', async ({ app, page }) => {
    const esperado = await page.evaluate(() =>
      // @ts-ignore
      EXAMS.filter((e) => e.tema.toLowerCase().includes('kanban')).length);
    expect(esperado).toBeGreaterThan(0);

    await app.buscarExamen('KANBAN');
    await expect(app.filasExamen).toHaveCount(esperado);
    for (const fila of await app.filasExamen.all()) {
      await expect(fila).toContainText(/kanban/i);
    }
  });

  test('muestra "Sin resultados" cuando la búsqueda no coincide', async ({ app, page }) => {
    await app.buscarExamen('zzz-no-existe-zzz');
    await expect(app.filasExamen).toHaveCount(0);
    await expect(page.locator('#ex-tbody')).toContainText('Sin resultados');
    await expect(app.pagerExamen).toBeEmpty();
  });

  test('filtra por estatus', async ({ app, page }) => {
    const { activos, inactivos } = await page.evaluate(() => ({
      // @ts-ignore
      activos: EXAMS.filter((e) => e.estatus === 'Activo').length,
      // @ts-ignore
      inactivos: EXAMS.filter((e) => e.estatus === 'Inactivo').length,
    }));

    await page.locator('#ex-status').selectOption('Activo');
    await expect.poll(() => app.totalExamenes()).toBe(activos);

    await page.locator('#ex-status').selectOption('Inactivo');
    if (inactivos === 0) {
      await expect(page.locator('#ex-tbody')).toContainText('Sin resultados');
    } else {
      await expect.poll(() => app.totalExamenes()).toBe(inactivos);
    }
  });

  test('filtro de cumplimiento "Con pendientes" coincide con los datos', async ({ app, page }) => {
    const esperado = await page.evaluate(() =>
      // @ts-ignore
      EXAMS.filter((ex) => {
        // @ts-ignore
        const emps = getExamEmps(ex);
        const apr = emps.filter((e: any) => e.estatus === 'Aprobado').length;
        return emps.length > 0 && apr < emps.length;
      }).length);

    await page.locator('#ex-cert').selectOption('pend');
    if (esperado === 0) {
      await expect(page.locator('#ex-tbody')).toContainText('Sin resultados');
    } else {
      await expect.poll(() => app.totalExamenes()).toBe(esperado);
    }
  });

  test('filtro por área muestra la barra de correo y restringe los puestos (cascada)', async ({ app, page }) => {
    await page.locator('#ex-area').selectOption('CALIDAD');

    const barra = page.locator('#ex-email-bar');
    await expect(barra).toBeVisible();
    await expect(page.locator('#ex-email-bar-label')).toContainText('CALIDAD');

    // Todos los puestos ofrecidos pertenecen a empleados/catálogo del área
    const { ofrecidos, validos } = await page.evaluate(() => ({
      ofrecidos: [...document.querySelectorAll<HTMLOptionElement>('#ex-puesto option')]
        .map((o) => o.value).filter(Boolean),
      validos: [...((window as any)._areaToExPuestos['CALIDAD'] || [])],
    }));
    expect(ofrecidos.length).toBeGreaterThan(0);
    expect(new Set(ofrecidos)).toEqual(new Set(validos));

    // Cada examen listado tiene al menos un empleado de CALIDAD
    const ids = await app.filasExamen.evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.id));
    const todosDeCalidad = await page.evaluate((ids) =>
      ids.every((id) =>
        // @ts-ignore
        getExamEmps(EXAMS.find((e) => e.id === id)).some((e) => e.area === 'CALIDAD')), ids);
    expect(todosDeCalidad).toBe(true);

    // Quitar el filtro oculta la barra
    await page.locator('#ex-area').selectOption('');
    await expect(barra).toBeHidden();
  });

  test('abrir el detalle de un examen y regresar al listado', async ({ app, page }) => {
    await app.filasExamen.filter({ hasText: 'REG-001' }).click();
    await expect(page.locator('#exam-list')).toBeHidden();
    await expect(page.locator('#exam-detail')).toContainText('REG-001');

    // Volver con el menú lateral restablece el listado
    await app.irA('exams');
    await expect(page.locator('#exam-list')).toBeVisible();
    await expect(page.locator('#exam-detail')).toBeEmpty();
  });

  test('el botón ✉️ Correo de una fila abre el envío masivo sin abrir el detalle', async ({ app, page }) => {
    await app.filasExamen.first().locator('[data-email]').click();
    await expect(page.locator('#email-modal')).toHaveClass(/\bopen\b/);
    await expect(page.locator('#exam-list')).toBeVisible();
  });

  test('los links de examen abren en pestaña nueva con rel seguro', async ({ app }) => {
    const link = app.filasExamen.first().locator('a[target="_blank"]');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', /^https?:\/\//);
  });
});
