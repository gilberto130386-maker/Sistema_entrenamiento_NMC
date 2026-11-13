# Pruebas E2E — Control de Entrenamientos NMC

Pruebas de extremo a extremo con [Playwright](https://playwright.dev/) sobre la SPA
estática `Sistema_entrenamiento_NMC.html`.

## Ejecutar

```bash
npm install
npx playwright install chromium   # solo la primera vez
npm run test:e2e                  # toda la suite (headless)
npm run test:e2e:headed           # viendo el navegador
npm run test:e2e:report           # abrir el reporte HTML
npx playwright test e2e/specs/04-alta-baja.spec.ts   # una sola suite
```

Si el equipo ya tiene un Chromium instalado, se puede reutilizar con
`PW_CHROMIUM_PATH=/ruta/a/chromium npm run test:e2e`.

## Cómo funciona

| Pieza | Qué hace |
|---|---|
| `playwright.config.ts` | Levanta `e2e/support/static-server.mjs` (servidor estático sin dependencias) y apunta las pruebas a `http://127.0.0.1:4173`. |
| `e2e/support/fixtures.ts` | Hace la app **hermética**: aborta Google Fonts, sirve `xlsx`, `jspdf` y `jspdf-autotable` (las mismas versiones del CDN) desde `node_modules`, desactiva el respaldo automático al abrir y **falla la prueba si hay errores JS no capturados**. |
| `e2e/support/app.page.ts` | Page Object: navegación, listados, paginador, toasts y lectura del estado (`EXAMS`, `EMPLOYEES`, `localStorage`). |

Cada prueba corre en un contexto de navegador nuevo, así que `localStorage`
empieza vacío y las pruebas son independientes entre sí.

## Cobertura

| Suite | Flujos |
|---|---|
| `01-carga-navegacion` | Carga sin errores, las 8 vistas del menú lateral, logo, menú ⋮, Escape cierra modales, menú contraído persistente. |
| `02-examenes` | Paginación (15/pág.), búsqueda por ID/tema, filtros de estatus, cumplimiento y área (cascada área→puesto), detalle, correo por fila, links seguros. |
| `03-empleados` | Paginación (18/pág.), búsqueda, filtros combinados, tabla/tarjetas, modal, cambio de estatus persistente, checks de examen persistentes. |
| `04-alta-baja` | Validación del formulario de alta, alta persistente con exámenes heredados del puesto, nombre duplicado, XSS en el nombre, baja reversible (Inactivo) y definitiva. |
| `05-dashboard-matriz` | KPIs vs. datos, actualización en vivo, ocultar/restaurar KPIs persistente, gráfica por área, matriz examen×área. |
| `06-analizador` | Carga de CSV por arrastrar y soltar, detección de examen, análisis, sincronización automática del check al Sistema. |
| `07-gestion` | Alta/edición/borrado de exámenes con persistencia, validaciones, confirmación, URL `javascript:` neutralizada. |
| `08-respaldo` | Descarga manual (formato y contenido), restauración ida y vuelta, archivos inválidos rechazados, respaldo automático al abrir. |
| `09-exportar-importar` | Excel (3 hojas verificadas), PDF de Skill Matrix y de reporte, importación de calificaciones JSON (auto-aprobación, idempotencia, errores). |

## Defectos conocidos (`test.fail`)

Las pruebas marcadas con `test.fail()` documentan **bugs reales** de la app. La suite
sigue en verde mientras el defecto exista; cuando se corrija, Playwright reportará
esa prueba como *"expected to fail"* y habrá que quitar el `test.fail`.

| Prueba | Defecto |
|---|---|
| `01` · IDs duplicados | `id="fileInput"` existe dos veces (`Sistema_entrenamiento_NMC.html` línea 101 y 319). |
| `06` · Dropzone del Analizador | `js/analizador.js:95` usa `$("#fileInput")` y obtiene el input del "Cargar Excel (legado)": al hacer clic, el selector no permite varios archivos ni `.csv`. |
| `07` · Buscador de Gestión | `renderGestion()` recrea el `<input id="g-q">` en cada tecla: al teclear "kanban" solo queda "k" y se pierde el foco. |
| `05` · KPI Cumplimiento | `countUp()` redondea el valor final: "19.4%" se muestra como "19%", distinto del subtítulo de Aprobados. |
