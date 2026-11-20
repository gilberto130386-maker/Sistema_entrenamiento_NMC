# Sistema de Entrenamiento NMC — Documentación de arquitectura

> Documento generado a partir de la lectura directa del código fuente de la rama
> `claude/dreamy-lovelace-lt1lzg` (último commit base: `7d0ca57`, PR #18).
> Cada afirmación indica el archivo y la línea donde se puede verificar.

---

## 1. ¿Qué es la aplicación?

Aplicación web **de una sola página (SPA), sin servidor y sin paso de compilación**,
para controlar el entrenamiento del personal: qué exámenes aplican a cada puesto,
quién los ha aprobado, indicadores de cumplimiento, certificados y reportes en PDF,
matriz de habilidades (Skill Matrix), organigrama y respaldo de datos.

- Se abre directamente en el navegador con doble clic sobre
  `Sistema_entrenamiento_NMC.html`.
- **No hay backend ni base de datos**: los datos iniciales vienen embebidos en
  `js/datos.js` y todos los cambios se guardan en el `localStorage` del navegador.
- Interfaz en español.

---

## 2. Tecnologías

| Capa | Tecnología | Dónde se declara |
|---|---|---|
| Estructura | HTML5 (un solo documento con 8 vistas) | `Sistema_entrenamiento_NMC.html` |
| Estilos | CSS3 con variables (`:root`), sin framework | `css/estilos.css` |
| Lógica | JavaScript *vanilla* (ES2015+), scripts clásicos `<script src>` — sin módulos ES, sin bundler | `js/*.js` |
| Lectura/escritura Excel | SheetJS `xlsx` 0.18.5 (CDN cdnjs) | `Sistema_entrenamiento_NMC.html:9` |
| Generación de PDF | jsPDF 2.5.1 + jsPDF-AutoTable 3.5.31 (CDN cdnjs) | `Sistema_entrenamiento_NMC.html:10-11` |
| Tipografías | Google Fonts: Syne, Inter, Outfit | `Sistema_entrenamiento_NMC.html:7-8` |
| Gráficas del Dashboard | SVG generado a mano (sin librería de gráficas) | `js/sistema.js:1143-1430` (`_svgPie`, `_svgDonut`, `_svgCombo`) |
| Persistencia | `localStorage` del navegador (llaves con prefijo `nmc-`) | ver sección 6 |

**Dependencia de red:** las tres librerías y las fuentes se cargan desde Internet.
Sin conexión la aplicación abre y funciona, pero fallan la importación/exportación
de Excel y la generación de PDF (el propio código lo advierte, p. ej.
`js/sistema.js:4865`).

---

## 3. Estructura de archivos

| Archivo | Líneas | Tamaño | Responsabilidad |
|---|---:|---:|---|
| `Sistema_entrenamiento_NMC.html` | 1 714 | 180 KB | Esqueleto de la app: encabezado, menú lateral, las 8 vistas y los modales. Carga CSS y scripts. |
| `css/estilos.css` | 554 | 42 KB | Tema visual (variables de color, tipografía, tarjetas, tablas, menú lateral, modales). |
| `js/datos.js` | 9 | 200 KB | **Datos semilla** embebidos como literales JSON (ver §5). |
| `js/sistema.js` | 4 946 | 230 KB | **Núcleo**: inicialización, navegación, filtros, Exámenes, Empleados, Matriz, Dashboard, certificados, reportes, Excel, correo, persistencia. |
| `js/gestion.js` | 917 | 48 KB | **Capa de Gestión**: catálogo de puestos, CRUD de exámenes y puestos, asignaciones puesto ↔ examen. |
| `js/organigrama.js` | 702 | 38 KB | Pestaña Organigrama dentro de Gestión (jerarquía de puestos). |
| `js/analizador.js` | 859 | 149 KB | **Analizador de Formularios**: cruza exportaciones de Microsoft Forms contra el padrón y sincroniza aprobados. |
| `js/matriz-habilidades.js` | 1 037 | 48 KB | **Skill Matrix**: matriz Puestos × Exámenes por área y exportación a PDF configurable. |
| `js/sm-pdf-font.js` | 9 | 323 KB | Fuente DejaVu Sans (subconjunto) en Base64 para que el PDF de Skill Matrix muestre símbolos Unicode (✓ ✗ ★ …). |
| `js/respaldo.js` | 275 | 12 KB | Sección Respaldo: exportar/importar todas las llaves `nmc-*` como `.json`. |

Total de código funcional: **11 024 líneas / ~1.3 MB** (medido con `wc -lc`).

### Orden de carga de scripts (importa, porque comparten variables globales)

```
datos.js → sistema.js → gestion.js → organigrama.js → analizador.js → respaldo.js
          … (HTML de modales) …
sm-pdf-font.js → matriz-habilidades.js
```
Referencia: `Sistema_entrenamiento_NMC.html:974-986` y `:1712-1713`.

---

## 4. Arquitectura general

```
┌──────────────────────────── Sistema_entrenamiento_NMC.html ─────────────────────────────┐
│  Encabezado (menú ⋮: formato, Excel legado, guardar ajustes)                            │
│  Menú lateral ── showView(nombre) ──► activa  <div class="view" id="view-…">            │
│                                                                                         │
│  Exámenes │ Empleados │ Matriz │ Dashboard │ Analizador │ Skill Matrix │ Gestión │ Respaldo│
└─────┬──────────┬─────────┬─────────┬──────────┬─────────────┬──────────────┬────────┬───┘
      └──────────┴─────────┴─────────┘          │             │              │        │
                 sistema.js                analizador.js  matriz-        gestion.js  respaldo.js
                     ▲                          │         habilidades.js  organigrama.js
                     │                          │             │              │
        ┌────────────┴──── Estado global en memoria (variables `let` compartidas) ───────┐
        │  EXAMS[]  EMPLOYEES[]  COL_META  ALL_AREAS  ALL_PUESTOS  (datos.js)           │
        │  PUESTOS[]  ASSIGNMENTS[]  (gestion.js)    window._examChecks (sistema.js)    │
        │  Índices: _examEmpMap, _empMap, _numMap  (_rebuildIndexes, sistema.js:11)     │
        └────────────────────────────────────┬──────────────────────────────────────────┘
                                             │ save*/load*
                                   localStorage  (llaves nmc-*)
                                             │
                                  respaldo.js ⇄ archivo .json
```

**Patrón:** arquitectura *monolítica modular por archivos*. Cada archivo es un módulo
funcional; se comunican mediante **variables y funciones globales** (p. ej.
`gestion.js` llama a `saveDataset()`, `_rebuildIndexes()`, `renderEmps()` de
`sistema.js`). `analizador.js`, `respaldo.js` y `matriz-habilidades.js` están
encapsulados en una IIFE `(function(){ … })()` para no chocar con nombres del núcleo
(p. ej. el Analizador redefine sus propios `$`/`$$`, `js/analizador.js:3-5`).

El renderizado es **imperativo**: cada vista tiene una función `render…()` que
construye HTML como texto (*template strings*) y lo asigna a `innerHTML`. El texto
del usuario se escapa con `esc()` (`js/sistema.js:48`) y las URLs se validan con
`safeUrl()` (`js/sistema.js:56`).

---

## 5. Modelo de datos

Cifras medidas al evaluar `js/datos.js` con Node.js:

| Variable | Registros | Descripción |
|---|---:|---|
| `EXAMS` | 39 | Exámenes / formularios de entrenamiento |
| `EMPLOYEES` | 232 | Padrón de empleados |
| `COL_META` | 70 | Pares área–puesto (columnas del Excel original) |
| `ALL_AREAS` | 16 | Áreas del padrón |
| `ALL_EXAM_AREAS` | 11 | Áreas usadas en la asignación de exámenes |
| `ALL_PUESTOS` | 68 | Catálogo de puestos |

**Examen** (`EXAMS[i]`):
```js
{ id:"REG-001", tema, url /* link de MS Forms */, edicion, edicion_url,
  estatus:"Activo", aplica:[{ area, puesto }, …] }
```

**Empleado** (`EMPLOYEES[i]`):
```js
{ id:"EMP-001", numero /* clave estable de persistencia */, nombre, email,
  puesto, area, supervisor, cert_cofc, cert_examen, puntaje,
  estatus /* Aprobado | Pendiente | En Proceso … */, horario, ingreso,
  exam_ids:["REG-001", …] }
```

**Capa de Gestión** (`js/gestion.js:17-18`):
```js
PUESTOS     = [{ id:"PST-001", nombre, area, /* opcionales del organigrama: */
                 reportaA, orgRaiz, orgSuelto, nivel, titular, plazas, turno,
                 descripcion, responsabilidades, requisitos }]
ASSIGNMENTS = [{ puestoId:"PST-001", examId:"REG-001" }]   // tabla normalizada N:M
```

**Relación clave:** Puesto ⟷ Examen (N:M vía `ASSIGNMENTS`). Un empleado hereda los
exámenes de su puesto en `exam_ids`; `_syncAllEmpExamIdsFromCatalog()`
(`js/gestion.js:739`) mantiene esa coherencia. El avance individual por examen se
guarda en `window._examChecks[empId][examId]` (`js/sistema.js:735-747`).

---

## 6. Persistencia (`localStorage`)

| Llave | Contenido | Escribe |
|---|---|---|
| `nmc-dataset` | Exámenes, empleados y catálogos completos (versión `v:1`) | `saveDataset()` `js/sistema.js:4079` |
| `nmc-employee-data` | `{ overrides, statuses, checks }` por número de empleado | `saveEmployeeData()` `:3943`, `_saveEmpOverride()` `:3030` |
| `nmc-extra-employees` | Empleados dados de alta manualmente | `_saveExtraEmployees()` `:4039` |
| `nmc-deleted-employees` | Empleados dados de baja | `_saveDeletedKey()` `:4057` |
| `nmc-puestos` | `{ puestos, assignments }` (versión 2) | `savePuestos()` `js/gestion.js:218` |
| `nmc-puestos-bak-v1` | Copia previa a la migración v1→v2 | `_backupPuestosV1()` `js/gestion.js:249` |
| `nmc-puestos-nomigrar` | Bandera para no volver a migrar | `restorePuestosBackup()` `js/gestion.js:258` |
| `nmc-app-settings` | Formato, colores, tipos de gráfica | `saveSettings()` `js/sistema.js:4425` |
| `nmc-dashboard-layout` | Orden de KPIs y paneles | `saveDashboardLayout()` `:3741` |
| `nmc-hidden-kpis` | KPIs ocultos | `_saveHiddenKpis()` `:1517` |
| `nmc-sidenav-collapsed` | Menú lateral colapsado | `toggleSidenav()` `:862` |
| `nmc-analyzer-sync` | Paquete de calificaciones del Analizador | `_autoSyncChecksToSistema()` `js/analizador.js:324` |
| `nmc-analyzer-sync-applied` | Marca del último paquete aplicado | `_checkAnalyzerSync()` `js/sistema.js:3893` |
| `nmc-sm-pdf-config` | Configuración del PDF de Skill Matrix | `js/matriz-habilidades.js:270` |
| `nmc-respaldo-config` | Preferencias del respaldo (auto‑descarga). **No** entra al respaldo | `js/respaldo.js:18` |

> El `localStorage` es por navegador y por origen: si se abre el HTML desde otra
> carpeta u otro navegador, los cambios no aparecen. Por eso existe la sección
> **Respaldo** (§8.8).

---

## 7. Secuencia de arranque

Todo se dispara con `DOMContentLoaded`, en el orden en que se registraron los
manejadores (orden de carga de los scripts):

1. **`sistema.js`** (`js/sistema.js:222-246`)
   1. `_loadDashboardLayout()`, `_loadHiddenKpis()` — preferencias del Dashboard.
   2. `loadDataset()` — si existe `nmc-dataset`, reemplaza los datos semilla.
   3. `_rebuildIndexes()` — índices examen→empleados.
   4. `_loadExtraEmployees()`, `_applyDeletedFilter()`, `loadEmployeeData()` — altas, bajas, estatus y checks.
   5. `buildAreaPuestoFilters()`, `refreshAllKPIs()`, `renderExams()`, `renderEmps()`, `renderMatrix()`.
   6. `_checkAnalyzerSync()` — aplica calificaciones pendientes del Analizador.
   7. `setTimeout(loadSettings, 400)` — formato visual.
2. **`gestion.js`** (`js/gestion.js:877-917`)
   1. Inyecta modales; `loadPuestos()` y, si hace falta, migración v1→v2 con respaldo previo.
   2. `bootstrapPuestosFromData()` — incorpora puestos/asignaciones que falten (fusión no destructiva) y `savePuestos()`.
   3. `_syncAllEmpExamIdsFromCatalog()` — el catálogo de Gestión es la **fuente de verdad** de qué exámenes aplican; si algo cambió, re‑indexa, guarda y vuelve a pintar.
   4. `renderGestion()`.
3. **`respaldo.js`** — `_init()` (`js/respaldo.js:269-273`): pinta la sección y, si está activo, descarga un respaldo automático 1.2 s después de abrir.
4. **`matriz-habilidades.js`** — prepara filtros y pinta la Skill Matrix.

---

## 8. Módulos funcionales (vistas)

La navegación es `showView(nombre)` (`js/sistema.js:252`), que alterna la clase
`active` entre `#view-<nombre>` y `#nav-<nombre>`. El orden de los botones del menú
se puede reacomodar con arrastrar y soltar (`toggleNavArrange`, `js/sistema.js:782`).

### 8.1 Exámenes (`view-exams`)
- Lista paginada (15 por página) con búsqueda y filtros de área/puesto (`filterExams`, `renderExams`).
- Detalle de examen con empleados asignados y su estatus (`showExamDetail`, `renderEmpAssign`).
- Envío de correo masivo: abre Outlook Web (`outlook.office365.us`, máx. 50 destinatarios) y copia al portapapeles el cuerpo HTML (`buildOutlookUrl`, `openOutlookCompose`, `js/sistema.js:4537-4545`).
- Copia de la matriz Examen × Puesto en HTML (`copyExamPuestoMatrix`).

### 8.2 Empleados (`view-employees`)
- Tarjetas paginadas (18 por página) con filtros (`filterEmps`, `renderEmps`, `empCard`).
- Ficha del empleado con checks por examen y barra de avance (`openEmpModal`, `toggleExamCheck`).
- Edición, **alta** (`openAltaPanel`/`submitAlta`) y **baja** (`openBajaConfirm`/`applyBaja`).
- **Certificado PDF** horizontal tamaño carta para empleados con estatus *Aprobado* (`generateCertificate`, `js/sistema.js:2360`).
- **Reporte PDF** de empleados con columnas seleccionables (`REPORT_COLUMNS` `:4767`, `generateEmpReport` `:4863`).
- Restablecer estatus masivo por área/puesto (`openResetStatusPanel` … `applyResetStatus`).

### 8.3 Matriz (`view-matrix`)
Tabla Exámenes × Áreas con cobertura, mostrando solo áreas con al menos un examen
asignado (`renderMatrix`, `js/sistema.js:3062`).

### 8.4 Dashboard (`view-dashboard`)
- KPIs: Empleados, Aprobados, Pendientes, En Proceso, Cumplimiento (`KPI_LABELS`, `js/sistema.js:1052`); se pueden ocultar/restaurar y reordenar.
- Paneles: Empleados por Área, Cobertura de Exámenes, Aprobados vs Pendientes (`PANEL_LABELS` `:1053`).
- Tipo de gráfica por panel: número, barra, pastel, dona, progreso, apilada o *combo* barra+línea (`CHART_TYPES` `:1009`, `_svgCombo` `:1241`), dibujadas en SVG y ajustadas con `ResizeObserver`.

### 8.5 Analizador de Formularios (`view-analizador`, `js/analizador.js`)
- Se arrastran los Excel exportados de Microsoft Forms. Detecta automáticamente las columnas de nombre, correo y puntos (`HEAD_NAME`, `HEAD_EMAIL`, `HEAD_POINTS`, `js/analizador.js:103-105`) y adivina a qué examen corresponde cada archivo (`guessExam`).
- Cruza contra el maestro de empleados por correo/nombre (`matchEmployee`, `runAnalysis`).
- 8 pestañas de resultados: Resumen Ejecutivo, Diccionario de Datos, Calidad de Datos, Maestro ↔ Formularios, Estadísticas, Correlación de Variables (Pearson, `pearson()`), Hallazgos y Riesgos, Recomendaciones (`Sistema_entrenamiento_NMC.html:333-340`).
- Exportación CSV y PDF.

### 8.6 Skill Matrix (`view-skillmatrix`, `js/matriz-habilidades.js`)
- Matriz por área de Puestos × Exámenes (OK = aprobado, X = pendiente), filtro por área y por certificación, KPIs y encabezados verticales con auto‑ajuste.
- Exportación PDF (jsPDF + AutoTable) con configuración persistente: logo, alineación y desplazamiento de textos, tipografía, leyenda con símbolo/tamaño/color por caja (`SM_PDF_CONFIG_DEFAULT`, `js/matriz-habilidades.js:271`). Usa la fuente embebida de `sm-pdf-font.js` para símbolos Unicode.

### 8.7 Gestión (`view-gestion`, `js/gestion.js` + `js/organigrama.js`)
Vía recomendada de captura de datos (reemplaza al Excel). Pestañas:
- **Exámenes**: alta/edición/baja de exámenes y sus links (`gSaveExam`, `gDeleteExam`).
- **Puestos**: catálogo de puestos por área (`gSavePuesto`, `gDeletePuesto`).
- **Asignaciones**: matriz de casillas puesto ↔ examen en dos modos (por puesto / por examen), con selección masiva (`toggleAsg`, `asgBulk`). Cada cambio se propaga a los `exam_ids` de los empleados (`_applyAssignmentToEmployees`).
- **Organigrama**: jerarquía de puestos con vistas *Planta* y *Por área*, zoom, búsqueda, colapsar/expandir y arrastrar‑soltar. Si no se captura a mano, "Reporta a" se deduce del **supervisor** del padrón por similitud de nombre (`_orgResolveSupervisor`, `_orgGraph`, `js/organigrama.js:116-197`). Niveles con color en `ORG_NIVELES` (`:24`).

### 8.8 Respaldo (`view-respaldo`, `js/respaldo.js`)
- Respaldo = foto de **todas** las llaves `nmc-*` en un `.json`
  `{ app, formato, generado, claves, datos }` (`js/respaldo.js:1-16`).
- Descarga automática al abrir (desactivable), descarga manual y restauración.
- La restauración valida el archivo (`_validar`) y, si falla al escribir, **revierte** al estado previo (`_aplicar`, `js/respaldo.js:164-180`).

### 8.9 Menú ⋮ del encabezado
Panel de formato (colores, acento, encabezados/celdas de tabla), descarga de Excel
(`downloadExcel`, `js/sistema.js:3406`) y **carga de Excel (legado)**
(`loadExcel`, `:3447`), conservada solo para migrar o rescatar datos.

---

## 9. Flujos de integración entre módulos

**Analizador → Sistema (calificaciones):**
```
Analizador.runAnalysis()
  └─ _autoSyncChecksToSistema()          js/analizador.js:324
       └─ localStorage['nmc-analyzer-sync'] = { v:1, generated, passThr, results:[{num, examReg, pct}] }
            ├─ misma pestaña:  _checkAnalyzerSync()            js/sistema.js:3893
            ├─ otra pestaña:   evento 'storage'                js/sistema.js:3939
            └─ alternativa:    importAnalyzerFile(.json)       js/sistema.js:3914
                 └─ applyAnalyzerSync()  marca checks y estatus "Aprobado" (idempotente)
```

**Gestión → Empleados (exámenes aplicables):**
```
toggleAsg / gSavePuesto / gSaveExam
  └─ ASSIGNMENTS → _commitAssignments → _syncExamAplica (exam.aplica)
                 → _applyAssignmentToEmployees (emp.exam_ids)
  └─ savePuestos() + saveDataset() → _refreshSistemaViews() (re-render)
```

---

## 10. Cómo ejecutar

1. Descomprimir el ZIP conservando la estructura de carpetas (`css/`, `js/`).
2. Abrir `Sistema_entrenamiento_NMC.html` en Chrome o Edge.
3. Tener Internet al menos la primera vez (CDN de Excel/PDF y fuentes).
4. Para mover datos entre equipos o navegadores: **Respaldo → Descargar** y luego
   **Respaldo → Restaurar** en el destino.

---

## 11. Consideraciones

- **Datos personales:** `js/datos.js` contiene el padrón real (nombres, números de
  empleado y correos). Compartir el ZIP implica compartir esos datos.
- **Sin control de acceso:** cualquiera con el archivo puede ver y editar.
- **Capacidad:** `localStorage` suele limitarse a ~5 MB por origen (límite del
  navegador, no de la app); el respaldo `.json` evita pérdida si se borra el caché.
- **Acoplamiento global:** los módulos dependen de nombres globales y del orden de
  carga; cambiar el orden de los `<script>` rompe la inicialización.
