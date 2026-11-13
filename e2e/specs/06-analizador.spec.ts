import { test, expect } from '../support/fixtures';
import type { Page } from '@playwright/test';

// EMP-001 en js/datos.js: número 25313, correo IEspinoza@Kirkhill.com, tiene REG-002 asignado.
const EMP_ID = 'EMP-001';
const EMP_MAIL = 'iespinoza@kirkhill.com';
const EXAM_REG = 'REG-002';
// El nombre del archivo permite que el Analizador adivine el examen (REG-002)
const ARCHIVO = 'QP 7.4.1 NMC Purchasing Process_Rev T.csv';

/** Simula soltar archivos sobre el dropzone (arrastrar y soltar). */
async function soltarArchivos(page: Page, archivos: { name: string; content: string }[]) {
  const dt = await page.evaluateHandle((files) => {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(new File([f.content], f.name, { type: 'text/csv' })));
    return dt;
  }, archivos);
  await page.dispatchEvent('#dropzone', 'drop', { dataTransfer: dt });
}

const csv = (filas: string[][]) => filas.map((r) => r.join(',')).join('\n');

test.describe('Analizador de Formularios', () => {
  test.beforeEach(async ({ app }) => {
    await app.abrir();
    await app.irA('analizador');
  });

  test('muestra el maestro incrustado y el botón Analizar deshabilitado sin archivos', async ({ app, page }) => {
    const d = await app.datos();
    await expect(page.locator('#masterBadge')).toContainText(`${d.exams} exámenes`);
    await expect(page.locator('#masterBadge')).toContainText(`${d.empleados} empleados`);
    await expect(page.locator('#btnAnalyze')).toBeDisabled();
  });

  test('cargar un CSV lo lista, adivina el examen y habilita el análisis', async ({ page }) => {
    await soltarArchivos(page, [{
      name: ARCHIVO,
      content: csv([['Nombre', 'Correo electrónico', 'Total points'], ['Irma Espinoza', EMP_MAIL, '10']]),
    }]);
    const fila = page.locator('#fileList .filerow');
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText(ARCHIVO);
    await expect(fila).toContainText('1 registros');
    await expect(fila.locator('select')).toHaveValue(EXAM_REG);
    await expect(page.locator('#fileCount')).toHaveText('1 archivo(s) cargado(s)');
    await expect(page.locator('#btnAnalyze')).toBeEnabled();
  });

  test('un archivo sin columnas reconocibles se marca con problemas', async ({ page }) => {
    await soltarArchivos(page, [{ name: 'datos-raros.csv', content: csv([['foo', 'bar'], ['1', '2']]) }]);
    await expect(page.locator('#fileList .filerow')).toContainText('problema(s)');
  });

  test('quitar un archivo y "Limpiar todo" vacían la lista', async ({ page }) => {
    const c = csv([['Nombre', 'Correo', 'Total points'], ['A', 'a@x.com', '1']]);
    await soltarArchivos(page, [{ name: 'a.csv', content: c }, { name: 'b.csv', content: c }]);
    await expect(page.locator('#fileList .filerow')).toHaveCount(2);

    await page.locator('#fileList .delbtn').first().click();
    await expect(page.locator('#fileList .filerow')).toHaveCount(1);

    await page.locator('#btnClear').click();
    await expect(page.locator('#fileList .filerow')).toHaveCount(0);
    await expect(page.locator('#btnAnalyze')).toBeDisabled();
  });

  test('ejecutar el análisis muestra el resumen y sincroniza el check al Sistema', async ({ app, page }) => {
    await soltarArchivos(page, [{
      name: ARCHIVO,
      content: csv([
        ['Nombre', 'Correo electrónico', 'Total points'],
        ['Irma Espinoza', EMP_MAIL, '10'],
        ['Persona Externa', 'nadie@example.com', '7'],
      ]),
    }]);
    await page.locator('#btnAnalyze').click();

    await expect(page.locator('#results')).toBeVisible();
    const resumen = page.locator('#pane-resumen');
    await expect(resumen).toContainText('Resumen ejecutivo');
    await expect(resumen.locator('.kpi', { hasText: 'Archivos cargados' })).toContainText('1');
    await expect(resumen.locator('.kpi', { hasText: 'Registros en formularios' })).toContainText('2');
    await expect(resumen).toContainText('1 registros sin coincidencia en el maestro');

    // Sincronización automática Analizador → Sistema
    await app.esperarToast(/Sincronización automática: 1 exámenes marcados/);
    const marcado = await page.evaluate(([id, reg]) =>
      !!(window as any)._examChecks?.[id]?.[reg], [EMP_ID, EXAM_REG]);
    expect(marcado).toBe(true);

    const sync = await app.localStorageJSON('nmc-analyzer-sync');
    expect(sync.results).toEqual([
      expect.objectContaining({ num: '25313', examReg: EXAM_REG, pct: 100 }),
    ]);

    // El check sobrevive a la recarga y se ve en el directorio
    await app.recargar();
    await app.abrirEmpleadoPorNumero('25313');
    await expect(page.locator('#emp-modal .exam-check-btn.checked')).toHaveCount(1);
  });

  test('las pestañas de resultados cambian el panel visible', async ({ page }) => {
    await soltarArchivos(page, [{
      name: ARCHIVO,
      content: csv([['Nombre', 'Correo', 'Total points'], ['Irma', EMP_MAIL, '9']]),
    }]);
    await page.locator('#btnAnalyze').click();
    await expect(page.locator('#results')).toBeVisible();

    for (const t of ['calidad', 'hallazgos', 'resumen']) {
      await page.locator(`#results .tab[data-t="${t}"]`).click();
      await expect(page.locator(`#pane-${t}`)).toHaveClass(/\bactive\b/);
      await expect(page.locator('#results .tabpane.active')).toHaveCount(1);
    }
  });

  // BUG CONOCIDO: el dropzone usa $("#fileInput") (js/analizador.js:95), que por el id
  // duplicado devuelve el input del "Cargar Excel (legado)" del encabezado
  // (single, solo .xlsx/.xls, onchange=loadExcel). Hacer clic en el dropzone abre ese
  // selector: no permite elegir varios archivos ni .csv, y además dispara loadExcel().
  test.fail('clic en el dropzone abre un selector múltiple que acepta .csv', {
    annotation: { type: 'bug', description: 'js/analizador.js:95 toma el #fileInput equivocado (id duplicado)' },
  }, async ({ page }) => {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('#dropzone').click(),
    ]);
    expect(chooser.isMultiple()).toBe(true);
    expect(await chooser.element().getAttribute('accept')).toContain('.csv');
  });
});
