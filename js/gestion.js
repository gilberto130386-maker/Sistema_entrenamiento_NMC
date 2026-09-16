// ════════════════════════════════════════════════════════════════
// CAPA DE GESTIÓN — Puestos, Links de Exámenes y Asignaciones
// ----------------------------------------------------------------
// Reemplaza la carga de Excel como ENTRADA de datos. Introduce:
//   • PUESTOS[]      — el puesto como entidad de primera clase
//   • ASSIGNMENTS[]  — tabla de asignaciones puesto ↔ examen (modelo
//                      normalizado, separado de exam.aplica)
//   • CRUD de exámenes (alta de links) y de puestos, con UI propia
//
// Persistencia: localStorage['nmc-puestos'] = { puestos, assignments }
// Los exámenes siguen viviendo en EXAMS[] (sistema.js) y se persisten
// vía saveDataset(). La carga de Excel se conserva como importación
// legado — el bootstrap hidrata PUESTOS/ASSIGNMENTS desde lo existente.
// ════════════════════════════════════════════════════════════════

// ── Estado ────────────────────────────────────────────────────────
let PUESTOS     = [];   // { id:"PST-001", nombre, area }
let ASSIGNMENTS = [];   // { puestoId:"PST-001", examId:"REG-001" }

const _GESTION_LS_KEY = 'nmc-puestos';
const _GESTION_LS_BAK = 'nmc-puestos-bak-v1';   // respaldo previo a migrar
const _GESTION_LS_SKIP= 'nmc-puestos-nomigrar'; // lo pone restorePuestosBackup()
const _GESTION_LS_VER = 2;                      // v2: áreas canonizadas
let   _puestosNeedMigration = false;            // lo marca loadPuestos()
// Modo v1: lo activa restorePuestosBackup(). Congela TODA la semántica
// antigua (ni migración ni traducción de áreas), para que restaurar el
// respaldo devuelva exactamente el estado anterior y no uno intermedio.
let   _puestosLegacyMode = (() => {
  try { return !!localStorage.getItem('nmc-puestos-nomigrar'); } catch(_){ return false; }
})();

// ── Helpers de identidad ──────────────────────────────────────────
function _normArea(a){   return String(a||'').trim().toUpperCase(); }
function _normNombre(n){ return String(n||'').trim().toUpperCase(); }
function _puestoKey(area, nombre){
  return `${_normArea(area)}||${_normNombre(nombre)}`;
}
function _findPuesto(area, nombre){
  const k = _puestoKey(area, nombre);
  return PUESTOS.find(p => _puestoKey(p.area, p.nombre) === k) || null;
}
function _nextPuestoId(){
  const nums = PUESTOS
    .map(p => { const m = String(p.id||'').match(/PST-(\d+)/); return m ? +m[1] : 0; })
    .filter(n => n > 0);
  return `PST-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3,'0')}`;
}
function _ensurePuesto(area, nombre){
  const nom = String(nombre||'').trim();
  if(!nom) return null;
  let p = _findPuesto(area, nom);
  if(!p){
    p = { id:_nextPuestoId(), nombre:nom, area:String(area||'').trim() };
    PUESTOS.push(p);
  }
  return p;
}

// ── Helpers de asignación (tabla normalizada) ─────────────────────
function _hasAssignment(puestoId, examId){
  return ASSIGNMENTS.some(a => a.puestoId === puestoId && a.examId === examId);
}
function assignExam(puestoId, examId){
  if(puestoId && examId && !_hasAssignment(puestoId, examId))
    ASSIGNMENTS.push({ puestoId, examId });
}
function unassignExam(puestoId, examId){
  ASSIGNMENTS = ASSIGNMENTS.filter(a => !(a.puestoId === puestoId && a.examId === examId));
}
function _examIdsForPuestoId(puestoId){
  return ASSIGNMENTS.filter(a => a.puestoId === puestoId).map(a => a.examId);
}
function _puestoIdsForExam(examId){
  return ASSIGNMENTS.filter(a => a.examId === examId).map(a => a.puestoId);
}

// ── Vocabulario de áreas (canónico = el del padrón de empleados) ───
// El Excel legado trae DOS vocabularios de área para el mismo puesto:
// el del lado examen en ex.aplica ("Produccion", "RH", "Finanzas"…) y
// el del lado empleado ("MOLDEO", "SECUNDARIOS", "RECURSOS HUMANOS"…).
// Como la identidad del puesto es área||nombre, tratarlos como distintos
// partía cada puesto en dos entradas: una con todos sus exámenes y otra
// vacía — y los empleados caían siempre en la vacía (de ahí los 0/0).
// El padrón de empleados manda: es el que usan filtros, KPIs y matriz.
function _empAreaCanon(){
  const m = {};
  (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []).forEach(e => {
    const a = String(e.area||'').trim();
    if(a && !m[_normArea(a)]) m[_normArea(a)] = a;
  });
  return m;
}
// Áreas del padrón donde realmente existe un puesto con ese nombre.
function _empAreasForPuestoName(nombre){
  const key = _normNombre(nombre);
  const out = new Map();
  (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []).forEach(e => {
    if(_normNombre(e.puesto) !== key) return;
    const a = String(e.area||'').trim();
    if(a) out.set(_normArea(a), a);
  });
  return [...out.values()];
}
// Traduce el área declarada en ex.aplica al vocabulario del padrón.
// Manda el padrón: en el Excel la columna del examen es por PUESTO, no
// por área, así que el examen aplica en todas las áreas donde ese puesto
// existe (p. ej. JEFE DE LINEA A en KirkHill y en MOLDEO). No basta con
// validar que el área declarada exista: "PRODUCTION PLANNER" se declara
// en un área real donde ningún empleado tiene ese puesto.
// Si el puesto no existe en el padrón, se conserva el área declarada
// (es un puesto de catálogo, todavía sin gente).
function _resolveAplicaAreas(area, nombre, canon){
  if(_puestosLegacyMode) return [String(area||'').trim()];   // semántica v1
  const reales = _empAreasForPuestoName(nombre);
  if(reales.length) return reales;
  const k = _normArea(area);
  return [canon[k] || String(area||'').trim()];
}
// Devuelve la escritura ya en uso para un área si solo difiere en
// mayúsculas/espacios, para no partirla en dos entradas del catálogo.
function _canonicalArea(area){
  const k = _normArea(area);
  if(!k) return String(area||'').trim();
  const canon = _empAreaCanon();
  if(canon[k]) return canon[k];
  const p = PUESTOS.find(x => _normArea(x.area) === k);
  return p ? p.area : String(area||'').trim();
}

// ── Bootstrap (Fase 0) ────────────────────────────────────────────
// Hidrata PUESTOS/ASSIGNMENTS desde los datos existentes (exam.aplica
// + EMPLOYEES). Es idempotente y MERGE: solo añade lo que falte, nunca
// destruye puestos ni asignaciones creados manualmente.
function bootstrapPuestosFromData(){
  const canon = _empAreaCanon();
  // 1. Puestos y asignaciones derivados del catálogo de exámenes
  (typeof EXAMS !== 'undefined' ? EXAMS : []).forEach(ex => {
    (ex.aplica || []).forEach(m => {
      _resolveAplicaAreas(m.area, m.puesto, canon).forEach(area => {
        const p = _ensurePuesto(area, m.puesto);
        if(p) assignExam(p.id, ex.id);
      });
    });
  });
  // 2. Puestos que solo existen a través de empleados (sin exámenes aún)
  (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []).forEach(e => {
    if((e.puesto||'').trim()) _ensurePuesto(e.area, e.puesto);
  });
}

// ── Migración v1 → v2 ─────────────────────────────────────────────
// Repara el catálogo ya persistido: unifica la escritura del área,
// fusiona los puestos duplicados por vocabulario y arrastra consigo sus
// asignaciones. Devuelve el resumen (y los examIds tocados, para
// resincronizar ex.aplica una sola vez).
function migratePuestosCatalog(){
  const stats = { areasRenombradas:0, puestosFusionados:0, asignacionesMovidas:0, examenes:[] };
  const canon = _empAreaCanon();
  if(!Object.keys(canon).length) return stats;   // sin padrón no hay canon
  const tocados = new Set();

  // 1. Unificar la escritura del área con la del padrón
  PUESTOS.forEach(p => {
    const c = canon[_normArea(p.area)];
    if(c && p.area !== c){ p.area = c; stats.areasRenombradas++; }
  });

  // 2. Reubicar los puestos mal ubicados, con la misma regla que el
  //    bootstrap. Solo se mueven los que CARGAN asignaciones: así una
  //    entrada vacía (puesto dado de alta a mano, o el duplicado que
  //    quedó sin exámenes) nunca se borra — es el destino, no el origen.
  PUESTOS.filter(p => {
    if(p.manual) return false;                                  // alta manual: intocable
    if(!_examIdsForPuestoId(p.id).length) return false;          // sin exámenes: es destino
    const reales = _empAreasForPuestoName(p.nombre);
    return reales.length && !reales.some(a => _normArea(a) === _normArea(p.area));
  }).forEach(orf => {
    const destinos = _empAreasForPuestoName(orf.nombre);
    const examIds  = _examIdsForPuestoId(orf.id);
    destinos.forEach(area => {
      const dest = _ensurePuesto(area, orf.nombre);
      if(!dest || dest.id === orf.id) return;
      examIds.forEach(xid => {
        if(!_hasAssignment(dest.id, xid)){ assignExam(dest.id, xid); stats.asignacionesMovidas++; }
      });
    });
    PUESTOS     = PUESTOS.filter(p => p.id !== orf.id);
    ASSIGNMENTS = ASSIGNMENTS.filter(a => a.puestoId !== orf.id);
    examIds.forEach(x => tocados.add(x));
    stats.puestosFusionados++;
  });

  // 3. Fusionar los que hayan quedado con la misma clave tras canonizar
  const vistos = {};
  PUESTOS.slice().forEach(p => {
    const k = _puestoKey(p.area, p.nombre);
    if(!vistos[k]){ vistos[k] = p; return; }
    const keep = vistos[k];
    _examIdsForPuestoId(p.id).forEach(xid => {
      if(!_hasAssignment(keep.id, xid)){ assignExam(keep.id, xid); stats.asignacionesMovidas++; }
      tocados.add(xid);
    });
    PUESTOS     = PUESTOS.filter(x => x.id !== p.id);
    ASSIGNMENTS = ASSIGNMENTS.filter(a => a.puestoId !== p.id);
    stats.puestosFusionados++;
  });

  // 4. Descartar asignaciones que apunten a puestos/exámenes inexistentes
  const pids = new Set(PUESTOS.map(p => p.id));
  const xids = new Set((typeof EXAMS !== 'undefined' ? EXAMS : []).map(e => e.id));
  ASSIGNMENTS = ASSIGNMENTS.filter(a => pids.has(a.puestoId) && (!xids.size || xids.has(a.examId)));

  stats.examenes = [...tocados];
  return stats;
}

// ── Persistencia (Fase 1) ─────────────────────────────────────────
function savePuestos(){
  try {
    // En modo v1 no se sella como v2: así, al quitar el flag, la
    // migración vuelve a ofrecerse en lugar de quedar bloqueada.
    const payload = { v:(_puestosLegacyMode ? 1 : _GESTION_LS_VER),
                      ts:Date.now(), puestos:PUESTOS, assignments:ASSIGNMENTS };
    const json = JSON.stringify(payload);
    localStorage.setItem(_GESTION_LS_KEY, json);
    const back = localStorage.getItem(_GESTION_LS_KEY);
    return !!back && back.length === json.length;
  } catch(e){
    if(e && e.name === 'QuotaExceededError'){
      try { showToast('⚠️ Sin espacio para guardar puestos'); } catch(_){}
    } else console.warn('savePuestos error:', e);
    return false;
  }
}
function loadPuestos(){
  try {
    const raw = localStorage.getItem(_GESTION_LS_KEY);
    if(!raw) return false;
    const d = JSON.parse(raw);
    if(!d || !Array.isArray(d.puestos) || !Array.isArray(d.assignments)) return false;
    PUESTOS     = d.puestos;
    ASSIGNMENTS = d.assignments;
    _puestosNeedMigration = !(+d.v >= _GESTION_LS_VER) && !_puestosLegacyMode;
    return true;
  } catch(e){ console.warn('loadPuestos error:', e); return false; }
}

// Respaldo del estado v1 antes de migrar (solo la primera vez).
function _backupPuestosV1(){
  try {
    const raw = localStorage.getItem(_GESTION_LS_KEY);
    if(raw && !localStorage.getItem(_GESTION_LS_BAK)) localStorage.setItem(_GESTION_LS_BAK, raw);
  } catch(_){}
}
// Revertir la migración desde la consola: restorePuestosBackup()
// Deja marcado que no se vuelva a migrar; si no, la recarga siguiente
// repetiría la migración y la restauración no serviría de nada.
function restorePuestosBackup(){
  try {
    const raw = localStorage.getItem(_GESTION_LS_BAK);
    if(!raw){ console.warn('No hay respaldo previo a la migración.'); return false; }
    localStorage.setItem(_GESTION_LS_KEY, raw);
    localStorage.setItem(_GESTION_LS_SKIP, '1');
    _puestosLegacyMode = true;
    console.info('Catálogo restaurado al estado previo (migración desactivada). Recarga la página.');
    console.info('Para volver a migrar: localStorage.removeItem("' + _GESTION_LS_SKIP + '")');
    return true;
  } catch(e){ console.warn('restorePuestosBackup error:', e); return false; }
}
window.restorePuestosBackup = restorePuestosBackup;

// Llamar tras cargar un Excel legado para incorporar puestos/asignaciones nuevos
function syncPuestosAfterImport(){
  bootstrapPuestosFromData();
  savePuestos();
  if(document.getElementById('view-gestion')?.classList.contains('active')) renderGestion();
}
window.syncPuestosAfterImport = syncPuestosAfterImport;

// ── Utilidades de exámenes ────────────────────────────────────────
function _nextExamId(){
  const nums = (typeof EXAMS !== 'undefined' ? EXAMS : [])
    .map(e => { const m = String(e.id||'').match(/REG-(\d+)/); return m ? +m[1] : 0; })
    .filter(n => n > 0);
  return `REG-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3,'0')}`;
}

// Reconstruye ex.aplica desde ASSIGNMENTS (mantiene compatibilidad con el
// resto del sistema, que aún lee ex.aplica en varios puntos).
function _syncExamAplica(examId){
  const ex = EXAMS.find(e => e.id === examId);
  if(!ex) return;
  ex.aplica = _puestoIdsForExam(examId)
    .map(pid => PUESTOS.find(p => p.id === pid))
    .filter(Boolean)
    .map(p => ({ area:p.area, puesto:p.nombre }));
}

// ════════════════════════════════════════════════════════════════
// API PÚBLICA para el alta/edición de empleados (Fase 4)
// El catálogo (PUESTOS + ASSIGNMENTS) es la fuente de verdad: el alta
// lee sus áreas, puestos y exámenes desde aquí, no derivándolos de
// empleados existentes ni de ex.aplica.
// ════════════════════════════════════════════════════════════════
// Áreas y puestos se comparan normalizados (igual que _puestoKey): con
// `===` una diferencia de mayúsculas partía el área en dos entradas del
// desplegable y dejaba sus puestos fuera del alta.
function catalogAreas(){
  const m = new Map();
  PUESTOS.forEach(p => {
    const a = String(p.area||'').trim();
    if(a && !m.has(_normArea(a))) m.set(_normArea(a), a);
  });
  return [...m.values()].sort((a,b) => a.localeCompare(b));
}
function catalogPuestosForArea(area){
  const k = _normArea(area);
  const m = new Map();
  PUESTOS.forEach(p => {
    if(_normArea(p.area) !== k) return;
    const n = String(p.nombre||'').trim();
    if(n && !m.has(_normNombre(n))) m.set(_normNombre(n), n);
  });
  return [...m.values()].sort((a,b) => a.localeCompare(b));
}
// Pares área/puesto del catálogo, para que los filtros del sistema
// incluyan puestos dados de alta que aún no tienen empleados.
function catalogPuestoPairs(){
  return PUESTOS
    .map(p => ({ area:String(p.area||'').trim(), puesto:String(p.nombre||'').trim() }))
    .filter(x => x.area && x.puesto);
}
// Devuelve los examIds asignados a un puesto del catálogo.
// - array (posiblemente vacío) si el puesto EXISTE en el catálogo
// - null si el puesto NO está en el catálogo (para que el llamador
//   distinga "sin asignaciones" de "desconocido" y use su fallback)
function examIdsForPuestoNameArea(nombre, area){
  if(!nombre) return null;
  let p = area ? _findPuesto(area, nombre) : null;
  if(!p){
    const key = String(nombre).trim().toUpperCase();
    p = PUESTOS.find(x => String(x.nombre).trim().toUpperCase() === key);
  }
  return p ? _examIdsForPuestoId(p.id) : null;
}
window.catalogAreas            = catalogAreas;
window.catalogPuestosForArea   = catalogPuestosForArea;
window.catalogPuestoPairs      = catalogPuestoPairs;
window.examIdsForPuestoNameArea = examIdsForPuestoNameArea;

// Refresca las vistas del sistema principal cuando cambian los exámenes
function _refreshSistemaViews(){
  try { if(typeof filtExams !== 'undefined') filtExams = [...EXAMS]; } catch(_){}
  try { buildAreaPuestoFilters(); } catch(_){}
  try { refreshAllKPIs(); } catch(_){}
  try { filterExams(); } catch(_){}
  try { if(typeof saveDataset === 'function') saveDataset(); } catch(_){}
}

// ════════════════════════════════════════════════════════════════
// CRUD DE EXÁMENES (alta de links)
// ════════════════════════════════════════════════════════════════
function gSaveExam(){
  const id      = document.getElementById('gx-id').value;               // vacío = nuevo
  const tema    = document.getElementById('gx-tema').value.trim();
  const url     = document.getElementById('gx-url').value.trim();
  const edicion = document.getElementById('gx-edicion').value.trim();
  const edUrl   = document.getElementById('gx-edurl').value.trim();
  const estatus = document.getElementById('gx-estatus').value;
  const errEl   = document.getElementById('gx-error');

  if(!tema){ errEl.textContent = 'El tema del examen es obligatorio.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';

  if(id){
    const ex = EXAMS.find(e => e.id === id);
    if(!ex){ showToast('⚠️ Examen no encontrado'); return; }
    Object.assign(ex, { tema, url, edicion, estatus:estatus||'Activo', edicion_url:edUrl });
    showToast(`✏️ Examen actualizado: ${ex.id}`);
  } else {
    const newId = _nextExamId();
    EXAMS.push({ id:newId, tema, url, edicion, estatus:estatus||'Activo', aplica:[], edicion_url:edUrl });
    showToast(`➕ Examen creado: ${newId}`);
  }
  _refreshSistemaViews();
  document.getElementById('gx-modal').classList.remove('open');
  renderGestion();
}

function openExamEditor(id){
  const ex = id ? EXAMS.find(e => e.id === id) : null;
  document.getElementById('gx-id').value      = ex ? ex.id : '';
  document.getElementById('gx-tema').value    = ex ? (ex.tema||'') : '';
  document.getElementById('gx-url').value     = ex ? (ex.url||'') : '';
  document.getElementById('gx-edicion').value = ex ? (ex.edicion||'') : '';
  document.getElementById('gx-edurl').value   = ex ? (ex.edicion_url||'') : '';
  document.getElementById('gx-estatus').value = ex ? (ex.estatus||'Activo') : 'Activo';
  document.getElementById('gx-error').style.display = 'none';
  document.getElementById('gx-modal-title').textContent = ex ? 'Editar Examen' : 'Nuevo Examen';
  document.getElementById('gx-modal-kicker').textContent = ex ? `✏️ ${ex.id}` : '➕ Alta de link';
  document.getElementById('gx-modal').classList.add('open');
}

function gDeleteExam(id){
  const ex = EXAMS.find(e => e.id === id);
  if(!ex) return;
  const nAsig = _puestoIdsForExam(id).length;
  if(!confirm(`¿Eliminar el examen "${ex.tema}" (${id})?\n\n` +
              `Se quitará de ${nAsig} puesto(s) asignado(s). Esta acción no borra empleados.`)) return;
  EXAMS = EXAMS.filter(e => e.id !== id);
  ASSIGNMENTS = ASSIGNMENTS.filter(a => a.examId !== id);
  savePuestos();
  _refreshSistemaViews();
  showToast(`🗑️ Examen eliminado: ${id}`);
  renderGestion();
}

// ════════════════════════════════════════════════════════════════
// CRUD DE PUESTOS
// ════════════════════════════════════════════════════════════════
function gSavePuesto(){
  const id     = document.getElementById('gp-id').value;   // vacío = nuevo
  const nombre = document.getElementById('gp-nombre').value.trim();
  // Reutiliza la escritura ya en uso si solo cambian mayúsculas/espacios,
  // para no crear un área paralela ("Moldeo" vs "MOLDEO").
  const area   = _canonicalArea(document.getElementById('gp-area').value);
  const errEl  = document.getElementById('gp-error');

  if(!nombre || !area){ errEl.textContent = 'Nombre y área son obligatorios.'; errEl.style.display='block'; return; }

  // Duplicados (mismo nombre+área, distinto id)
  const dup = _findPuesto(area, nombre);
  if(dup && dup.id !== id){ errEl.textContent = `Ya existe el puesto "${nombre}" en el área "${area}".`; errEl.style.display='block'; return; }
  errEl.style.display = 'none';

  if(id){
    const p = PUESTOS.find(x => x.id === id);
    if(!p){ showToast('⚠️ Puesto no encontrado'); return; }
    p.nombre = nombre; p.area = area;
    showToast(`✏️ Puesto actualizado: ${nombre}`);
  } else {
    // manual:true → la migración del catálogo nunca lo reubica ni lo fusiona
    PUESTOS.push({ id:_nextPuestoId(), nombre, area, manual:true });
    showToast(`➕ Puesto creado: ${nombre}`);
  }
  savePuestos();
  try { buildAreaPuestoFilters(); } catch(_){}
  document.getElementById('gp-modal').classList.remove('open');
  renderGestion();
}

function openPuestoEditor(id){
  const p = id ? PUESTOS.find(x => x.id === id) : null;
  document.getElementById('gp-id').value     = p ? p.id : '';
  document.getElementById('gp-nombre').value = p ? p.nombre : '';
  document.getElementById('gp-area').value   = p ? p.area : '';
  document.getElementById('gp-error').style.display = 'none';
  document.getElementById('gp-modal-title').textContent = p ? 'Editar Puesto' : 'Nuevo Puesto';
  document.getElementById('gp-modal-kicker').textContent = p ? `✏️ ${p.id}` : '➕ Alta de puesto';

  // datalist de áreas existentes (catálogo + padrón de empleados)
  const empAreas = Object.values(_empAreaCanon());
  const areas = [...new Map([...catalogAreas(), ...empAreas]
    .map(a => [_normArea(a), a])).values()].sort((a,b) => a.localeCompare(b));
  document.getElementById('gp-area-list').innerHTML = areas.map(a => `<option value="${esc(a)}">`).join('');

  document.getElementById('gp-modal').classList.add('open');
}

function gDeletePuesto(id){
  const p = PUESTOS.find(x => x.id === id);
  if(!p) return;
  const nEmp = (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : [])
    .filter(e => _puestoKey(e.area, e.puesto) === _puestoKey(p.area, p.nombre)).length;
  const nExam = _examIdsForPuestoId(id).length;
  let msg = `¿Eliminar el puesto "${p.nombre}" (${p.area})?\n\nSe quitarán sus ${nExam} asignación(es) de examen.`;
  if(nEmp > 0) msg += `\n\n⚠️ ${nEmp} empleado(s) tienen este puesto; no se eliminan, pero quedarán sin puesto de catálogo.`;
  if(!confirm(msg)) return;
  PUESTOS = PUESTOS.filter(x => x.id !== id);
  ASSIGNMENTS = ASSIGNMENTS.filter(a => a.puestoId !== id);
  savePuestos();
  try { buildAreaPuestoFilters(); } catch(_){}
  showToast(`🗑️ Puesto eliminado: ${p.nombre}`);
  renderGestion();
}

// ════════════════════════════════════════════════════════════════
// RENDER — Vista Gestión (dos sub-paneles: Exámenes / Puestos)
// ════════════════════════════════════════════════════════════════
let _gestionTab = 'exams';   // 'exams' | 'puestos' | 'asignaciones'
function gestionTab(tab){ _gestionTab = tab; renderGestion(); }

function renderGestion(){
  const root = document.getElementById('gestion-root');
  if(!root) return;

  const tab = _gestionTab;
  const qEl = document.getElementById('g-q');
  const q   = qEl ? qEl.value.toLowerCase() : '';

  const tabBtn = (key, label) =>
    `<button class="btn ${tab===key?'btn-p':'btn-s'} btn-sm" onclick="gestionTab('${key}')">${label}</button>`;

  let action = '';
  if(tab==='exams')   action = `<button class="btn btn-p btn-sm" onclick="openExamEditor()">➕ Nuevo examen</button>`;
  if(tab==='puestos') action = `<button class="btn btn-p btn-sm" onclick="openPuestoEditor()">➕ Nuevo puesto</button>`;

  // La búsqueda aplica a exámenes y puestos; en asignaciones se usa el selector.
  const showSearch = tab !== 'asignaciones';

  root.innerHTML = `
    <div class="sh">
      <h2 class="sh-title">Capa de <span>Gestión</span></h2>
      <div class="ctrls">
        ${showSearch ? `<div class="srch-wrap"><span class="srch-ico">🔍</span>
          <input class="srch" id="g-q" placeholder="Buscar..." value="${esc(q)}" oninput="renderGestion()"></div>` : ''}
        ${action}
      </div>
    </div>

    <div style="display:flex;gap:.5rem;margin-bottom:1.25rem;flex-wrap:wrap">
      ${tabBtn('exams',        `🔗 Links de Exámenes (${EXAMS.length})`)}
      ${tabBtn('puestos',      `🧷 Puestos (${PUESTOS.length})`)}
      ${tabBtn('asignaciones', `🔀 Asignaciones (${ASSIGNMENTS.length})`)}
    </div>

    <div id="g-body"></div>
  `;

  const body = document.getElementById('g-body');
  if(tab==='exams')        body.innerHTML = _renderExamsTable(q);
  else if(tab==='puestos') body.innerHTML = _renderPuestosGrid(q);
  else { body.innerHTML = _renderAsignaciones(); _renderAsgBody(); }
}

function _renderExamsTable(q){
  const list = EXAMS.filter(ex =>
    !q || (ex.tema||'').toLowerCase().includes(q) || (ex.id||'').toLowerCase().includes(q) || (ex.edicion||'').toLowerCase().includes(q));
  if(!list.length) return `<div class="empty"><div class="empty-icon">🔍</div><div>Sin exámenes</div></div>`;
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>ID</th><th>Tema</th><th>Link</th><th>Puestos</th><th>Estatus</th><th>Acciones</th></tr></thead>
    <tbody>${list.map(ex => {
      const nP = _puestoIdsForExam(ex.id).length;
      return `<tr>
        <td><span class="id-chip">${esc(ex.id)}</span></td>
        <td style="max-width:320px">${esc(ex.tema)}${ex.edicion?`<div style="font-size:.68rem;color:var(--text3)">📄 ${esc(ex.edicion)}</div>`:''}</td>
        <td>${safeUrl(ex.url)?`<a href="${esc(safeUrl(ex.url))}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);font-size:.75rem">🔗 Abrir</a>`:`<span style="color:var(--text3);font-size:.72rem">Sin link</span>`}</td>
        <td style="text-align:center"><button class="btn btn-s btn-sm" title="Asignar a puestos" onclick="openAsgFor('exam','${esc(ex.id)}')">${nP} 🔀</button></td>
        <td>${sBadge(ex.estatus)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-s btn-sm" onclick="openExamEditor('${esc(ex.id)}')">✏️</button>
          <button class="btn btn-s btn-sm" onclick="gDeleteExam('${esc(ex.id)}')">🗑️</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function _renderPuestosGrid(q){
  const list = PUESTOS.filter(p =>
    !q || (p.nombre||'').toLowerCase().includes(q) || (p.area||'').toLowerCase().includes(q));
  if(!list.length) return `<div class="empty"><div class="empty-icon">🧷</div><div>Sin puestos</div></div>`;
  // Agrupar por área
  const byArea = {};
  list.forEach(p => { (byArea[p.area||'Sin área'] = byArea[p.area||'Sin área'] || []).push(p); });
  return Object.entries(byArea).sort((a,b)=>a[0].localeCompare(b[0])).map(([area, puestos]) => `
    <div style="margin-bottom:1.4rem">
      <div style="font-size:.72rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.7rem">${esc(area)} <span style="color:var(--text3);font-weight:400">(${puestos.length})</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.75rem">
        ${puestos.sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(p => {
          const nEx = _examIdsForPuestoId(p.id).length;
          return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:.85rem">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem">
              <div style="min-width:0">
                <div style="font-size:.85rem;font-weight:600;line-height:1.3">${esc(p.nombre)}</div>
                <div style="font-size:.68rem;color:var(--text3);margin-top:.3rem"><span class="id-chip">${esc(p.id)}</span> · ${nEx} examen(es)</div>
              </div>
              <div style="display:flex;gap:.3rem;flex-shrink:0">
                <button class="btn btn-s btn-sm" onclick="openPuestoEditor('${esc(p.id)}')">✏️</button>
                <button class="btn btn-s btn-sm" onclick="gDeletePuesto('${esc(p.id)}')">🗑️</button>
              </div>
            </div>
            <button class="btn btn-s btn-sm" style="width:100%;margin-top:.6rem" onclick="openAsgFor('puesto','${esc(p.id)}')">🔀 Asignar exámenes</button>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════════════
// ASIGNACIONES (Fase 3) — asignar/quitar exámenes a puestos
// ----------------------------------------------------------------
// Escribe en ASSIGNMENTS (modelo normalizado), mantiene ex.aplica en
// sincronía (puente de compatibilidad) y PROPAGA el cambio a los
// exam_ids de los empleados del puesto, de modo que el detalle de
// examen, los KPIs y la matriz reflejen la asignación de inmediato.
// ════════════════════════════════════════════════════════════════
let _asgMode  = 'puesto';   // 'puesto' | 'exam'
let _asgSelId = '';

function asgSetMode(mode){ _asgMode = mode; _asgSelId = ''; renderGestion(); }
function asgSelect(id){ _asgSelId = id; _renderAsgBody(); }
function openAsgFor(mode, id){ _asgMode = mode; _asgSelId = id; _gestionTab = 'asignaciones'; renderGestion(); }

function _renderAsignaciones(){
  const byPuesto = _asgMode === 'puesto';
  // Selector de entidad
  let selector = '';
  if(byPuesto){
    const byArea = {};
    PUESTOS.forEach(p => { (byArea[p.area||'Sin área'] = byArea[p.area||'Sin área'] || []).push(p); });
    const opts = Object.entries(byArea).sort((a,b)=>a[0].localeCompare(b[0])).map(([area, ps]) =>
      `<optgroup label="${esc(area)}">` +
      ps.sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(p =>
        `<option value="${esc(p.id)}" ${p.id===_asgSelId?'selected':''}>${esc(p.nombre)} (${_examIdsForPuestoId(p.id).length})</option>`).join('') +
      `</optgroup>`).join('');
    selector = `<select class="flt" style="min-width:340px" onchange="asgSelect(this.value)">
      <option value="">— Selecciona un puesto —</option>${opts}</select>`;
  } else {
    const opts = EXAMS.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(ex =>
      `<option value="${esc(ex.id)}" ${ex.id===_asgSelId?'selected':''}>${esc(ex.id)} · ${esc(ex.tema)} (${_puestoIdsForExam(ex.id).length})</option>`).join('');
    selector = `<select class="flt" style="min-width:340px" onchange="asgSelect(this.value)">
      <option value="">— Selecciona un examen —</option>${opts}</select>`;
  }

  return `
    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:1rem 1.1rem;margin-bottom:1.1rem">
      <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
        <span style="font-size:.75rem;color:var(--text3);font-weight:600">Ver por:</span>
        <button class="btn ${byPuesto?'btn-p':'btn-s'} btn-sm" onclick="asgSetMode('puesto')">🧷 Puesto → exámenes</button>
        <button class="btn ${!byPuesto?'btn-p':'btn-s'} btn-sm" onclick="asgSetMode('exam')">🔗 Examen → puestos</button>
        <span style="flex:1"></span>
        ${selector}
      </div>
    </div>
    <div id="g-asg-body"></div>`;
}

// El cuerpo (checklist) se renderiza aparte para poder refrescarlo sin
// perder el foco/scroll del selector.
function _renderAsgBody(){
  const host = document.getElementById('g-asg-body');
  if(!host) return;
  const byPuesto = _asgMode === 'puesto';

  if(!_asgSelId){
    host.innerHTML = `<div class="empty"><div class="empty-icon">🔀</div><div>Selecciona un ${byPuesto?'puesto':'examen'} para asignar o quitar ${byPuesto?'exámenes':'puestos'}</div></div>`;
    return;
  }

  if(byPuesto){
    const p = PUESTOS.find(x => x.id === _asgSelId);
    if(!p){ host.innerHTML = `<div class="empty"><div>Puesto no encontrado</div></div>`; return; }
    const assigned = new Set(_examIdsForPuestoId(p.id));
    const rows = EXAMS.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(ex => _asgRow(ex.id, `${ex.id} · ${ex.tema}`, ex.edicion, assigned.has(ex.id))).join('');
    host.innerHTML = _asgPanel(`${esc(p.nombre)} <span style="color:var(--text3);font-weight:400">· ${esc(p.area)}</span>`, assigned.size, EXAMS.length, 'examen(es)', rows);
  } else {
    const ex = EXAMS.find(e => e.id === _asgSelId);
    if(!ex){ host.innerHTML = `<div class="empty"><div>Examen no encontrado</div></div>`; return; }
    const assigned = new Set(_puestoIdsForExam(ex.id));
    // Puestos agrupados por área
    const byArea = {};
    PUESTOS.forEach(p => { (byArea[p.area||'Sin área'] = byArea[p.area||'Sin área'] || []).push(p); });
    const rows = Object.entries(byArea).sort((a,b)=>a[0].localeCompare(b[0])).map(([area, ps]) =>
      `<div style="font-size:.68rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin:.7rem 0 .35rem">${esc(area)}</div>` +
      ps.sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(p => _asgRow(p.id, p.nombre, '', assigned.has(p.id))).join('')
    ).join('');
    host.innerHTML = _asgPanel(`${esc(ex.id)} · ${esc(ex.tema)}`, assigned.size, PUESTOS.length, 'puesto(s)', rows);
  }
}

function _asgPanel(title, count, total, unit, rows){
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem;margin-bottom:.6rem">
      <div style="font-size:.9rem;font-weight:600">${title}
        <span style="color:var(--text3);font-size:.75rem;font-weight:400">· <strong id="g-asg-count">${count}</strong>/${total} ${unit}</span></div>
      <div style="display:flex;gap:.4rem">
        <button class="btn btn-s btn-sm" onclick="asgBulk(true)">✓ Marcar todos</button>
        <button class="btn btn-s btn-sm" onclick="asgBulk(false)">✕ Quitar todos</button>
      </div>
    </div>
    <div class="tbl-wrap" style="max-height:60vh;overflow-y:auto;padding:.4rem .8rem">${rows}</div>`;
}

function _asgRow(id, label, sub, checked){
  return `
    <label style="display:flex;align-items:center;gap:.7rem;padding:.5rem .2rem;border-bottom:1px solid var(--border);cursor:pointer">
      <input type="checkbox" ${checked?'checked':''} onchange="toggleAsg('${esc(id)}',this.checked)"
        style="width:17px;height:17px;accent-color:var(--accent);cursor:pointer;flex-shrink:0">
      <span style="min-width:0">
        <span style="font-size:.82rem;line-height:1.3">${esc(label)}</span>
        ${sub?`<span style="font-size:.68rem;color:var(--text3);display:block">📄 ${esc(sub)}</span>`:''}
      </span>
    </label>`;
}

// ── Mutación de una asignación (dato puro, sin persistir/refrescar) ──
// Devuelve el examId afectado (para sincronizar ex.aplica una sola vez).
function _mutateAssignment(puestoId, examId, on){
  if(on) assignExam(puestoId, examId); else unassignExam(puestoId, examId);
  _applyAssignmentToEmployees(puestoId, examId, on);
  return examId;
}

// Propaga la asignación a los exam_ids de los empleados del puesto, para
// que la cobertura (detalle de examen / KPIs / matriz) sea consistente.
function _applyAssignmentToEmployees(puestoId, examId, on){
  const p = PUESTOS.find(x => x.id === puestoId);
  if(!p || typeof EMPLOYEES === 'undefined') return;
  const key = _puestoKey(p.area, p.nombre);
  EMPLOYEES.forEach(e => {
    if(_puestoKey(e.area, e.puesto) !== key) return;
    const ids = new Set(e.exam_ids || []);
    if(on) ids.add(examId); else ids.delete(examId);
    e.exam_ids = [...ids];
  });
}

// Resincroniza exam_ids de TODOS los empleados contra el catálogo
// (PUESTOS + ASSIGNMENTS), que es la fuente de verdad. Necesario porque
// exam_ids vive como copia en cada empleado (para no recalcular en cada
// render) y puede quedar desactualizada si: (a) el override individual
// guardado al editar un empleado trae una foto vieja, o (b) se crea un
// puesto o se le asignan exámenes después de que el empleado ya existía.
// Solo toca puestos que SÍ están en el catálogo — un puesto legado que
// aún no se dio de alta ahí conserva su exam_ids previo (fallback en
// _getExamIdsForPuesto). Devuelve true si corrigió algo.
function _syncAllEmpExamIdsFromCatalog(){
  if(typeof EMPLOYEES === 'undefined' || typeof examIdsForPuestoNameArea !== 'function') return false;
  let changed = false;
  EMPLOYEES.forEach(e => {
    const ids = examIdsForPuestoNameArea(e.puesto, e.area);
    if(ids === null) return;
    const next = [...new Set(ids)];
    const cur  = [...new Set(e.exam_ids||[])];
    const same = cur.length === next.length && cur.slice().sort().join('') === next.slice().sort().join('');
    if(!same){ e.exam_ids = next; changed = true; }
  });
  return changed;
}

// ── Commit: sincroniza ex.aplica, reconstruye índices, persiste y refresca
function _commitAssignments(examIds){
  [...new Set(examIds)].forEach(_syncExamAplica);
  try { _rebuildIndexes(); } catch(_){}
  savePuestos();
  try { if(typeof saveDataset === 'function') saveDataset(); } catch(_){}
  try { if(typeof _saveExtraEmployees === 'function') _saveExtraEmployees(); } catch(_){}
  try { buildAreaPuestoFilters(); } catch(_){}
  try { refreshAllKPIs(); } catch(_){}
  try { if(typeof filtExams !== 'undefined') filtExams = [...EXAMS]; filterExams(); } catch(_){}
  try { renderEmps(); } catch(_){}
  try { renderMatrix(); } catch(_){}
  // Si el modal de detalle de un empleado está abierto, refrescarlo:
  // openEmpModal ya lee exam_ids en vivo, solo falta volver a llamarla.
  try {
    if(window._empModalId && document.getElementById('emp-modal')?.classList.contains('open')){
      openEmpModal(window._empModalId);
    }
  } catch(_){}
}

// Toggle de una casilla (un puesto × un examen)
function toggleAsg(id, checked){
  let puestoId, examId;
  if(_asgMode === 'puesto'){ puestoId = _asgSelId; examId = id; }
  else                     { puestoId = id;       examId = _asgSelId; }
  _mutateAssignment(puestoId, examId, checked);
  _commitAssignments([examId]);
  // Actualiza contador in-place sin re-render (mantiene scroll)
  const cnt = document.getElementById('g-asg-count');
  if(cnt){
    const n = _asgMode === 'puesto' ? _examIdsForPuestoId(_asgSelId).length : _puestoIdsForExam(_asgSelId).length;
    cnt.textContent = n;
  }
}

// Marcar / quitar todos para la selección actual
function asgBulk(on){
  if(!_asgSelId) return;
  const affected = [];
  if(_asgMode === 'puesto'){
    EXAMS.forEach(ex => { affected.push(_mutateAssignment(_asgSelId, ex.id, on)); });
  } else {
    PUESTOS.forEach(p => { _mutateAssignment(p.id, _asgSelId, on); });
    affected.push(_asgSelId);
  }
  _commitAssignments(affected);
  _renderAsgBody();
  showToast(on ? '✓ Asignados todos' : '✕ Quitados todos');
}

// ════════════════════════════════════════════════════════════════
// INYECCIÓN DE MODALES (se crean una sola vez en <body>)
// ════════════════════════════════════════════════════════════════
function _injectGestionModals(){
  if(document.getElementById('gx-modal')) return;
  const _inputStyle = "width:100%;padding:.52rem .8rem;border-radius:7px;border:1.5px solid var(--border2);background:var(--card);color:var(--text);font-family:var(--fb);font-size:.85rem;outline:none";
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <!-- Modal Examen -->
  <div class="modal-overlay" id="gx-modal" role="dialog" aria-modal="true" aria-label="Editar examen">
    <div class="modal" style="max-width:560px">
      <div class="modal-hdr" style="border-bottom:1px solid var(--border);padding-bottom:1rem">
        <div>
          <div id="gx-modal-kicker" style="font-size:.7rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.2rem">➕ Alta de link</div>
          <div class="modal-title" id="gx-modal-title">Nuevo Examen</div>
        </div>
        <button class="modal-close" aria-label="Cerrar" onclick="document.getElementById('gx-modal').classList.remove('open')">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:.85rem">
        <input type="hidden" id="gx-id">
        <div class="m-sec" style="margin:0"><label>Tema del examen <span style="color:var(--red)">*</span></label>
          <input id="gx-tema" type="text" placeholder="Ej. QP 7.3 NMC Training" style="${_inputStyle}"></div>
        <div class="m-sec" style="margin:0"><label>Link del examen (URL)</label>
          <input id="gx-url" type="url" placeholder="https://forms.office.com/..." style="${_inputStyle}"></div>
        <div class="m-sec" style="margin:0"><label>Edición (nombre)</label>
          <input id="gx-edicion" type="text" placeholder="Ej. QP 7.3 – Collaboration" style="${_inputStyle}"></div>
        <div class="m-sec" style="margin:0"><label>Link de edición (DesignPageV2)</label>
          <input id="gx-edurl" type="url" placeholder="https://forms.office.com/Pages/DesignPageV2..." style="${_inputStyle}"></div>
        <div class="m-sec" style="margin:0"><label>Estatus</label>
          <select id="gx-estatus" style="${_inputStyle};cursor:pointer">
            <option value="Activo">✓ Activo</option><option value="Inactivo">✕ Inactivo</option></select></div>
        <div id="gx-error" style="display:none;color:var(--red);font-size:.78rem;font-weight:600;padding:.45rem .8rem;background:rgba(198,40,40,.08);border-radius:6px;border-left:3px solid var(--red)"></div>
      </div>
      <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);display:flex;gap:.7rem;justify-content:flex-end;background:var(--bg2)">
        <button onclick="document.getElementById('gx-modal').classList.remove('open')" style="padding:.5rem 1.1rem;border-radius:7px;border:1.5px solid var(--border2);background:none;color:var(--text2);font-family:var(--fb);font-size:.83rem;font-weight:600;cursor:pointer">Cancelar</button>
        <button onclick="gSaveExam()" style="padding:.5rem 1.3rem;border-radius:7px;border:none;background:var(--accent);color:#fff;font-family:var(--fb);font-size:.83rem;font-weight:700;cursor:pointer">💾 Guardar</button>
      </div>
    </div>
  </div>

  <!-- Modal Puesto -->
  <div class="modal-overlay" id="gp-modal" role="dialog" aria-modal="true" aria-label="Editar puesto">
    <div class="modal" style="max-width:460px">
      <div class="modal-hdr" style="border-bottom:1px solid var(--border);padding-bottom:1rem">
        <div>
          <div id="gp-modal-kicker" style="font-size:.7rem;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.2rem">➕ Alta de puesto</div>
          <div class="modal-title" id="gp-modal-title">Nuevo Puesto</div>
        </div>
        <button class="modal-close" aria-label="Cerrar" onclick="document.getElementById('gp-modal').classList.remove('open')">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:.85rem">
        <input type="hidden" id="gp-id">
        <div class="m-sec" style="margin:0"><label>Nombre del puesto <span style="color:var(--red)">*</span></label>
          <input id="gp-nombre" type="text" placeholder="Ej. INGENIERO DE MANUFACTURA" style="${_inputStyle}"></div>
        <div class="m-sec" style="margin:0"><label>Área <span style="color:var(--red)">*</span></label>
          <input id="gp-area" type="text" list="gp-area-list" placeholder="Ej. INGENIERIA" style="${_inputStyle}">
          <datalist id="gp-area-list"></datalist></div>
        <div id="gp-error" style="display:none;color:var(--red);font-size:.78rem;font-weight:600;padding:.45rem .8rem;background:rgba(198,40,40,.08);border-radius:6px;border-left:3px solid var(--red)"></div>
      </div>
      <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);display:flex;gap:.7rem;justify-content:flex-end;background:var(--bg2)">
        <button onclick="document.getElementById('gp-modal').classList.remove('open')" style="padding:.5rem 1.1rem;border-radius:7px;border:1.5px solid var(--border2);background:none;color:var(--text2);font-family:var(--fb);font-size:.83rem;font-weight:600;cursor:pointer">Cancelar</button>
        <button onclick="gSavePuesto()" style="padding:.5rem 1.3rem;border-radius:7px;border:none;background:var(--green);color:#fff;font-family:var(--fb);font-size:.83rem;font-weight:700;cursor:pointer">💾 Guardar</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap);
}

// ════════════════════════════════════════════════════════════════
// INIT — corre DESPUÉS del init de sistema.js (mismo evento, orden de
// registro; gestion.js se parsea después). Aquí EXAMS/EMPLOYEES ya
// están cargados con el dataset final.
// ════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  _injectGestionModals();

  // 1. Estado persistido (si lo hay) + migración v1 → v2 con respaldo
  if(loadPuestos() && _puestosNeedMigration){
    _backupPuestosV1();
    const st = migratePuestosCatalog();
    _puestosNeedMigration = false;
    if(st.puestosFusionados || st.areasRenombradas){
      console.info('[gestión] catálogo migrado a v2:', st);
      // Deliberadamente NO se reescribe ex.aplica aquí: lo consumen la
      // exportación a Excel (columnas de ALL_EXAM_AREAS) y la matriz
      // Exámenes × Puestos. _commitAssignments lo sigue sincronizando
      // examen por examen, como antes. Así la migración solo escribe en
      // la llave nmc-puestos y el respaldo es una vuelta atrás exacta.
      try { showToast(`🔧 Catálogo de puestos reparado: ${st.puestosFusionados} puesto(s) fusionado(s)`); } catch(_){}
    }
  }

  // 2. Merge no destructivo: incorpora lo que falte de EXAMS/EMPLOYEES
  bootstrapPuestosFromData();
  savePuestos();

  // 2.5 El catálogo recién cargado es la fuente de verdad: resincroniza
  // exam_ids de cada empleado contra él. Corrige tanto overrides
  // individuales desactualizados como puestos/exámenes dados de alta
  // después de que el empleado ya existía — el render inicial de
  // sistema.js corrió antes de que este catálogo estuviera disponible.
  if(_syncAllEmpExamIdsFromCatalog()){
    try { _rebuildIndexes(); } catch(_){}
    try { if(typeof saveDataset === 'function') saveDataset(); } catch(_){}
    try { if(typeof _saveExtraEmployees === 'function') _saveExtraEmployees(); } catch(_){}
    try { refreshAllKPIs(); } catch(_){}
    try { renderEmps(); } catch(_){}
    try { renderMatrix(); } catch(_){}
  }

  // 3. Los filtros del sistema ya pueden incluir el catálogo
  try { buildAreaPuestoFilters(); } catch(_){}
  renderGestion();
});
