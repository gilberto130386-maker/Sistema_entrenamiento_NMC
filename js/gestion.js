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

// ── Helpers de identidad ──────────────────────────────────────────
function _puestoKey(area, nombre){
  return `${String(area||'').trim().toUpperCase()}||${String(nombre||'').trim().toUpperCase()}`;
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

// ── Bootstrap (Fase 0) ────────────────────────────────────────────
// Hidrata PUESTOS/ASSIGNMENTS desde los datos existentes (exam.aplica
// + EMPLOYEES). Es idempotente y MERGE: solo añade lo que falte, nunca
// destruye puestos ni asignaciones creados manualmente.
function bootstrapPuestosFromData(){
  // 1. Puestos y asignaciones derivados del catálogo de exámenes
  (typeof EXAMS !== 'undefined' ? EXAMS : []).forEach(ex => {
    (ex.aplica || []).forEach(m => {
      const p = _ensurePuesto(m.area, m.puesto);
      if(p) assignExam(p.id, ex.id);
    });
  });
  // 2. Puestos que solo existen a través de empleados (sin exámenes aún)
  (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []).forEach(e => {
    if((e.puesto||'').trim()) _ensurePuesto(e.area, e.puesto);
  });
}

// ── Persistencia (Fase 1) ─────────────────────────────────────────
function savePuestos(){
  try {
    const payload = { v:1, ts:Date.now(), puestos:PUESTOS, assignments:ASSIGNMENTS };
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
    return true;
  } catch(e){ console.warn('loadPuestos error:', e); return false; }
}

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
  const area   = document.getElementById('gp-area').value.trim();
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
    PUESTOS.push({ id:_nextPuestoId(), nombre, area });
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

  // datalist de áreas existentes
  const areas = [...new Set(PUESTOS.map(x => x.area).filter(Boolean))].sort();
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
let _gestionTab = 'exams';
function gestionTab(tab){ _gestionTab = tab; renderGestion(); }

function renderGestion(){
  const root = document.getElementById('gestion-root');
  if(!root) return;

  const isEx = _gestionTab === 'exams';
  const qEl  = document.getElementById('g-q');
  const q    = qEl ? qEl.value.toLowerCase() : '';

  root.innerHTML = `
    <div class="sh">
      <h2 class="sh-title">Capa de <span>Gestión</span></h2>
      <div class="ctrls">
        <div class="srch-wrap"><span class="srch-ico">🔍</span>
          <input class="srch" id="g-q" placeholder="Buscar..." value="${esc(q)}" oninput="renderGestion()"></div>
        ${isEx
          ? `<button class="btn btn-p btn-sm" onclick="openExamEditor()">➕ Nuevo examen</button>`
          : `<button class="btn btn-p btn-sm" onclick="openPuestoEditor()">➕ Nuevo puesto</button>`}
      </div>
    </div>

    <div style="display:flex;gap:.5rem;margin-bottom:1.25rem;flex-wrap:wrap">
      <button class="btn ${isEx?'btn-p':'btn-s'} btn-sm" onclick="gestionTab('exams')">🔗 Links de Exámenes (${EXAMS.length})</button>
      <button class="btn ${!isEx?'btn-p':'btn-s'} btn-sm" onclick="gestionTab('puestos')">🧷 Puestos (${PUESTOS.length})</button>
    </div>

    <div id="g-body"></div>
  `;

  document.getElementById('g-body').innerHTML = isEx ? _renderExamsTable(q) : _renderPuestosGrid(q);
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
        <td style="text-align:center">${nP}</td>
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
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
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
  if(!loadPuestos()){
    bootstrapPuestosFromData();  // primera vez: hidratar desde datos existentes
    savePuestos();
  } else {
    // Merge no destructivo: incorpora puestos nuevos que hayan aparecido
    bootstrapPuestosFromData();
    savePuestos();
  }
  renderGestion();
});
