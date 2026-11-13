import { expect, type Locator, type Page } from '@playwright/test';

export type Vista =
  | 'exams' | 'employees' | 'matrix' | 'dashboard'
  | 'analizador' | 'skillmatrix' | 'gestion' | 'respaldo';

export const VISTAS: Vista[] = [
  'exams', 'employees', 'matrix', 'dashboard',
  'analizador', 'skillmatrix', 'gestion', 'respaldo',
];

/** Page Object de la SPA "Control de Entrenamientos — NMC". */
export class AppPage {
  constructor(readonly page: Page) {}

  // ── Navegación / ciclo de vida ─────────────────────────────────
  async abrir() {
    await this.page.goto('/Sistema_entrenamiento_NMC.html');
    await this.esperarListo();
  }

  /** La app está lista cuando el catálogo de exámenes y el directorio se renderizaron. */
  async esperarListo() {
    await expect(this.page.locator('#ex-tbody tr[data-id]').first()).toBeVisible();
    await expect(this.page.locator('#emp-pager')).toContainText('registros');
  }

  async recargar() {
    await this.page.reload();
    await this.esperarListo();
  }

  navBtn(v: Vista): Locator { return this.page.locator(`#nav-${v}`); }
  vista(v: Vista): Locator { return this.page.locator(`#view-${v}`); }

  async irA(v: Vista) {
    await this.navBtn(v).click();
    await expect(this.vista(v)).toHaveClass(/\bactive\b/);
  }

  get toast(): Locator { return this.page.locator('#toast'); }

  async esperarToast(texto: string | RegExp) {
    await expect(this.toast).toHaveClass(/\bshow\b/);
    await expect(this.toast).toContainText(texto);
  }

  /** Lee el estado en memoria de la app (variables globales `let` del script clásico). */
  async datos() {
    return this.page.evaluate(() => ({
      // @ts-ignore — globales de la app
      exams: EXAMS.length as number,
      // @ts-ignore
      empleados: EMPLOYEES.length as number,
      // @ts-ignore
      aprobados: EMPLOYEES.filter((e) => e.estatus === 'Aprobado').length as number,
      // @ts-ignore
      pendientes: EMPLOYEES.filter((e) => e.estatus === 'Pendiente').length as number,
    }));
  }

  async localStorageJSON<T = any>(key: string): Promise<T | null> {
    return this.page.evaluate((k) => {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    }, key);
  }

  // ── Exámenes ───────────────────────────────────────────────────
  get filasExamen(): Locator { return this.page.locator('#ex-tbody tr[data-id]'); }
  get pagerExamen(): Locator { return this.page.locator('#ex-pager'); }

  async buscarExamen(q: string) {
    await this.page.locator('#ex-q').fill(q);
  }

  // ── Empleados ──────────────────────────────────────────────────
  get filasEmpleado(): Locator { return this.page.locator('#emp-container tbody tr'); }
  get pagerEmpleado(): Locator { return this.page.locator('#emp-pager'); }

  async buscarEmpleado(q: string) {
    await this.page.locator('#emp-q').fill(q);
  }

  /** Abre el modal de detalle de un empleado buscándolo por número. */
  async abrirEmpleadoPorNumero(numero: string) {
    await this.irA('employees');
    await this.buscarEmpleado(numero);
    await expect(this.filasEmpleado).toHaveCount(1);
    await this.filasEmpleado.first().click();
    await expect(this.page.locator('#emp-modal')).toHaveClass(/\bopen\b/);
  }

  /** Número de registros que informa el paginador ("1/13 · 232 registros"), o null si
   *  el paginador está vacío (renderPager no dibuja nada cuando hay una sola página). */
  async totalEnPager(pager: Locator): Promise<number | null> {
    const txt = (await pager.innerText()).replace(/\s+/g, ' ');
    const m = txt.match(/(\d+)\s+registros/);
    return m ? Number(m[1]) : null;
  }

  /** Total de resultados de un listado: lo que diga el paginador o, si no hay, las filas visibles. */
  async totalResultados(pager: Locator, filas: Locator): Promise<number> {
    return (await this.totalEnPager(pager)) ?? (await filas.count());
  }

  async totalExamenes() { return this.totalResultados(this.pagerExamen, this.filasExamen); }
  async totalEmpleados() { return this.totalResultados(this.pagerEmpleado, this.filasEmpleado); }
}
