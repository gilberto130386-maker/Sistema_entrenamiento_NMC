
// ═══════════════════════════════════════════
// NUEVA LÓGICA — Índice exam → empleados
// Correlación directa del Excel por puesto
// buildCross() eliminado — datos en exam_ids
// ═══════════════════════════════════════════
let _examEmpMap = {};  // { examId: [empId, ...] }
let _empMap     = {};  // { empId: emp }
let _numMap     = {};  // { numero: emp }  ← clave estable para persistencia

function _rebuildIndexes(){
  _empMap = {};
  _numMap = {};
  EMPLOYEES.forEach(e => {
    _empMap[e.id] = e;
    if(e.numero) _numMap[String(e.numero)] = e;
  });
  _examEmpMap = {};
  EMPLOYEES.forEach(e => {
    const ids = [...new Set(e.exam_ids||[])];
    ids.forEach(xid => {
      if(!_examEmpMap[xid]) _examEmpMap[xid] = [];
      _examEmpMap[xid].push(e.id);
    });
  });
}

// ── Clave de persistencia estable ────────────────────────────────
// Los estatus/overrides se guardan por NÚMERO de empleado (no por id),
// para que sobrevivan si un Excel nuevo reordena qué id toca a cada persona.
// Si un registro no tiene número, se usa su id como respaldo.
function _persistKey(e){ return (e && e.numero) ? String(e.numero) : (e ? e.id : ''); }
function _empByKey(key){ return _numMap[String(key)] || _empMap[String(key)] || null; }

// Helpers usados en todo el sistema
function getExamEmps(ex){ return (_examEmpMap[ex.id]||[]).map(id=>_empMap[id]).filter(Boolean); }
function getEmpExams(emp){ return [...new Set(emp.exam_ids||[])].map(xid=>EXAMS.find(ex=>ex.id===xid)).filter(Boolean); }


// ═══════════════════════════════════════════════════════════════════
// SENIOR ARCHITECTURE — Renderer · Perf utilities · Event delegation
// ═══════════════════════════════════════════════════════════════════

// ── 1. Utility belt ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];

function esc(s){
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function safeUrl(u){
  const s = String(u ?? '').trim();
  if (!s || s === 'nan') return '';
  try {
    const parsed = new URL(s, window.location.href);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return s;
  } catch(_) {}
  return '';
}

document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  const openModal = document.querySelector('.modal-overlay.open');
  if(openModal) openModal.classList.remove('open');
});

function debounce(fn, ms = 240) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Animate a numeric value inside an element (count-up) */
function countUp(el, from, to, suffix = '', duration = 600) {
  if (!el) return;
  const start = performance.now();
  const diff  = to - from;
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
    el.textContent = Math.round(from + diff * ease) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/** Batch-render items into a container using DocumentFragment */
function batchRender(container, items, templateFn, emptyHTML = '') {
  const frag = document.createDocumentFragment();
  if (!items.length) {
    container.innerHTML = emptyHTML;
    return;
  }
  items.forEach(item => {
    const tmp = document.createElement('template');
    tmp.innerHTML = templateFn(item).trim();
    frag.appendChild(tmp.content);
  });
  container.innerHTML = '';
  container.appendChild(frag);
}

// ── 2. Debounced wrappers for search inputs (replaces oninput) ─────
document.addEventListener('DOMContentLoaded', () => {
  const wire = (id, fn) => {
    const el = $(id); if (!el) return;
    el.oninput = null;  // remove inline handler
    el.addEventListener('input', debounce(fn, 200));
  };
  wire('ex-q',      filterExams);
  wire('emp-q',     filterEmps);
  wire('mtx-q',     renderMatrix);
  wire('links-q',   renderExamLinks);
  wire('edicion-q', renderEdicionLinks);
});

// ── 3. Event delegation for exam/emp table clicks ──────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Exam table
  const exTbody = $('ex-tbody');
  if (exTbody) {
    exTbody.addEventListener('click', e => {
      const row    = e.target.closest('tr[data-id]');
      const btnMail= e.target.closest('[data-email]');
      const btnLink= e.target.closest('a[target="_blank"]');
      if (btnLink || btnMail) return;
      if (row) showExamDetail(row.dataset.id);
    });
    exTbody.addEventListener('click', e => {
      const btn = e.target.closest('[data-email]');
      if (btn) { e.stopPropagation(); openEmailBlast(btn.dataset.email); }
    });
  }
});

// ── 4. Improved kCard with count-up animation ──────────────────────
function kCard(label, val, cls, sub = '') {
  const isNum  = typeof val === 'number' || /^\d+(\.\d+)?%?$/.test(String(val));
  const numVal = parseFloat(val);
  const suffix = String(val).endsWith('%') ? '%' : '';
  const uid    = 'kc-' + Math.random().toString(36).slice(2,7);
  setTimeout(() => {
    const el = $(uid);
    if (el && isNum && !isNaN(numVal)) countUp(el, 0, numVal, suffix, 700);
  }, 60);
  return `<div class="kpi ${cls}">
    <div class="kpi-lbl">${label}</div>
    <div class="kpi-val ${cls}" id="${uid}">${val}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}


// ── LOGO AUTO-FIT: syncs logo height to --fh text block ──────────────────
(function initLogoAutoFit(){
  function syncLogo(){
    const wrap = document.getElementById('logo-text-wrap');
    const logo = document.getElementById('hdr-logo');
    if(!wrap || !logo) return;
    // Only auto-fit if the user hasn't manually overridden via --logo-h
    const manualH = document.documentElement.style.getPropertyValue('--logo-h');
    if(manualH) return;
    const h = wrap.getBoundingClientRect().height;
    if(h > 0) logo.style.height = h + 'px';
  }

  // Run on load
  window.addEventListener('DOMContentLoaded', () => {
    syncLogo();
    // Observe the text block for any size changes (font-size, viewport, format panel)
    if(window.ResizeObserver){
      const ro = new ResizeObserver(() => syncLogo());
      const wrap = document.getElementById('logo-text-wrap');
      if(wrap) ro.observe(wrap);
    }
  });

  // Re-sync when format panel changes font (--fh changes trigger layout reflow)
  window._originalApplyFormat = null;
  window.addEventListener('DOMContentLoaded', () => {
    const orig = window.applyFormat;
    window.applyFormat = function(){
      orig && orig();
      // Small delay lets font reflow complete before measuring
      requestAnimationFrame(() => requestAnimationFrame(syncLogo));
    };
    // Also sync on window resize
    window.addEventListener('resize', () => requestAnimationFrame(syncLogo));
  });
})();

_rebuildIndexes(); // índice inicial — correlación puesto→examen del Excel


// ════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════
let filtExams = [...EXAMS];
let filtEmps  = [...EMPLOYEES];
let exPage=1, empPage=1;
const EX_PS=15, EMP_PS=18;

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  // 1. Prime layout cache BEFORE any render — _restoreKpiOrder inside
  //    renderDashboard will read from memory, not localStorage
  _loadDashboardLayout();
  _loadHiddenKpis();

  // 2. Load employee status overrides BEFORE the first render
  loadDataset();      // ← restaura el dataset completo del Excel si existe
  _rebuildIndexes();  // ← índice puesto→examen del Excel (necesario antes de render)
  _loadExtraEmployees(); // ← empleados dados de alta manualmente
  _applyDeletedFilter(); // ← excluye empleados eliminados del sistema
  loadEmployeeData();

  // 3. Build filter dropdowns, then render everything
  buildAreaPuestoFilters();
  refreshAllKPIs();        // renderDashboard() → _restoreKpiOrder() from cache
  _restorePanelOrder();    // synchronous, no flash — panels are static DOM
  renderExams(); renderEmps(); renderMatrix();

  // 3.5 Sincronización automática desde el Analizador de Formularios
  //     (lee localStorage['nmc-analyzer-sync'] y aplica aprobados nuevos)
  _checkAnalyzerSync();

  // 4. Load visual settings last (font/color overrides, non-critical)
  setTimeout(loadSettings, 400);
});

// ════════════════════════════════════════════════════════
// VIEW NAV
// ════════════════════════════════════════════════════════
function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.getElementById('nav-'+name).classList.add('active');
  if(name==='exams'){
    document.getElementById('exam-list').style.display='';
    document.getElementById('exam-detail').innerHTML='';
  }
}

// ════════════════════════════════════════════════════════
// FILTERS SETUP
// ════════════════════════════════════════════════════════
function buildAreaPuestoFilters(){
  // ── Construir mapas desde EMPLOYEES (misma fuente para exámenes y empleados) ─
  window._areaToExPuestos  = {};
  window._puestoToExAreas  = {};
  window._areaToEmpPuestos = {};
  window._puestoToEmpAreas = {};

  EMPLOYEES.forEach(e => {
    const a = (e.area||'').trim(), p = (e.puesto||'').trim();
    if(!a || !p) return;
    // Exams share the same maps — área/puesto comes from employee records
    (_areaToExPuestos[a]  = _areaToExPuestos[a] ||new Set()).add(p);
    (_puestoToExAreas[p]  = _puestoToExAreas[p] ||new Set()).add(a);
    (_areaToEmpPuestos[a] = _areaToEmpPuestos[a]||new Set()).add(p);
    (_puestoToEmpAreas[p] = _puestoToEmpAreas[p]||new Set()).add(a);
  });

  // Áreas y puestos únicos de empleados (orden alfabético)
  const empAreas   = [...new Set(EMPLOYEES.map(e=>e.area  ).filter(Boolean))].sort();
  const empPuestos = [...new Set(EMPLOYEES.map(e=>e.puesto).filter(Boolean))].sort();

  // ── ex-area y ex-puesto: misma fuente que emp-area / emp-puesto ───────────
  const ea = document.getElementById('ex-area');
  empAreas.forEach(a => {
    const o=document.createElement('option'); o.value=a; o.textContent=a; ea.appendChild(o);
  });

  const ep = document.getElementById('ex-puesto');
  empPuestos.forEach(p => {
    const o=document.createElement('option'); o.value=p; o.textContent=p; ep.appendChild(o);
  });

  // ── emp-area y emp-puesto ─────────────────────────────────────────────────
  const ea2 = document.getElementById('emp-area');
  empAreas.forEach(a => {
    const o=document.createElement('option'); o.value=a; o.textContent=a; ea2.appendChild(o);
  });

  const ep2 = document.getElementById('emp-puesto');
  empPuestos.forEach(p => {
    const o=document.createElement('option'); o.value=p; o.textContent=p; ep2.appendChild(o);
  });
}

// ── CASCADE: area changed → restrict puesto dropdown ─────────────────────
function onExAreaChange(){
  const area = document.getElementById('ex-area').value;
  const ep   = document.getElementById('ex-puesto');
  const prev = ep.value;   // keep selected puesto if still valid

  ep.innerHTML = '<option value="">Todos los puestos</option>';
  const puestos = area
    ? [...(_areaToExPuestos[area]||[])].sort()
    : [...new Set(EMPLOYEES.map(e=>e.puesto).filter(Boolean))].sort();

  puestos.forEach(p => {
    const o=document.createElement('option');
    o.value=p; o.textContent=p;
    if(p===prev) o.selected=true;
    ep.appendChild(o);
  });
  // If previous puesto no longer valid for new area, reset it
  if(area && prev && !(_areaToExPuestos[area]||new Set()).has(prev))
    ep.value='';

  filterExams();
}

// ── CASCADE: puesto changed → restrict area dropdown ─────────────────────
function onExPuestoChange(){
  const puesto = document.getElementById('ex-puesto').value;
  const ea     = document.getElementById('ex-area');
  const prev   = ea.value;

  ea.innerHTML = '<option value="">Todas las áreas</option>';
  const areas = puesto
    ? [...(_puestoToExAreas[puesto]||[])].sort()
    : [...new Set(EMPLOYEES.map(e=>e.area).filter(Boolean))].sort();

  areas.forEach(a => {
    const o=document.createElement('option');
    o.value=a; o.textContent=a;
    if(a===prev) o.selected=true;
    ea.appendChild(o);
  });
  // If previous area no longer valid for new puesto, reset it
  if(puesto && prev && !(_puestoToExAreas[puesto]||new Set()).has(prev))
    ea.value='';

  filterExams();
}

// ════════════════════════════════════════════════════════
// KPI CARDS (implementación animada — ver arriba)
// ════════════════════════════════════════════════════════

function renderExamKPIs(){
  // Cumplimiento global = promedio de cumplimientos por examen activo
  // Cumplimiento por examen = (empleados Aprobados en ese examen / total emp_ids del examen) * 100
  const empMap = Object.fromEntries(EMPLOYEES.map(e=>[e.id, e]));
  const activos = EXAMS.filter(e=>e.estatus==='Activo');
  const sumPct = activos.reduce((acc, ex)=>{
    const empsExKpi = getExamEmps(ex); if(!empsExKpi.length) return acc;
    const empsEx = getExamEmps(ex); const aprobados = empsEx.filter(e=>e.estatus==='Aprobado').length;
    return acc + (aprobados / empsExKpi.length * 100);
  }, 0);
  const pct = activos.length ? Math.round(sumPct / activos.length) : 0;
  // desglose global para subtítulos
  const totalAsig = new Set(EMPLOYEES.flatMap(e=>e.exam_ids||[])).size;
  const aprobados = EMPLOYEES.filter(e=>e.estatus==='Aprobado').length;
  const color   = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
  const cls     = pct >= 80 ? 'g' : pct >= 50 ? 'y' : 'r';
  const r=54, circ=2*Math.PI*r, dash=circ*(pct/100), gap=circ-dash;
  document.getElementById('exam-kpis').innerHTML=`
    <div style="flex:1;padding:.75rem 1.2rem .6rem;min-width:0">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.45rem">
        <span style="font-family:var(--fb);font-size:.68rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em">Cumplimiento Global</span>
        <span style="font-family:var(--fps);font-size:1.5rem;font-weight:800;color:${color};line-height:1">${pct}%</span>
      </div>
      <div style="position:relative;height:22px;border-radius:99px;overflow:hidden;background:var(--bg3)">
        <div style="position:absolute;inset:0;background:linear-gradient(to right,#e74c3c 0%,#f39c12 50%,#22c55e 100%);border-radius:99px"></div>
        <div style="position:absolute;top:0;right:0;bottom:0;width:${100-pct}%;background:var(--bg3);border-radius:0 99px 99px 0;transition:width .8s cubic-bezier(.4,0,.2,1)"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;padding:0 .7rem">
          <div style="width:3px;height:14px;background:#fff;border-radius:2px;margin-left:calc(${pct}% - 1.5px);box-shadow:0 0 4px rgba(27,79,138,.3);transition:margin-left .8s cubic-bezier(.4,0,.2,1)"></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:.3rem;font-size:.62rem;color:var(--text3);font-family:var(--fb)">
        <span>0%</span><span style="color:#f39c12">50%</span><span>100%</span>
      </div>
    </div>`;
}
function renderEmpKPIs(){
  const tot=EMPLOYEES.length;
  const apr=EMPLOYEES.filter(e=>e.estatus==='Aprobado').length;
  const pend=EMPLOYEES.filter(e=>e.estatus==='Pendiente').length;
  const pct=Math.round(apr/tot*100);
  document.getElementById('emp-kpis').innerHTML='';
}



// ── RESIZE PANELS ──────────────────────────────────────────────────
function _activateResize(panel){
  const handle = panel.querySelector('.resize-handle');
  if(!handle) return;
  handle.style.display = 'flex';
  handle._onMouseDown = function(e){
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = panel.offsetWidth, startH = panel.offsetHeight;
    panel.style.flex = 'none'; // detach from flex sizing
    function onMove(e){
      const newW = Math.max(180, startW + (e.clientX - startX));
      const newH = Math.max(120, startH + (e.clientY - startY));
      panel.style.width  = newW + 'px';
      panel.style.height = newH + 'px';
      panel.style.overflow = 'auto';
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'se-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  };
  handle.addEventListener('mousedown', handle._onMouseDown);
}

function _deactivateResize(panel){
  const handle = panel.querySelector('.resize-handle');
  if(!handle) return;
  handle.style.display = 'none';
  if(handle._onMouseDown){
    handle.removeEventListener('mousedown', handle._onMouseDown);
    handle._onMouseDown = null;
  }
  // Restore flex sizing
  panel.style.width  = '';
  panel.style.height = '';
  panel.style.overflow = '';
  panel.style.flex = '';
}


// ── FORMAT & COLORS ────────────────────────────────────────
const _root = document.documentElement;

function openFormatPanel(){
  document.getElementById('format-modal').classList.add('open');
}

function applyFormat(){
  const fh  = document.getElementById('fmt-fh').value;
  const fb  = document.getElementById('fmt-fb').value;
  const fps = document.getElementById('fmt-fps').value;
  const sz  = document.getElementById('fmt-kpi-sz').value + 'rem';
  const ft  = document.getElementById('fmt-ft').value;
  _root.style.setProperty('--fh',  fh);
  _root.style.setProperty('--fb',  fb);
  _root.style.setProperty('--fps', fps);
  _root.style.setProperty('--ft',  ft);
  document.querySelectorAll('.kpi-val').forEach(el => el.style.fontSize = sz);
}




// ── TABLE HEADER FORMAT — per-view state ──────────────────────────────────
const _thViews = {
  exams     : { align:'left', weight:'600', size:'11', transform:'uppercase', viewId:'view-exams'     },
  employees : { align:'left', weight:'600', size:'11', transform:'uppercase', viewId:'view-employees' },
  matrix    : { align:'left', weight:'600', size:'11', transform:'uppercase', viewId:'view-matrix'    }
};

function switchThTab(view){
  ['exams','employees','matrix'].forEach(v => {
    document.getElementById('thv-panel-'+v).style.display = v===view ? '' : 'none';
    const tab = document.getElementById('thv-tab-'+v);
    if(tab) tab.classList.toggle('active', v===view);
  });
}

function setThFmt(view, prop, val){
  const cfg = _thViews[view]; if(!cfg) return;
  cfg[prop] = val;

  // Update active button state
  const prefix = `th-${view}-`;
  if(prop === 'align'){
    ['left','center','right'].forEach(a => {
      const b = document.getElementById(prefix+'align-'+a);
      if(b) b.classList.toggle('active', a===val);
    });
  } else if(prop === 'weight'){
    ['400','600','700'].forEach(w => {
      const b = document.getElementById(prefix+'w-'+w);
      if(b) b.classList.toggle('active', w===val);
    });
  } else if(prop === 'transform'){
    ['upper','lower','none'].forEach(t => {
      const key = t==='upper'?'uppercase':t==='lower'?'lowercase':'none';
      const b = document.getElementById(prefix+'tt-'+t);
      if(b) b.classList.toggle('active', key===val);
    });
  }

  // Apply scoped CSS vars to the specific view container
  const el = document.getElementById(cfg.viewId); if(!el) return;
  const rem = (parseInt(cfg.size)/16).toFixed(3)+'rem';
  el.style.setProperty('--th-align',     cfg.align);
  el.style.setProperty('--th-weight',    cfg.weight);
  el.style.setProperty('--th-size',      rem);
  el.style.setProperty('--th-transform', cfg.transform);
}


// ── TABLE CONTENT FORMAT — per-view state ─────────────────────────────────
const _tdViews = {
  exams     : { align:'left', weight:'400', size:'13', transform:'none', viewId:'view-exams'     },
  employees : { align:'left', weight:'400', size:'13', transform:'none', viewId:'view-employees' },
  matrix    : { align:'left', weight:'400', size:'13', transform:'none', viewId:'view-matrix'    }
};

function switchTdTab(view){
  ['exams','employees','matrix'].forEach(v => {
    document.getElementById('tdv-panel-'+v).style.display = v===view ? '' : 'none';
    const tab = document.getElementById('tdv-tab-'+v);
    if(tab) tab.classList.toggle('active', v===view);
  });
}

function setTdFmt(view, prop, val){
  const cfg = _tdViews[view]; if(!cfg) return;
  cfg[prop] = val;

  const prefix = `td-${view}-`;
  if(prop === 'align'){
    ['left','center','right'].forEach(a => {
      const b = document.getElementById(prefix+'align-'+a);
      if(b) b.classList.toggle('active', a===val);
    });
  } else if(prop === 'weight'){
    ['400','600','700'].forEach(w => {
      const b = document.getElementById(prefix+'w-'+w);
      if(b) b.classList.toggle('active', w===val);
    });
  } else if(prop === 'transform'){
    ['none','upper','lower'].forEach(t => {
      const key = t==='upper'?'uppercase':t==='lower'?'lowercase':'none';
      const b = document.getElementById(prefix+'tt-'+t);
      if(b) b.classList.toggle('active', key===val);
    });
  }

  const el = document.getElementById(cfg.viewId); if(!el) return;
  const rem = (parseInt(cfg.size)/16).toFixed(3)+'rem';
  el.style.setProperty('--td-align',     cfg.align);
  el.style.setProperty('--td-weight',    cfg.weight);
  el.style.setProperty('--td-size',      rem);
  el.style.setProperty('--td-transform', cfg.transform);
}

function resetTdView(view){
  const cfg = _tdViews[view]; if(!cfg) return;
  cfg.align='left'; cfg.weight='400'; cfg.size='13'; cfg.transform='none';
  setTdFmt(view,'align','left');
  setTdFmt(view,'weight','400');
  setTdFmt(view,'transform','none');
  const sz  = document.getElementById('td-'+view+'-size');
  const lbl = document.getElementById('td-'+view+'-size-lbl');
  if(sz)  sz.value = 13;
  if(lbl) lbl.textContent = '13px';
  const el = document.getElementById(cfg.viewId); if(!el) return;
  ['--td-align','--td-weight','--td-size','--td-transform'].forEach(v => el.style.removeProperty(v));
}
function resetThView(view){
  const cfg = _thViews[view]; if(!cfg) return;
  cfg.align='left'; cfg.weight='600'; cfg.size='11'; cfg.transform='uppercase';
  // Reset UI controls
  setThFmt(view,'align','left');
  setThFmt(view,'weight','600');
  setThFmt(view,'transform','uppercase');
  const sz = document.getElementById('th-'+view+'-size');
  const lbl= document.getElementById('th-'+view+'-size-lbl');
  if(sz)  sz.value = 11;
  if(lbl) lbl.textContent = '11px';
  // Clear scoped vars
  const el = document.getElementById(cfg.viewId); if(!el) return;
  ['--th-align','--th-weight','--th-size','--th-transform'].forEach(v => el.style.removeProperty(v));
}

function pickTheadColor(btn){
  document.querySelectorAll('.th-swatch').forEach(b=>b.classList.remove('active'));
  ['exams','employees','matrix'].forEach(v => { resetThView(v); resetTdView(v); });
  btn.classList.add('active');
  const bg    = btn.dataset.bg;
  const color = btn.dataset.color;
  _root.style.setProperty('--th-bg',    bg);
  _root.style.setProperty('--th-color', color);
}

function customTheadColor(bg, color){
  document.querySelectorAll('.th-swatch').forEach(b=>b.classList.remove('active'));
  ['exams','employees','matrix'].forEach(v => { resetThView(v); resetTdView(v); });
  _root.style.setProperty('--th-bg',    bg);
  _root.style.setProperty('--th-color', color);
}
function pickAccent(btn){
  document.querySelectorAll('.clr-swatch').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _root.style.setProperty('--accent',  btn.dataset.accent);
  _root.style.setProperty('--accent2', btn.dataset.accent2);
  _root.style.setProperty('--ag',      btn.dataset.ag);
  document.getElementById('fmt-accent-custom').value = btn.dataset.accent;
}

function customAccent(hex){
  document.querySelectorAll('.clr-swatch').forEach(b => b.classList.remove('active'));
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  const l = n => Math.min(n+35,255).toString(16).padStart(2,'0');
  _root.style.setProperty('--accent',  hex);
  _root.style.setProperty('--accent2', '#'+l(r)+l(g)+l(b));
  _root.style.setProperty('--ag',      `rgba(${r},${g},${b},.15)`);
}

// Convierte un color hex a [h, s, l] (0-360, 0-100, 0-100)
function _hexToHsl(hex){
  hex = hex.replace('#','');
  if(hex.length===3) hex=hex.split('').map(c=>c+c).join('');
  const r=parseInt(hex.slice(0,2),16)/255;
  const g=parseInt(hex.slice(2,4),16)/255;
  const b=parseInt(hex.slice(4,6),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0, s=0; const l=(max+min)/2;
  if(max!==min){
    const d=max-min;
    s=l>.5?d/(2-max-min):d/(max+min);
    switch(max){
      case r: h=((g-b)/d+(g<b?6:0))/6; break;
      case g: h=((b-r)/d+2)/6; break;
      case b: h=((r-g)/d+4)/6; break;
    }
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

function applyBgDepth(val){
  const v   = parseInt(val);
  const tint = (document.getElementById('fmt-bg-tint')||{value:'#1b4f8a'}).value;
  const [h]  = _hexToHsl(tint);
  // Tema claro: lightness en rango 80-97%, profundidad separa capas
  const sat  = 10 + Math.round(v * 1.2);          // saturación crece con profundidad
  const lBg  = 97 - Math.round(v * 0.4);           // --bg  (capa más clara)
  const lBg2 = lBg  - 1 - Math.round(v * 0.25);   // --bg2
  const lBg3 = lBg2 - 1 - Math.round(v * 0.25);   // --bg3 (capa más oscura)
  _root.style.setProperty('--bg',  `hsl(${h},${sat}%,${Math.max(lBg,80)}%)`);
  _root.style.setProperty('--bg2', `hsl(${h},${sat+1}%,${Math.max(lBg2,76)}%)`);
  _root.style.setProperty('--bg3', `hsl(${h},${sat+2}%,${Math.max(lBg3,72)}%)`);
}

// Cambiar swatch de tinte y re-aplicar profundidad
function pickBgTint(btn, hex){
  document.querySelectorAll('.bg-tint-swatch').forEach(b=>{
    b.style.borderColor='transparent'; b.classList.remove('active');
  });
  if(btn){ btn.style.borderColor='var(--accent)'; btn.classList.add('active'); }
  const picker = document.getElementById('fmt-bg-tint');
  // Normalise hex (3-digit or 6-digit)
  try { if(picker && hex) picker.value = hex.length===4 ?
    '#'+hex.slice(1).split('').map(c=>c+c).join('') : hex; } catch(e){}
  applyBgDepth(document.getElementById('fmt-bg-depth').value);
}

// Copiar el acento actual al tinte de fondo
function syncTintFromAccent(){
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  // accent puede ser var() o hex
  const hex = accent.startsWith('#') ? accent : '#1b4f8a';
  pickBgTint(null, hex);
  const picker = document.getElementById('fmt-bg-tint');
  if(picker) try { picker.value = hex; } catch(e){}
}



function resetFormat(){
  ['--fh','--fb','--fps','--ft','--th-bg','--th-color','--accent','--accent2','--ag','--bg','--bg2','--bg3']
    .forEach(v => _root.style.removeProperty(v));
  document.getElementById('fmt-fh').selectedIndex  = 0;
  document.getElementById('fmt-fb').selectedIndex  = 0;
  document.getElementById('fmt-fps').selectedIndex = 0;
  document.getElementById('fmt-ft').selectedIndex  = 0;
  document.querySelectorAll('.th-swatch').forEach(b=>b.classList.remove('active'));
  ['exams','employees','matrix'].forEach(v => { resetThView(v); resetTdView(v); });
  const sz = document.getElementById('fmt-kpi-sz');
  sz.value = 1.9; sz.nextElementSibling.textContent = '1.9rem';
  document.getElementById('fmt-bg-depth').value = 10;
  document.getElementById('fmt-accent-custom').value = '#ff6b35';
  const _tintEl = document.getElementById('fmt-bg-tint'); if(_tintEl) _tintEl.value='#1b4f8a';
  document.querySelectorAll('.bg-tint-swatch').forEach((b,i)=>{ b.style.borderColor=i===0?'var(--accent)':'transparent'; });
  applyBgDepth(10);
  document.querySelectorAll('.clr-swatch').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.kpi-val').forEach(el => el.style.fontSize = '');
  document.documentElement.style.removeProperty('--logo-h');
  document.documentElement.style.removeProperty('--logo-w');
  const hl=document.getElementById('hdr-logo'); if(hl){hl.style.height='';hl.style.width='';}
  // Resume auto-fit
  requestAnimationFrame(()=>{ const w2=document.getElementById('logo-text-wrap'); const l2=document.getElementById('hdr-logo'); if(w2&&l2){ const h2=w2.getBoundingClientRect().height; if(h2>0) l2.style.height=h2+'px'; } });
  showToast('\u21ba Formato restaurado');
}

// ── EXAM CHECK SYSTEM ─────────────────────────────────────────
// Persists in session: { empId: { examId: true/false } }
window._examChecks = window._examChecks || {};

function _getChecks(empId){ return window._examChecks[empId] || {}; }

function toggleExamCheck(empId, examId, btn){
  if(!window._examChecks[empId]) window._examChecks[empId] = {};
  const checked = !window._examChecks[empId][examId];
  window._examChecks[empId][examId] = checked;
  btn.classList.toggle('checked', checked);
  btn.textContent = checked ? '✓' : '';
  _updateExamProgress(empId);
  saveEmployeeData();
}

function _updateExamProgress(empId){
  const emp = EMPLOYEES.find(e => e.id === empId); if(!emp) return;
  const emp4check = _empMap[empId]; const myExams = emp4check ? getEmpExams(emp4check) : [];
  const checks  = _getChecks(empId);
  const done    = myExams.filter(ex => checks[ex.id]).length;
  const total   = myExams.length;
  const pct     = total ? Math.round(done/total*100) : 0;

  // Update progress bar + counter in modal
  const bar = document.getElementById('ep-fill-'+empId);
  const lbl = document.getElementById('ep-lbl-'+empId);
  if(bar) bar.style.width = pct+'%';
  if(lbl) lbl.textContent = `${done} / ${total} completados`;

  // Auto-approve when all checked
  if(total > 0 && done === total && emp.estatus !== 'Aprobado'){
    emp.estatus = 'Aprobado';
    const sel = document.getElementById('ms-'+empId);
    if(sel) sel.value = 'Aprobado';
    _rebuildIndexes(); refreshAllKPIs(); renderEmps();
    // El estatus del empleado afecta el conteo "Aprobados" por examen en las
    // vistas Exámenes y Matriz: re-renderizar ambas para que no queden
    // desalineadas respecto a Empleados tras la auto-aprobación.
    try { filterExams(); }  catch(e){ console.warn('exam progress exams:', e); }
    try { renderMatrix(); } catch(e){ console.warn('exam progress matrix:', e); }
    showToast('🎉 ¡'+fmtName(emp.nombre).split(',')[0]+' completó todos los exámenes! → Aprobado');
    // Flash the progress bar green
    if(bar){ bar.style.background='var(--green)'; }
  }
}

// ── NAV DRAG-AND-DROP ───────────────────────────────────────────────
window._navArrangeMode = false;
let _navDragSrc = null;

function toggleNavArrange(){
  window._navArrangeMode = !window._navArrangeMode;
  const btn = document.getElementById('btn-nav-arrange');
  const nav = document.getElementById('main-nav');
  const btns = [...nav.querySelectorAll('.nav-btn')];

  if(window._navArrangeMode){
    btn.style.borderColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
    btn.style.background = 'var(--ag)';
    btn.title = 'Listo';
    showToast('↔ Arrastra las pestañas para reordenarlas');
    btns.forEach(b => {
      b.setAttribute('draggable','true');
      b.addEventListener('dragstart',  _navDragStart);
      b.addEventListener('dragover',   _navDragOver);
      b.addEventListener('drop',       _navDrop);
      b.addEventListener('dragend',    _navDragEnd);
      b.addEventListener('dragenter',  _navDragEnter);
      b.addEventListener('dragleave',  _navDragLeave);
    });
  } else {
    btn.style.borderColor = 'var(--border2)';
    btn.style.color = 'var(--text3)';
    btn.style.background = 'transparent';
    btn.title = 'Reordenar navegación';
    btns.forEach(b => {
      b.removeAttribute('draggable');
      b.classList.remove('nav-dragging','nav-drag-over');
      b.style.transform = '';
      b.removeEventListener('dragstart',  _navDragStart);
      b.removeEventListener('dragover',   _navDragOver);
      b.removeEventListener('drop',       _navDrop);
      b.removeEventListener('dragend',    _navDragEnd);
      b.removeEventListener('dragenter',  _navDragEnter);
      b.removeEventListener('dragleave',  _navDragLeave);
    });
    showToast('✅ Orden de pestañas guardado');
  }
}

function _navDragStart(e){
  _navDragSrc = this;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => this.classList.add('nav-dragging'), 0);
}
function _navDragEnter(){
  if(this !== _navDragSrc) this.classList.add('nav-drag-over');
}
function _navDragLeave(){
  this.classList.remove('nav-drag-over');
}
function _navDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  // Visual left/right hint
  const rect = this.getBoundingClientRect();
  const mid  = rect.left + rect.width / 2;
  this.style.borderLeft  = e.clientX < mid ? '2px solid var(--accent)' : '';
  this.style.borderRight = e.clientX >= mid ? '2px solid var(--accent)' : '';
}
function _navDrop(e){
  e.preventDefault();
  if(_navDragSrc === this) return;
  const nav   = document.getElementById('main-nav');
  const btns  = [...nav.querySelectorAll('.nav-btn')];
  const srcI  = btns.indexOf(_navDragSrc);
  const tgtI  = btns.indexOf(this);
  const rect  = this.getBoundingClientRect();
  const mid   = rect.left + rect.width / 2;
  if(e.clientX < mid) nav.insertBefore(_navDragSrc, this);
  else                nav.insertBefore(_navDragSrc, this.nextSibling);
  this.classList.remove('nav-drag-over');
  this.style.borderLeft = '';
  this.style.borderRight = '';
}
function _navDragEnd(){
  this.classList.remove('nav-dragging');
  document.querySelectorAll('#main-nav .nav-btn').forEach(b=>{
    b.classList.remove('nav-drag-over');
    b.style.borderLeft = '';
    b.style.borderRight = '';
    b.style.transform = '';
  });
}

function toggleArrange(){
  window._arrangeMode = !window._arrangeMode;
  const btn = document.getElementById('btn-arrange');
  const grid = document.getElementById('dash-kpis');
  const chartsGrid = document.getElementById('dash-charts');
  const cards = [...grid.children];
  const panels = [...chartsGrid.querySelectorAll('.dash-panel')];

  if(window._arrangeMode){
    btn.textContent = '\u2705 Listo';
    btn.style.borderColor = 'var(--green)';
    btn.style.color = 'var(--green)';
    btn.style.background = 'var(--gg)';
    showToast('\ud83d\udd00 Arrastra los KPI y paneles para reordenarlos');

    // KPI cards
    cards.forEach(card => {
      card.setAttribute('draggable', 'true');
      card.style.cursor = 'grab';
      card.style.outline = '2px dashed var(--accent)';
      card.style.outlineOffset = '3px';
      card.style.transition = 'opacity .15s, transform .15s';
      card.addEventListener('dragstart', _dragStart);
      card.addEventListener('dragover',  _dragOver);
      card.addEventListener('drop',      _dragDrop);
      card.addEventListener('dragend',   _dragEnd);
      card.addEventListener('dragenter', _dragEnter);
      card.addEventListener('dragleave', _dragLeave);
    });

    // Chart panels
    panels.forEach(panel => {
      panel.setAttribute('draggable', 'true');
      panel.style.outline = '2px dashed var(--green)';
      panel.style.outlineOffset = '3px';
      panel.style.transition = 'opacity .15s, transform .15s';
      panel.querySelector('.drag-handle').style.display = 'inline';
      _activateResize(panel);
      panel.addEventListener('dragstart', _panelDragStart);
      panel.addEventListener('dragover',  _panelDragOver);
      panel.addEventListener('drop',      _panelDragDrop);
      panel.addEventListener('dragend',   _panelDragEnd);
      panel.addEventListener('dragenter', _panelDragEnter);
      panel.addEventListener('dragleave', _panelDragLeave);
    });

  } else {
    btn.textContent = '\u2699\ufe0f Ordenar tablero';
    btn.style.borderColor = 'var(--border2)';
    btn.style.color = 'var(--text2)';
    btn.style.background = 'transparent';

    cards.forEach(card => {
      card.removeAttribute('draggable');
      card.style.cursor = '';
      card.style.outline = '';
      card.style.outlineOffset = '';
      card.removeEventListener('dragstart', _dragStart);
      card.removeEventListener('dragover',  _dragOver);
      card.removeEventListener('drop',      _dragDrop);
      card.removeEventListener('dragend',   _dragEnd);
      card.removeEventListener('dragenter', _dragEnter);
      card.removeEventListener('dragleave', _dragLeave);
    });

    panels.forEach(panel => {
      panel.removeAttribute('draggable');
      panel.style.outline = '';
      panel.style.outlineOffset = '';
      panel.querySelector('.drag-handle').style.display = 'none';
      _deactivateResize(panel);
      panel.removeEventListener('dragstart', _panelDragStart);
      panel.removeEventListener('dragover',  _panelDragOver);
      panel.removeEventListener('drop',      _panelDragDrop);
      panel.removeEventListener('dragend',   _panelDragEnd);
      panel.removeEventListener('dragenter', _panelDragEnter);
      panel.removeEventListener('dragleave', _panelDragLeave);
    });
    saveDashboardLayout();
  }
}

let _dragSrc = null;

function _dragStart(e){
  _dragSrc = this;
  this.style.opacity = '.4';
  e.dataTransfer.effectAllowed = 'move';
}
function _dragEnter(){
  if(this !== _dragSrc) this.style.transform = 'scale(1.04)';
}
function _dragLeave(){
  this.style.transform = '';
}
function _dragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}
function _dragDrop(e){
  e.preventDefault();
  if(_dragSrc === this) return;
  const grid = document.getElementById('dash-kpis');
  const cards = [...grid.children];
  const srcIdx = cards.indexOf(_dragSrc);
  const tgtIdx = cards.indexOf(this);
  if(srcIdx < tgtIdx) grid.insertBefore(_dragSrc, this.nextSibling);
  else                grid.insertBefore(_dragSrc, this);
  this.style.transform = '';
}

let _panelSrc = null;
function _panelDragStart(e){ _panelSrc=this; this.style.opacity='.4'; e.dataTransfer.effectAllowed='move'; }
function _panelDragEnter(){ if(this!==_panelSrc) this.style.outline='2px solid var(--green)'; }
function _panelDragLeave(){ this.style.outline='2px dashed var(--green)'; }
function _panelDragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; }
function _panelDragDrop(e){
  e.preventDefault();
  if(_panelSrc===this) return;
  const grid=document.getElementById('dash-charts');
  const panels=[...grid.querySelectorAll('.dash-panel')];
  const si=panels.indexOf(_panelSrc), ti=panels.indexOf(this);
  if(si<ti) grid.insertBefore(_panelSrc, this.nextSibling);
  else      grid.insertBefore(_panelSrc, this);
  this.style.outline='2px dashed var(--green)';
}
function _panelDragEnd(){ this.style.opacity='1'; document.querySelectorAll('.dash-panel').forEach(p=>p.style.outline='2px dashed var(--green)'); }
function _dragEnd(){
  this.style.opacity = '1';
  document.querySelectorAll('#dash-kpis > *').forEach(c => c.style.transform = '');
}


// ════════════════════════════════════════════════════════════════
// CHART TYPE SYSTEM
// ════════════════════════════════════════════════════════════════
const CHART_TYPES = {
  kpi: {
    empleados:   { current:'number', options:['number','donut','bar'] },
    aprobados:   { current:'number', options:['number','donut','pie'] },
    pendientes:  { current:'number', options:['number','donut','bar'] },
    cumplimiento:{ current:'number', options:['number','donut','progress'] }
  },
  panel: {
    area:   { current:'bar', options:['bar','pie','donut'] },
    cov:    { current:'bar', options:['bar','pie','donut'] },
    status: { current:'bar', options:['bar','stacked','donut'] }
  }
};

const KPI_LABELS   = { empleados:'Empleados', aprobados:'Aprobados', pendientes:'Pendientes', cumplimiento:'Cumplimiento' };
const PANEL_LABELS = { area:'Empleados por Área', cov:'Cobertura de Exámenes', status:'Aprobados vs Pendientes' };
const TYPE_ICONS   = { number:'🔢', bar:'▬', pie:'◑', donut:'◎', progress:'▭', stacked:'⊟' };

function openChartTypePanel(){
  _renderChartTypeRows();
  document.getElementById('chart-type-modal').classList.add('open');
}

function _renderChartTypeRows(){
  // KPI rows
  const kpiContainer = document.getElementById('ct-kpi-rows');
  kpiContainer.innerHTML = Object.entries(CHART_TYPES.kpi).map(([key, cfg]) => `
    <div class="ct-row">
      <span class="ct-row-label">${KPI_LABELS[key]}</span>
      <div class="ct-btns">
        ${cfg.options.map(t => `
          <button class="ct-btn ${cfg.current===t?'active':''}"
            onclick="setChartType('kpi','${key}','${t}')">
            ${TYPE_ICONS[t]} ${t}
          </button>`).join('')}
      </div>
    </div>`).join('');

  // Panel rows
  const panelContainer = document.getElementById('ct-panel-rows');
  panelContainer.innerHTML = Object.entries(CHART_TYPES.panel).map(([key, cfg]) => `
    <div class="ct-row">
      <span class="ct-row-label">${PANEL_LABELS[key]}</span>
      <div class="ct-btns">
        ${cfg.options.map(t => `
          <button class="ct-btn ${cfg.current===t?'active':''}"
            onclick="setChartType('panel','${key}','${t}')">
            ${TYPE_ICONS[t]} ${t}
          </button>`).join('')}
      </div>
    </div>`).join('');
}

function setChartType(group, key, type){
  CHART_TYPES[group][key].current = type;
  _renderChartTypeRows();    // refresh active buttons
  renderDashboard();         // re-render charts
}

// ── SVG helpers (pie / donut) ────────────────────────────────────
const PIE_PAL = ['#ff6b35','#22d3a0','#6366f1','#f5c518','#ec4899','#14b8a6','#f97316','#a78bfa','#34d399','#fb7185','#38bdf8','#fbbf24'];

function _pieSlices(data){
  const total = data.reduce((s,d)=>s+d.v,0)||1;
  let ang = -Math.PI/2;
  return data.map(d=>{
    const s=(d.v/total)*2*Math.PI;
    const x1=Math.cos(ang),y1=Math.sin(ang); ang+=s;
    const x2=Math.cos(ang),y2=Math.sin(ang);
    return {...d,x1,y1,x2,y2,large:s>Math.PI?1:0,pct:((d.v/total)*100).toFixed(1)};
  });
}

function _svgPie(data, r=90, cx=100, cy=100, size=200){
  const slices = _pieSlices(data);
  const arcs = slices.map(s=>`
    <path d="M${cx},${cy} L${cx+r*s.x1},${cy+r*s.y1} A${r},${r} 0 ${s.large} 1 ${cx+r*s.x2},${cy+r*s.y2} Z"
      fill="${s.c}" opacity=".92"><title>${esc(s.label)}: ${s.v} (${s.pct}%)</title></path>`).join('');
  const legend = data.map(d=>`
    <div style="display:flex;align-items:center;gap:.35rem;font-size:.7rem;margin-bottom:.2rem">
      <span style="width:9px;height:9px;border-radius:2px;background:${d.c};flex-shrink:0;display:inline-block"></span>
      <span style="color:var(--text2);flex:1">${esc(d.label)}</span>
      <span style="color:var(--text3)">${d.v}</span>
    </div>`).join('');
  return `<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;justify-content:center">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}</svg>
    <div style="min-width:110px">${legend}</div></div>`;
}

function _svgDonut(data, r=70, cx=100, cy=100, size=200){
  const slices = _pieSlices(data);
  const circ = 2*Math.PI*r;
  let off = 0;
  const arcs = slices.map(s=>{
    const dash = (s.v/(data.reduce((a,b)=>a+b.v,0)||1))*circ;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.c}" stroke-width="22"
      stroke-dasharray="${dash.toFixed(2)} ${(circ-dash).toFixed(2)}"
      stroke-dashoffset="${-off.toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"><title>${esc(s.label)}: ${s.v}</title></circle>`;
    off += dash; return arc;
  }).join('');
  const legend = data.map(d=>`
    <div style="display:flex;align-items:center;gap:.35rem;font-size:.7rem;margin-bottom:.2rem">
      <span style="width:9px;height:9px;border-radius:50%;background:${d.c};flex-shrink:0;display:inline-block"></span>
      <span style="color:var(--text2);flex:1">${esc(d.label)}</span>
      <span style="color:var(--text3)">${d.v}</span>
    </div>`).join('');
  return `<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;justify-content:center">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg3)" stroke-width="22"/>${arcs}</svg>
    <div style="min-width:110px">${legend}</div></div>`;
}

// ── KPI card renderers per type ──────────────────────────────────
function _kpiRender(key, label, val, sub, cls){
  const type = CHART_TYPES.kpi[key].current;
  const tot  = EMPLOYEES.length || 1;
  const apr  = EMPLOYEES.filter(e=>e.estatus==='Aprobado').length;
  const pend = EMPLOYEES.filter(e=>e.estatus==='Pendiente').length;
  const pct  = Math.round(apr/tot*100);

  if(type === 'number') return kCard(label, val, cls, sub);

  if(type === 'donut'){
    const r=38, circ=2*Math.PI*r;
    const numV = parseFloat(val);
    const pctV = key==='cumplimiento' ? numV : Math.round(numV/tot*100);
    const color = cls==='g'?'var(--green)':cls==='y'?'var(--yellow)':cls==='r'?'var(--red)':'var(--accent)';
    const dash = circ*(pctV/100), gap=circ-dash;
    const uid = 'kd-'+key;
    setTimeout(()=>{ const a=$(`${uid}-arc`); if(a) a.style.strokeDasharray=`${dash.toFixed(2)} ${gap.toFixed(2)}`; },60);
    return `<div class="kpi ${cls}" style="flex-direction:column;align-items:center;padding:.6rem .4rem;gap:.25rem">
      <div class="kpi-lbl">${label}</div>
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="${r}" fill="none" stroke="var(--bg3)" stroke-width="8"/>
        <circle id="${uid}-arc" cx="45" cy="45" r="${r}" fill="none" stroke="${color}" stroke-width="8"
          stroke-linecap="round" stroke-dasharray="0 ${circ.toFixed(2)}"
          transform="rotate(-90 45 45)" style="transition:stroke-dasharray .6s ease"/>
        <text x="45" y="49" text-anchor="middle" font-family="var(--fps)" font-size="15" font-weight="800" fill="${color}">${val}</text>
      </svg>
    </div>`;
  }

  if(type === 'bar'){
    const numV = parseFloat(val);
    const pctV = key==='cumplimiento' ? numV : Math.round(numV/tot*100);
    const color = cls==='g'?'var(--green)':cls==='y'?'var(--yellow)':cls==='r'?'var(--red)':'var(--accent)';
    const uid = 'kb-'+key;
    setTimeout(()=>{ const b=$(uid); if(b) b.style.width=pctV+'%'; },60);
    return `<div class="kpi ${cls}" style="flex-direction:column;justify-content:center;padding:.7rem .8rem;gap:.3rem">
      <div class="kpi-lbl">${label}</div>
      <div class="kpi-val ${cls}" style="margin:.15rem 0">${val}</div>
      <div style="height:6px;background:var(--bg3);border-radius:99px;overflow:hidden">
        <div id="${uid}" style="height:100%;width:0%;background:${color};border-radius:99px;transition:width .7s cubic-bezier(.4,0,.2,1)"></div>
      </div>
      ${sub?`<div class="kpi-sub">${sub}</div>`:''}
    </div>`;
  }

  if(type === 'progress'){
    const numV = parseFloat(val);
    const color = numV>=80?'var(--green)':numV>=50?'var(--yellow)':'var(--red)';
    const uid = 'kp-'+key;
    setTimeout(()=>{ const b=$(uid); if(b) b.style.width=numV+'%'; },60);
    return `<div class="kpi ${cls}" style="flex-direction:column;justify-content:center;padding:.7rem .8rem;gap:.3rem">
      <div class="kpi-lbl">${label}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div class="kpi-val ${cls}">${val}</div>
        <span style="font-size:.68rem;color:var(--text3)">${sub}</span>
      </div>
      <div style="height:10px;background:linear-gradient(to right,#e74c3c 0%,#f39c12 50%,#22c55e 100%);border-radius:99px;position:relative;overflow:hidden">
        <div style="position:absolute;top:0;right:0;bottom:0;width:${100-numV}%;background:var(--bg3);border-radius:0 99px 99px 0;transition:width .8s ease"></div>
      </div>
    </div>`;
  }

  if(type === 'pie'){
    return `<div class="kpi" style="flex-direction:column;align-items:center;padding:.6rem .4rem;gap:.25rem">
      <div class="kpi-lbl">${label}</div>
      ${_svgPie([{label:'Aprobados',v:apr,c:'var(--green)'},{label:'Pendientes',v:pend,c:'var(--yellow)'}],60,70,70,140)}
    </div>`;
  }

  return kCard(label, val, cls, sub);
}


// ════════════════════════════════════════════════════════════════
// KPI VISIBILITY — hide/show individual cards
// ════════════════════════════════════════════════════════════════
let _hiddenKpis = new Set(); // set of kpi keys: 'empleados'|'aprobados'|'pendientes'|'cumplimiento'

function _loadHiddenKpis(){
  try{
    const s = JSON.parse(localStorage.getItem('nmc-hidden-kpis')||'[]');
    _hiddenKpis = new Set(Array.isArray(s)?s:[]);
  } catch(e){ _hiddenKpis = new Set(); }
}

function _saveHiddenKpis(){
  try{ localStorage.setItem('nmc-hidden-kpis', JSON.stringify([..._hiddenKpis])); } catch(e){}
}

function hideKpi(key){
  _hiddenKpis.add(key);
  _saveHiddenKpis();
  renderDashboard();
}

function restoreKpi(key){
  _hiddenKpis.delete(key);
  _saveHiddenKpis();
  renderDashboard();
}

function restoreAllKpis(){
  _hiddenKpis.clear();
  _saveHiddenKpis();
  renderDashboard();
}

function _updateRestoreBar(){
  const bar   = document.getElementById('kpi-restore-bar');
  const chips = document.getElementById('kpi-restore-chips');
  if(!bar || !chips) return;
  if(!_hiddenKpis.size){ bar.style.display='none'; return; }
  bar.style.display='flex';
  const labels = {empleados:'Empleados',aprobados:'Aprobados',pendientes:'Pendientes',cumplimiento:'Cumplimiento'};
  chips.innerHTML = [..._hiddenKpis].map(k =>
    `<button class="kpi-restore-chip" onclick="restoreKpi('${k}')">
      + ${labels[k]||k}
    </button>`
  ).join('');
}

function renderDashboard(){
  const tot=EMPLOYEES.length;
  const apr=EMPLOYEES.filter(e=>e.estatus==='Aprobado').length;
  const pend=EMPLOYEES.filter(e=>e.estatus==='Pendiente').length;
  const pct=(apr/tot*100).toFixed(1);

  // Build KPI defs — skip hidden ones
  const kpiDefs=[
    {key:'empleados',   label:'Empleados',   val:tot,      sub:'',       cls:'o'},
    {key:'aprobados',   label:'Aprobados',   val:apr,      sub:pct+'%',  cls:'g'},
    {key:'pendientes',  label:'Pendientes',  val:pend,     sub:'',       cls:'y'},
    {key:'cumplimiento',label:'Cumplimiento',val:pct+'%',  sub:'global', cls:parseFloat(pct)>=50?'g':'r'},
  ];

  // Wrap each rendered card with hide button
  const wrap=(key,inner)=>inner.replace(/^<div class="kpi/,
    `<div data-kpi="${key}" class="kpi`)
    .replace(/<div class="kpi-lbl">/,
    `<button class="kpi-hide-btn" onclick="hideKpi('${key}')" title="Ocultar este KPI">✕</button><div class="kpi-lbl">`);

  document.getElementById('dash-kpis').innerHTML=
    kpiDefs.filter(d=>!_hiddenKpis.has(d.key))
            .map(d=>wrap(d.key, _kpiRender(d.key,d.label,d.val,d.sub,d.cls)))
            .join('');

  // Assign stable data-kpi identifiers so order can be saved/restored
  const _kpiKeys = ['empleados','aprobados','pendientes','cumplimiento'];
  [...document.getElementById('dash-kpis').children].forEach((el,i) => { el.dataset.kpi = _kpiKeys[i]; });
  _restoreKpiOrder();

  // Update restore bar
  _updateRestoreBar();

  // Area bar chart
  const ac={};
  EMPLOYEES.forEach(e=>{ if(e.area) ac[e.area]=(ac[e.area]||0)+1; });
  const sorted=Object.entries(ac).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const maxA=Math.max(...sorted.map(a=>a[1]));
  const aType = CHART_TYPES.panel.area.current;
  if(aType === 'pie'){
    document.getElementById('area-chart').innerHTML = _svgPie(sorted.map(([label,v],i)=>({label,v,c:PIE_PAL[i%PIE_PAL.length]})),85,100,100,200);
  } else if(aType === 'donut'){
    document.getElementById('area-chart').innerHTML = _svgDonut(sorted.map(([label,v],i)=>({label,v,c:PIE_PAL[i%PIE_PAL.length]})),65,100,100,200);
  } else {
    document.getElementById('area-chart').innerHTML = '';
    const aFrag = document.createDocumentFragment();
    sorted.forEach(([area,cnt]) => {
      const pct = (cnt/maxA*100).toFixed(0);
      const el = document.createElement('div'); el.className = 'chart-row';
      el.innerHTML = `<div class="chart-row-hdr"><span class="fs77">${esc(area)}</span><span class="accent-bold">${cnt}</span></div>
        <div class="pbar"><div class="d-bar pfill" style="width:0%;background:var(--accent)"></div></div>`;
      aFrag.appendChild(el);
      setTimeout(() => { const b=el.querySelector('.d-bar'); if(b) b.style.width=pct+'%'; }, 80);
    });
    document.getElementById('area-chart').appendChild(aFrag);
  }

  // Coverage chart per area — uses the puesto with the most exams (max column per area)
  // ── Cobertura de Exámenes por Área ─────────────────────────────────────────
  // Fuente: EMPLOYEES (misma base que Aprobados vs Pendientes) — cuenta exámenes
  // únicos asignados (exam_ids) a empleados de cada área. Sin duplicados por puesto.
  const covByArea = {};
  EMPLOYEES.forEach(e => {
    const a = (e.area||'Sin área').trim();
    if(!covByArea[a]) covByArea[a] = { examsSet: new Set(), empCount: 0 };
    covByArea[a].empCount++;
    (e.exam_ids||[]).forEach(xid => covByArea[a].examsSet.add(xid));
  });

  // Sort same as areaStatus (by employee count desc) so row order matches
  const covArr = Object.entries(covByArea)
    .map(([area, d]) => [area, d.examsSet.size, d.empCount])
    .filter(([,cnt]) => cnt > 0)
    .sort((a, b) => b[2] - a[2]); // sort by empCount desc

  const maxC = Math.max(...covArr.map(([,cnt]) => cnt), 1);
  const cType = CHART_TYPES.panel.cov.current;

  if(cType === 'pie'){
    document.getElementById('cov-chart').innerHTML = _svgPie(
      covArr.map(([label,v],i)=>({label,v,c:PIE_PAL[i%PIE_PAL.length]})),85,100,100,200);
  } else if(cType === 'donut'){
    document.getElementById('cov-chart').innerHTML = _svgDonut(
      covArr.map(([label,v],i)=>({label,v,c:PIE_PAL[i%PIE_PAL.length]})),65,100,100,200);
  } else {
    document.getElementById('cov-chart').innerHTML = '';
    const cFrag = document.createDocumentFragment();
    covArr.forEach(([area, cnt, empCnt]) => {
      const barPct = (cnt / maxC * 100).toFixed(0);
      const el = document.createElement('div'); el.className = 'chart-row';
      el.innerHTML = `
        <div class="chart-row-hdr">
          <span class="fs77">${esc(area)}</span>
          <div style="display:flex;gap:.65rem;font-size:.72rem;white-space:nowrap;align-items:center">
            <span style="color:var(--green);font-weight:700">${cnt} exáms</span>
            <span style="color:var(--text3)">${empCnt} emp.</span>
          </div>
        </div>
        <div class="pbar"><div class="d-bar" style="width:0%;background:linear-gradient(90deg,var(--green),var(--accent));height:100%;border-radius:inherit"></div></div>`;
      cFrag.appendChild(el);
      setTimeout(() => { const b = el.querySelector('.d-bar'); if(b) b.style.width = barPct+'%'; }, 80);
    });
    document.getElementById('cov-chart').appendChild(cFrag);
  }

  // ── Aprobados vs Pendientes por Área ────────────────────────────────────
  const areaStatus = {};
  EMPLOYEES.forEach(e => {
    const a = (e.area||'Sin área').trim();
    if(!areaStatus[a]) areaStatus[a] = {apr:0, pend:0, inact:0, total:0};
    areaStatus[a].total++;
    if(e.estatus==='Aprobado')       areaStatus[a].apr++;
    else if(e.estatus==='Pendiente') areaStatus[a].pend++;
    else                             areaStatus[a].inact++;
  });

  const sortedAS = Object.entries(areaStatus).sort((a,b)=>b[1].total-a[1].total);
  const maxAS = Math.max(...sortedAS.map(([,v])=>v.total), 1);

  const stType = CHART_TYPES.panel.status.current;
  if(stType === 'donut'){
    const aprTot=sortedAS.reduce((s,[,v])=>s+v.apr,0);
    const pendTot=sortedAS.reduce((s,[,v])=>s+v.pend,0);
    const inactTot=sortedAS.reduce((s,[,v])=>s+v.inact,0);
    document.getElementById('status-area-chart').innerHTML=_svgDonut([
      {label:'Aprobados',v:aprTot,c:'var(--green)'},
      {label:'Pendientes',v:pendTot,c:'var(--yellow)'},
      {label:'Inactivos',v:inactTot,c:'var(--red)'}
    ],65,100,100,200);
  } else {
  document.getElementById('status-area-chart').innerHTML = sortedAS.map(([area, v]) => {
    const aprW  = (v.apr  / maxAS * 100).toFixed(1);
    const pendW = (v.pend / maxAS * 100).toFixed(1);
    const inactW= (v.inact/ maxAS * 100).toFixed(1);
    const aprPct = v.total ? Math.round(v.apr/v.total*100) : 0;
    return `
    <div style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:.78rem;margin-bottom:.35rem;gap:.5rem">
        <span style="color:var(--text2);font-weight:500;min-width:120px">${esc(area)}</span>
        <div style="display:flex;gap:.75rem;font-size:.72rem;white-space:nowrap">
          <span style="color:var(--green)">✓ ${v.apr} apr.</span>
          <span style="color:var(--yellow)">⏳ ${v.pend} pend.</span>
          ${v.inact?`<span style="color:var(--red)">✕ ${v.inact}</span>`:''}
          <span style="color:var(--text3);font-weight:700">${aprPct}%</span>
        </div>
      </div>
      <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--border);gap:1px">
        ${v.apr  ? `<div style="width:${aprW}%;background:var(--green);transition:width .5s ease" title="Aprobados: ${v.apr}"></div>`  : ''}
        ${v.pend ? `<div style="width:${pendW}%;background:var(--yellow);transition:width .5s ease" title="Pendientes: ${v.pend}"></div>` : ''}
        ${v.inact? `<div style="width:${inactW}%;background:var(--red);transition:width .5s ease" title="Inactivos: ${v.inact}"></div>`  : ''}
      </div>
    </div>`;
  }).join('');
  }
}

// ── Single entry-point: call after ANY data mutation ─────────────────────
function refreshAllKPIs(){
  renderExamKPIs();
  renderEmpKPIs();
  renderDashboard();
}

// ════════════════════════════════════════════════════════
// EXAMS
// ════════════════════════════════════════════════════════
function filterExams(){
  const q=document.getElementById('ex-q').value.toLowerCase();
  const area=document.getElementById('ex-area').value;
  const puesto=document.getElementById('ex-puesto').value;
  const status=document.getElementById('ex-status').value;
  const cert=document.getElementById('ex-cert').value;

  filtExams=EXAMS.filter(ex=>{
    const mQ=!q||ex.tema.toLowerCase().includes(q)||ex.id.toLowerCase().includes(q);
    // Filtrar por área/puesto de los empleados asignados — misma lógica que filterEmps
    const mA=!area  ||getExamEmps(ex).some(e=>e.area  ===area);
    const mP=!puesto||getExamEmps(ex).some(e=>e.puesto===puesto);
    const mS=!status||ex.estatus===status;
    let mC=true;
    if(cert){
      const emps=getExamEmps(ex);
      const apr=emps.filter(e=>e.estatus==='Aprobado').length;
      if(cert==='pend') mC=emps.length>0&&apr<emps.length;
      if(cert==='full') mC=emps.length>0&&apr===emps.length;
      if(cert==='none') mC=emps.length===0;
    }
    return mQ&&mA&&mP&&mS&&mC;
  });
  exPage=1;
  updateExamEmailBar();
  renderExams();
}

// ── Returns only the employees who match the active area/puesto filter
//    AND appear in at least one of the currently filtered exams ─────────────
function getFilteredEmpTargets(area, puesto){
  // Step 1: collect employees that are in any filtExam
  const filtEmpIds=new Set(EMPLOYEES.filter(e=>(e.exam_ids||[]).some(xid=>filtExams.some(ex=>ex.id===xid))).map(e=>e.id));

  // Step 2: from those, keep only employees whose own puesto/area matches the filter
  return EMPLOYEES.filter(emp=>{
    if(!filtEmpIds.has(emp.id)) return false;
    const matchA=!area  || emp.area.toUpperCase()===area.toUpperCase();
    const matchP=!puesto|| emp.puesto.toUpperCase()===puesto.toUpperCase();
    return matchA && matchP;
  });
}

function buildFilterDesc(area, puesto){
  if(area && puesto) return `Área: ${area} · Puesto: ${puesto}`;
  if(puesto) return `Puesto: ${puesto}`;
  if(area)   return `Área: ${area}`;
  return 'Filtro activo';
}

function updateExamEmailBar(){
  const area=document.getElementById('ex-area').value;
  const puesto=document.getElementById('ex-puesto').value;
  const bar=document.getElementById('ex-email-bar');
  const lbl=document.getElementById('ex-email-bar-label');
  const sub=document.getElementById('ex-email-bar-sub');
  const hasFilter=area||puesto;
  if(!hasFilter){ bar.style.display='none'; return; }

  // Only employees whose puesto/area matches the active filter
  const targets=getFilteredEmpTargets(area, puesto);
  const withEmail=targets.filter(e=>e.email&&e.email!=='No hay numero'&&e.email.includes('@'));

  const filterDesc=buildFilterDesc(area, puesto);
  lbl.textContent=`${withEmail.length} empleados con correo válido — ${filterDesc}`;
  sub.textContent=`${filtExams.length} examen(es) en el filtro · ${targets.length} empleados que aplican`;
  bar.style.display='flex';
}

function openExamFilterEmailBlast(){
  const area=document.getElementById('ex-area').value;
  const puesto=document.getElementById('ex-puesto').value;
  const filterDesc=buildFilterDesc(area, puesto);

  // Only employees whose puesto/area matches the active filter AND are in filtExams
  const targets=getFilteredEmpTargets(area, puesto);
  const withEmail=targets.filter(e=>e.email&&e.email!=='No hay numero'&&e.email.includes('@'));
  const emails=[...new Set(withEmail.map(e=>e.email.trim()))];
  const noEmail=targets.length-withEmail.length;

  // Alcance filtrado (mismo que la matriz): exámenes que aplican a los
  // puestos del filtro, no la sumatoria de filtExams.
  const _scope = getMatrizScope(area, puesto);
  const examenesCorreo = _scope.examenes.length ? _scope.examenes : filtExams;

  document.getElementById('em-title').innerHTML=`✉️ Correo — ${esc(filterDesc)}`;
  document.getElementById('em-sub').innerHTML=
    `<strong style="color:var(--accent)">${examenesCorreo.length}</strong> examen(es) · <strong style="color:var(--accent)">${withEmail.length}</strong> destinatarios con email válido`;
  document.getElementById('em-count').textContent=emails.length;
  document.getElementById('em-noemail').textContent=noEmail;
  document.getElementById('em-list').value=emails.join('; ');

  // Build HTML email body with hyperlinked exam table
  const subject=`Recordatorio de Certificación — ${filterDesc}`;
  const htmlBody=buildExamEmailHtml(
    `Le recordamos que debe completar los siguientes exámenes correspondientes a su puesto (${filterDesc}):`,
    examenesCorreo, filterDesc
  );
  const btn=document.getElementById('em-mailto');
  window._pendingOutlook=()=>openOutlookCompose(emails, subject, htmlBody);
  btn.style.display=emails.length?'flex':'none';

  // Preview: exams list first, then recipients
  const examPreview=examenesCorreo.length?`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:.8rem;margin-bottom:.85rem">
      <div style="font-size:.7rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.55rem">Exámenes incluidos en el correo (${examenesCorreo.length})</div>
      ${examenesCorreo.map(ex=>`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.3rem 0;border-bottom:1px solid var(--border)">
          <div style="min-width:0;flex:1">
            <div style="font-size:.78rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(ex.tema)}">${esc(ex.tema)}</div>
            <div style="font-size:.65rem;color:var(--accent)">${esc(ex.id)}</div>
          </div>
          ${safeUrl(ex.url)?`<a href="${esc(safeUrl(ex.url))}" target="_blank" rel="noopener noreferrer" class="btn btn-p btn-sm" style="font-size:.64rem;padding:.18rem .45rem;flex-shrink:0" >🔗</a>`:''}
        </div>`).join('')}
    </div>`:'';

  document.getElementById('em-preview').innerHTML=examPreview+
    withEmail.slice(0,15).map(e=>`
    <div style="display:flex;align-items:center;gap:.65rem;padding:.4rem 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:.82rem;font-weight:500">${esc(fmtName(e.nombre))}</div>
        <div style="font-size:.68rem;color:var(--text3)">${esc(e.email)} · <span class="puesto-tag" style="font-size:.62rem">${esc(e.puesto)}</span></div>
      </div>
      ${sBadge(e.estatus)}
    </div>`).join('')+
    (withEmail.length>15?`<div style="text-align:center;color:var(--text3);font-size:.76rem;padding:.55rem">... y ${withEmail.length-15} destinatarios más</div>`:'');

  document.getElementById('email-modal').classList.add('open');
}

function _examRowTemplate(ex) {
  const empMap = Object.fromEntries(EMPLOYEES.map(e=>[e.id,e]));
  const emps = getExamEmps(ex);
  const apr  = emps.filter(e => e.estatus === 'Aprobado').length;
  const pct  = emps.length ? Math.round(apr / emps.length * 100) : null;
  const pColor = pct === null ? 'var(--text3)' : pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
  const certCell = emps.length === 0
    ? `<span class="dim-text">—</span>`
    : `<div class="cert-cell">
        <div class="cert-header">
          <span class="dim-text">${apr}/${emps.length}</span>
          <span class="fw7" style="color:${pColor}">${pct}%</span>
        </div>
        <div class="pbar" style="height:4px"><div class="pfill" style="width:${pct}%;background:${pColor}"></div></div>
      </div>`;
  return `<tr data-id="${esc(ex.id)}" style="cursor:pointer">
    <td><span class="id-chip" style="font-size:.78rem;color:var(--accent)">${esc(ex.id)}</span></td>
    <td class="exam-tema-cell"><div class="fw5 fs83">${esc(ex.tema)}</div></td>
    <td>${certCell}</td>
    <td>${sBadge(ex.estatus)}</td>
    <td style="white-space:nowrap">
      ${safeUrl(ex.url) ? `<a href="${esc(safeUrl(ex.url))}" target="_blank" rel="noopener noreferrer" class="btn btn-p btn-sm">🔗</a> ` : ''}
      <button class="btn-email-row" data-email="${esc(ex.id)}">✉️ Correo</button>
    </td>
  </tr>`;
}

function renderExams() {
  const tbody = $('ex-tbody');
  if (!filtExams.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="empty-icon">🔍</div><div>Sin resultados</div></div></td></tr>`;
    $('ex-pager').innerHTML = '';
    return;
  }
  const page = filtExams.slice((exPage-1)*EX_PS, exPage*EX_PS);
  batchRender(tbody, page, _examRowTemplate,
    `<tr><td colspan="5"><div class="empty"><div class="empty-icon">🔍</div><div>Sin resultados</div></div></td></tr>`);
  renderPager('ex-pager', filtExams.length, EX_PS, exPage, p => { exPage = p; renderExams(); });
}

function showExamDetail(id){
  const ex=EXAMS.find(e=>e.id===id); if(!ex) return;
  document.getElementById('exam-list').style.display='none';
  const emps=getExamEmps(ex);
  const certEmps=emps.filter(e=>e.cert_examen==='Aplica');
  const apr=certEmps.filter(e=>e.estatus==='Aprobado').length;
  const pct=emps.length?Math.round(emps.filter(e=>e.estatus==='Aprobado').length/emps.length*100):0;
  const emailList=emps.filter(e=>e.email&&e.email!=='No hay numero'&&e.email.includes('@'));
  // Áreas/puestos derivados de empleados realmente asignados (mismo criterio
  // que "Matriz Examen × Área"), en vez del catálogo estático ex.aplica —
  // así ambas vistas leen la misma fuente de verdad.
  const uniqueAreas=[...new Set(emps.map(e=>e.area||'Sin área'))];

  // Group puestos by area (a partir de empleados reales, sin duplicados)
  const byArea={};
  emps.forEach(e=>{
    const a=e.area||'Sin área', p=(e.puesto||'').trim();
    if(!p) return;
    if(!byArea[a]) byArea[a]=new Set();
    byArea[a].add(p);
  });
  Object.keys(byArea).forEach(a=>{ byArea[a]=[...byArea[a]]; });
  const uniquePuestos=new Set(emps.map(e=>(e.puesto||'').trim()).filter(Boolean));

  document.getElementById('exam-detail').innerHTML=`
    <button class="back-btn" onclick="backToExams()">← Volver al catálogo</button>
    <div class="detail">
      <div class="det-hdr">
        <div>
          <div class="det-id">${esc(ex.id)} · ${sBadge(ex.estatus)}</div>
          <div class="det-title">${esc(ex.tema)}</div>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          ${emailList.length?`<button class="btn btn-p btn-sm" onclick="openEmailBlast('${esc(ex.id)}')">✉️ Correo (${emailList.length})</button>`:''}
          ${safeUrl(ex.url)?`<a href="${esc(safeUrl(ex.url))}" target="_blank" rel="noopener noreferrer" class="btn btn-s btn-sm" >🔗 Ir al Examen</a>`:''}
          <div style="display:flex;align-items:center;gap:.4rem;background:var(--bg3);border:1px solid var(--border2);border-radius:7px;padding:.3rem .6rem">
            <span style="font-size:.7rem;color:var(--text3);white-space:nowrap">📅 Próx. validación</span>
            <input type="date" id="val-date-${esc(ex.id)}"
              value="${esc((window._valDates||{})[ex.id]||'')}"
              style="background:transparent;border:none;color:var(--text);font-family:var(--fb);font-size:.78rem;outline:none;cursor:pointer;color-scheme:dark"
              onchange="onValDateChange('${esc(ex.id)}',this.value)">
          </div>
          <button id="auto-email-btn-${esc(ex.id)}"
            onclick="triggerAutoEmail('${esc(ex.id)}')"
            style="display:${((window._valDates||{})[ex.id])?'flex':'none'};align-items:center;gap:.35rem;padding:.3rem .7rem;border-radius:7px;border:1px solid var(--green);background:rgba(34,211,160,.1);color:var(--green);font-family:var(--fb);font-size:.75rem;font-weight:600;cursor:pointer;transition:all .2s"
            title="Enviar recordatorio automático de validación">
            ⚡ Auto-correo activado
          </button>
        </div>
      </div>
      <div class="det-body">
        <div class="det-grid">
          <div class="det-field"><label>Edición</label><div class="val" style="font-size:.8rem;color:var(--text2)">${esc(ex.edicion)||'—'}</div></div>
          <div class="det-field"><label>Áreas Aplica (${uniqueAreas.length})</label><div>${uniqueAreas.map(a=>`<span class="area-tag">${esc(a)}</span>`).join('')}</div></div>
          <div class="det-field"><label>Puestos Aplica</label><div class="val" style="font-weight:700;color:var(--accent);font-size:1.1rem">${uniquePuestos.size} <span style="color:var(--text3);font-size:.75rem;font-weight:400">puestos distintos</span></div></div>
          <div class="det-field"><label>Empleados asignados</label><div class="val">${emps.length} <span style="color:var(--text3);font-size:.75rem">| Aprobados: ${emps.filter(e=>e.estatus==='Aprobado').length} (${pct}%)</span></div>
            <div class="pbar" style="margin-top:.4rem"><div class="pfill" style="width:${pct}%"></div></div>
          </div>
        </div>

        <!-- PUESTOS by AREA -->
        <div style="margin-bottom:1.75rem">
          <div class="sh-title" style="font-size:.95rem;margin-bottom:.9rem">Puestos con <span>Aplica</span></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.75rem">
            ${Object.entries(byArea).map(([area,puestos])=>`
              <div style="background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:.9rem">
                <div style="font-size:.7rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">${esc(area)}</div>
                <div>${puestos.map(p=>`<span class="puesto-tag">${esc(p)}</span>`).join('')}</div>
              </div>`).join('')}
          </div>
        </div>

        <!-- EMPLOYEES TABLE -->
        ${emps.length?`
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
            <div class="sh-title" style="font-size:.95rem">Empleados asignados por puesto <span style="color:var(--text3);font-size:.75rem;font-weight:400">(${emps.length})</span></div>
            ${emailList.length?`<button class="btn btn-p btn-sm" onclick="openEmailBlast('${esc(ex.id)}')">✉️ Correo a todos (${emailList.length})</button>`:''}
          </div>
          <!-- Search + Status filter -->
          <div style="display:flex;gap:.5rem;margin-bottom:.65rem;flex-wrap:wrap">
            <input id="ea-q-${esc(ex.id)}" class="srch" placeholder="🔍 Buscar empleado…" style="flex:1;min-width:140px"
              oninput="renderEmpAssign('${esc(ex.id)}')">
            <select id="ea-st-${esc(ex.id)}" class="flt" style="min-width:130px" onchange="renderEmpAssign('${esc(ex.id)}')">
              <option value="">Todos los estatus</option>
              <option value="Aprobado">✅ Aprobado</option>
              <option value="Pendiente">⏳ Pendiente</option>
              <option value="Inactivo">🚫 Inactivo</option>
            </select>
          </div>
          <div class="tbl-wrap">
            <table>
              <thead><tr><th>Empleado</th><th>Puesto</th><th>Área</th><th>Cert. Examen</th><th>Estatus</th></tr></thead>
              <tbody id="ea-tbody-${esc(ex.id)}"></tbody>
            </table>
          </div>
          <div id="ea-pager-${esc(ex.id)}" class="pager" style="margin-top:.5rem"></div>
        </div>`:`<div class="empty"><div class="empty-icon">👤</div><div>No hay empleados con puestos que apliquen para este examen</div></div>`}
      </div>
    </div>`;
}


// ── EXAM ASSIGN EMPLOYEE TABLE — paginated + filterable ─────────────────
const _eaPages = {};
const EA_PS    = 25;

function renderEmpAssign(examId){
  const ex  = EXAMS.find(e => e.id === examId); if(!ex) return;
  const empMap = Object.fromEntries(EMPLOYEES.map(e=>[e.id,e]));
  const allEmps = getExamEmps(ex);

  const q  = (document.getElementById('ea-q-'+examId)||{}).value||'';
  const st = (document.getElementById('ea-st-'+examId)||{}).value||'';

  const filtered = allEmps.filter(emp => {
    const matchQ  = !q  || emp.nombre.toLowerCase().includes(q.toLowerCase())
                        || (emp.numero||'').includes(q)
                        || emp.puesto.toLowerCase().includes(q.toLowerCase());
    const matchSt = !st || emp.estatus === st;
    return matchQ && matchSt;
  });

  const page  = _eaPages[examId] || 1;
  const start = (page-1)*EA_PS;
  const slice = filtered.slice(start, start+EA_PS);

  const tbody = document.getElementById('ea-tbody-'+examId);
  if(!tbody) return;

  batchRender(tbody, slice, emp => `
    <tr data-id="${esc(emp.id)}" onclick="openEmpModal('${esc(emp.id)}')" style="cursor:pointer">
      <td><strong class="fs83">${esc(fmtName(emp.nombre))}</strong><br><span class="dim-text">#${esc(emp.numero)}</span></td>
      <td><span class="puesto-tag" style="font-size:.68rem">${esc(emp.puesto)}</span></td>
      <td><span class="area-tag">${esc(emp.area)}</span></td>
      <td><span class="badge ${emp.cert_examen==='Aplica'?'b-g':'b-x'}">${esc(emp.cert_examen)||'—'}</span></td>
      <td>${sBadge(emp.estatus)}</td>
    </tr>`,
    `<tr><td colspan="5"><div class="empty"><div class="empty-icon">🔍</div><div>Sin resultados</div></div></td></tr>`
  );

  renderPager('ea-pager-'+examId, filtered.length, EA_PS, page,
    p => { _eaPages[examId]=p; renderEmpAssign(examId); }
  );
}
function backToExams(){
  document.getElementById('exam-list').style.display='';
  document.getElementById('exam-detail').innerHTML='';
}

// ── CASCADE: emp area changed → restrict emp puesto dropdown ─────────────
function onEmpAreaChange(){
  const area = document.getElementById('emp-area').value;
  const ep   = document.getElementById('emp-puesto');
  const prev = ep.value;

  ep.innerHTML = '<option value="">Todos los puestos</option>';
  const puestos = area
    ? [...(_areaToEmpPuestos[area]||[])].sort()
    : [...new Set(EMPLOYEES.map(e=>e.puesto).filter(p=>p))].sort();

  puestos.forEach(p => {
    const o=document.createElement('option');
    o.value=p; o.textContent=p;
    if(p===prev) o.selected=true;
    ep.appendChild(o);
  });
  if(area && prev && !(_areaToEmpPuestos[area]||new Set()).has(prev))
    ep.value='';

  filterEmps();
}

// ── CASCADE: emp puesto changed → restrict emp area dropdown ─────────────
function onEmpPuestoChange(){
  const puesto = document.getElementById('emp-puesto').value;
  const ea     = document.getElementById('emp-area');
  const prev   = ea.value;

  ea.innerHTML = '<option value="">Todas las áreas</option>';
  const areas = puesto
    ? [...(_puestoToEmpAreas[puesto]||[])].sort()
    : [...new Set(EMPLOYEES.map(e=>e.area).filter(a=>a))].sort();

  areas.forEach(a => {
    const o=document.createElement('option');
    o.value=a; o.textContent=a;
    if(a===prev) o.selected=true;
    ea.appendChild(o);
  });
  if(puesto && prev && !(_puestoToEmpAreas[puesto]||new Set()).has(prev))
    ea.value='';

  filterEmps();
}
function filterEmps(){
  const q=document.getElementById('emp-q').value.toLowerCase();
  const area=document.getElementById('emp-area').value;
  const puesto=document.getElementById('emp-puesto').value;
  const status=document.getElementById('emp-status').value;
  const cert=document.getElementById('emp-cert').value; // "Aplica" | "NA" | ""
  filtEmps=EMPLOYEES.filter(e=>{
    const mQ=!q||e.nombre.toLowerCase().includes(q)||e.puesto.toLowerCase().includes(q)||e.numero.includes(q)||e.area.toLowerCase().includes(q);
    const mA=!area||e.area===area;
    const mP=!puesto||e.puesto===puesto;
    const mS=!status||(status==='__INACTIVOS__'?(e.estatus!=='Aprobado'&&e.estatus!=='Pendiente'):e.estatus===status);
    // Knowledge Certification: cert_examen === 'Aplica' vs empty/not-Aplica
    const mC=!cert||(cert==='Aplica'?e.cert_examen==='Aplica':e.cert_examen!=='Aplica');
    return mQ&&mA&&mP&&mS&&mC;
  });
  empPage=1;
  updateEmpEmailBar(area, puesto);
  renderEmps();
}

function updateEmpEmailBar(area, puesto){
  const bar=document.getElementById('emp-email-bar');
  const lbl=document.getElementById('emp-email-bar-label');
  const sub=document.getElementById('emp-email-bar-sub');
  const hasFilter=area||puesto;
  if(!hasFilter){ bar.style.display='none'; return; }

  // Exams that contain at least one of the currently filtered employees
  const filtEmpIds=new Set(filtEmps.map(e=>e.id));
  const matchedExams=EXAMS.filter(ex=>(getExamEmps(ex)).some(e=>filtEmpIds.has(e.id)));

  // Employees with valid email from the filtered list
  const withEmail=filtEmps.filter(e=>e.email&&e.email!=='No hay numero'&&e.email.includes('@'));

  const filterDesc=puesto&&area?`Área: ${area} · Puesto: ${puesto}`:puesto?`Puesto: ${puesto}`:area?`Área: ${area}`:'';
  lbl.textContent=`${withEmail.length} empleados con correo válido — ${filterDesc}`;
  sub.textContent=`${matchedExams.length} examen(es) aplican · ${filtEmps.length} empleados en total`;
  bar.style.display='flex';
}

function renderEmps(){
  const mode=document.getElementById('emp-mode').value;
  const start=(empPage-1)*EMP_PS;
  const page=filtEmps.slice(start,start+EMP_PS);
  const cont=document.getElementById('emp-container');
  if(!page.length){
    cont.innerHTML=`<div class="empty"><div class="empty-icon">👤</div><div>No se encontraron empleados</div></div>`;
    document.getElementById('emp-pager').innerHTML=''; return;
  }
  if(mode==='grid'){
    cont.innerHTML=`<div class="emp-grid">${page.map(e=>empCard(e)).join('')}</div>`;
  } else {
    cont.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>#</th><th>Nombre</th><th>Puesto</th><th>Área</th><th>SKILL ASSESSMENT</th><th>Knowledge Certification</th><th>Estatus</th></tr></thead>
      <tbody>
      ${page.map(e=>{
        const examsCubiertos=(e.exam_ids||[]).length;
        const totalExams=EXAMS.length;
        const covPct=totalExams?Math.round(examsCubiertos/totalExams*100):0;
        return `<tr onclick="openEmpModal('${esc(e.id)}')">
          <td style="font-size:.72rem;color:var(--text3)">${esc(e.numero)}</td>
          <td><div style="font-weight:500;font-size:.83rem">${esc(fmtName(e.nombre))}</div><div style="font-size:.68rem;color:var(--text3)">${e.email&&e.email!=='No hay numero'?esc(e.email):'sin email'}</div></td>
          <td><span class="puesto-tag" style="font-size:.66rem">${esc(e.puesto)}</span></td>
          <td><span class="area-tag">${esc(e.area)}</span></td>
          <td><span class="badge ${e.cert_cofc==='Aplica'?'b-g':'b-x'}">${esc(e.cert_cofc)||'—'}</span></td>
          <td><span class="badge ${e.cert_examen==='Aplica'?'b-g':'b-x'}">${esc(e.cert_examen)||'—'}</span></td>
          <td>${sBadge(e.estatus)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`;
  }
  renderPager('emp-pager',filtEmps.length,EMP_PS,empPage,p=>{empPage=p;renderEmps();});
}

function empCard(e){
  const init=fmtName(e.nombre).split(' ').slice(0,2).map(n=>n[0]).join('');
  const colors=['#ff6b35','#22d3a0','#f5c518','#6366f1','#ec4899','#14b8a6'];
  const col=colors[e.nombre.charCodeAt(0)%colors.length];
  return `<div class="emp-card ${e.estatus.toLowerCase()}" onclick="openEmpModal('${esc(e.id)}')">
    <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.5rem">
      <div class="emp-avatar" style="background:${col}22;color:${col};border:1px solid ${col}44">${esc(init)}</div>
      <div><div class="emp-name">${esc(fmtName(e.nombre))}</div><div class="emp-role">${esc(e.puesto)}</div></div>
    </div>
    <div class="emp-meta">
      <span class="area-tag">${esc(e.area)}</span>
      ${sBadge(e.estatus)}
      <span class="badge ${e.cert_examen==='Aplica'?'b-g':'b-x'}" style="font-size:.63rem">${esc(e.cert_examen)||'—'}</span>
      <span style="font-size:.7rem;color:var(--text3);margin-left:auto">#${esc(e.numero)}</span>
    </div>
  </div>`;
}

function openEmpModal(id){
  const e=EMPLOYEES.find(x=>x.id===id); if(!e) return;
  window._empModalId = id;  // para el botón Editar
  // Exams this employee must take
  const myExams=getEmpExams(e);
  document.getElementById('em2-name').textContent=fmtName(e.nombre);
  document.getElementById('em2-body').innerHTML=`
    <div class="m-sec"><label>ID de Registro</label><div class="val" style="color:var(--accent)">${esc(e.id)}</div></div>
    <div class="m-grid">
      <div class="m-sec"><label>Número</label><div class="val">${esc(e.numero)}</div></div>
      <div class="m-sec"><label>Horario</label><div class="val" style="font-size:.82rem">${esc(e.horario)||'—'}</div></div>
    </div>
    <div class="m-div"></div>
    <div class="m-sec"><label>Puesto</label><div><span class="puesto-tag">${esc(e.puesto)}</span></div></div>
    <div class="m-grid">
      <div class="m-sec"><label>Área</label><div><span class="area-tag" style="font-size:.78rem">${esc(e.area)}</span></div></div>
      <div class="m-sec"><label>Supervisor</label><div class="val" style="font-size:.82rem">${esc(e.supervisor)||'—'}</div></div>
    </div>
    <div class="m-sec"><label>Email</label><div class="val" style="font-size:.82rem;color:var(--text2)">${e.email&&e.email!=='No hay numero'?`<a href="https://outlook.office365.us/mail/deeplink/compose?to=${encodeURIComponent(e.email)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">${esc(e.email)}</a>`:'—'}</div></div>
    <div class="m-div"></div>
    <div class="m-grid">
      <div class="m-sec"><label>Cert. con CofC</label><div class="val">${e.cert_cofc==='Aplica'?'✅ Aplica':esc(e.cert_cofc)||'—'}</div></div>
      <div class="m-sec"><label>Cert. con Examen</label><div class="val"><span class="badge ${e.cert_examen==='Aplica'?'b-g':'b-x'}">${esc(e.cert_examen)||'—'}</span></div></div>
    </div>
    <div class="m-grid">
      <div class="m-sec">
        <label>Examenes aplicables</label>
        ${(()=>{
          const ec=(e.exam_ids||[]).length;
          const tot=EXAMS.length;
          const pct=tot?Math.round(ec/tot*100):0;
          const col=ec>0?'var(--accent)':'var(--text3)';
          return `<div style="display:flex;align-items:baseline;gap:.4rem;margin-bottom:.4rem">
            <span style="font-size:1.4rem;font-weight:800;font-family:var(--fh);color:${col}">${ec}</span>
            <span style="font-size:.78rem;color:var(--text3)">de ${tot} exámenes (${pct}%)</span>
          </div>
          <div class="pbar"><div class="pfill" style="width:${pct}%;background:${col}"></div></div>`;
        })()}
      </div>
      <div class="m-sec">
        <label>Estatus</label>
        <select class="status-sel" id="ms-${esc(e.id)}" onchange="updateStatus('${esc(e.id)}',this.value)">
          <option value="Pendiente" ${e.estatus==='Pendiente'?'selected':''}>⏳ Pendiente</option>
          <option value="Aprobado"  ${e.estatus==='Aprobado'?'selected':''}>✓ Aprobado</option>
          <option value="Inactivo"  ${e.estatus==='Inactivo'?'selected':''}>✕ Inactivo</option>
          <option value="En Proceso" ${e.estatus==='En Proceso'?'selected':''}>🔄 En Proceso</option>
          <option value="Suspendido" ${e.estatus==='Suspendido'?'selected':''}>⚠️ Suspendido</option>
        </select>
        <button onclick="openBajaConfirm('${esc(e.id)}')"
          style="margin-top:.55rem;width:100%;padding:.42rem;border-radius:7px;
                 border:1.5px solid var(--red);background:rgba(198,40,40,.07);
                 color:var(--red);font-family:var(--fb);font-size:.76rem;font-weight:700;
                 cursor:pointer;transition:all .15s;display:flex;align-items:center;
                 justify-content:center;gap:.35rem"
          onmouseenter="this.style.background='rgba(198,40,40,.15)'"
          onmouseleave="this.style.background='rgba(198,40,40,.07)'">
          ✕ Dar de Baja
        </button>
        ${e.estatus==='Aprobado'?`
        <button onclick="generateCertificate('${esc(e.id)}')"
          style="margin-top:.45rem;width:100%;padding:.5rem;border-radius:7px;
                 border:1.5px solid var(--green);background:rgba(46,125,50,.09);
                 color:var(--green);font-family:var(--fb);font-size:.76rem;font-weight:700;
                 cursor:pointer;transition:all .15s;display:flex;align-items:center;
                 justify-content:center;gap:.35rem"
          onmouseenter="this.style.background='rgba(46,125,50,.2)'"
          onmouseleave="this.style.background='rgba(46,125,50,.09)'">
          🏅 Generar Certificado PDF
        </button>`:''}

      </div>
    </div>
    <div class="m-div"></div>
    <div class="m-sec">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.35rem">
        <label>Exámenes asignados por puesto (${myExams.length})</label>
        <span id="ep-lbl-${esc(e.id)}" style="font-size:.68rem;color:var(--text3)">${(()=>{const ch=_getChecks(e.id);return myExams.filter(ex=>ch[ex.id]).length+' / '+myExams.length+' completados';})()}</span>
      </div>
      <div class="exam-progress-bar">
        <div class="exam-progress-fill" id="ep-fill-${esc(e.id)}" style="width:${(()=>{const ch=_getChecks(e.id);const d=myExams.filter(ex=>ch[ex.id]).length;return myExams.length?Math.round(d/myExams.length*100):0;})()}%"></div>
      </div>
      <div style="max-height:220px;overflow-y:auto;margin-top:.5rem">
        ${myExams.length?myExams.map(ex=>{
          const isChecked=(_getChecks(e.id)||{})[ex.id]||false;
          return `
          <div style="display:flex;align-items:center;padding:.4rem 0;border-bottom:1px solid var(--border);gap:.5rem">
            <button class="exam-check-btn ${isChecked?'checked':''}"
              onclick="toggleExamCheck('${esc(e.id)}','${esc(ex.id)}',this)"
              title="${isChecked?'Desmarcar':'Marcar como completado'}">${isChecked?'✓':''}</button>
            <div style="flex:1;min-width:0">
              <div style="font-size:.77rem;font-weight:500;line-height:1.35">${esc(ex.tema)}</div>
              <div style="font-size:.65rem;color:var(--text3)">${esc(ex.id)}</div>
            </div>
            ${safeUrl(ex.url)?`<a href="${esc(safeUrl(ex.url))}" target="_blank" rel="noopener noreferrer" class="btn btn-p btn-sm" style="font-size:.65rem;padding:.18rem .4rem;flex-shrink:0">Ir →</a>`:''}
          </div>`;}).join(''):`<div style="color:var(--text3);font-size:.82rem;padding:.5rem 0">No hay exámenes asignados para este puesto.</div>`}
      </div>
    </div>
  `;
  document.getElementById('emp-modal').classList.add('open');
}

// ════════════════════════════════════════════════════════════════
// CERTIFICADO DE APROBACIÓN PDF
// ════════════════════════════════════════════════════════════════
function generateCertificate(id){
  const e = EMPLOYEES.find(x=>x.id===id);
  if(!e || e.estatus !== 'Aprobado') return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'letter' });

  const W  = doc.internal.pageSize.getWidth();   // 279.4
  const H  = doc.internal.pageSize.getHeight();  // 215.9

  // ─── Paleta ────────────────────────────────────────────────────
  const NAVY   = [27, 79, 138];
  const GREEN  = [46, 125, 50];
  const LGOLD  = [212, 175, 55];
  const BGPAGE = [240, 244, 252];
  const WHITE  = [255, 255, 255];

  const today     = new Date().toLocaleDateString('es-MX',{year:'numeric',month:'long',day:'numeric'});
  const nombre    = e.nombre.replace(/,\s*/,' ').trim();
  const examCount = [...new Set(e.exam_ids||[])].length;

  // ════════════════════════════════════════════════════════════════
  // FONDO
  // ════════════════════════════════════════════════════════════════
  doc.setFillColor(...BGPAGE);
  doc.rect(0, 0, W, H, 'F');

  // ════════════════════════════════════════════════════════════════
  // HEADER AZUL
  // ════════════════════════════════════════════════════════════════
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 28, 'F');

  // Línea dorada bajo el header
  doc.setFillColor(...LGOLD);
  doc.rect(0, 28, W, 1.2, 'F');

  // ── Logotipo NMC ──
  doc.setTextColor(...WHITE);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('NMC', 15, 17);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema de Entrenamiento', 15, 24);

  // ── Folio y fecha (derecha del header) ──
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Folio: ${e.id}`, W - 15, 14.5, {align:'right'});
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.text(`Fecha de emision: ${today}`, W - 15, 22, {align:'right'});

  // ════════════════════════════════════════════════════════════════
  // FRANJA VERDE INFERIOR
  // ════════════════════════════════════════════════════════════════
  doc.setFillColor(...GREEN);
  doc.rect(0, H - 14, W, 14, 'F');

  // Línea dorada sobre el verde
  doc.setFillColor(...LGOLD);
  doc.rect(0, H - 14, W, 0.9, 'F');

  // ════════════════════════════════════════════════════════════════
  // MARCO PRINCIPAL (entre header y pie)
  // ════════════════════════════════════════════════════════════════
  const MX = 10, MY = 31.5, MW = W - 20, MH = H - 31.5 - 14;
  // Relleno blanco del marco
  doc.setFillColor(...WHITE);
  doc.rect(MX, MY, MW, MH, 'F');

  // Borde exterior azul
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.6);
  doc.rect(MX, MY, MW, MH, 'S');

  // Borde interior dorado
  doc.setDrawColor(...LGOLD);
  doc.setLineWidth(0.5);
  doc.rect(MX + 3, MY + 3, MW - 6, MH - 6, 'S');

  // ─── Adornos de esquina (cruces pequeñas en las 4 esquinas del borde dorado) ───
  const corners = [
    [MX+3,        MY+3],
    [MX+MW-3,     MY+3],
    [MX+3,        MY+MH-3],
    [MX+MW-3,     MY+MH-3]
  ];
  doc.setDrawColor(...LGOLD);
  doc.setLineWidth(0.8);
  corners.forEach(([cx,cy])=>{
    const s=4;
    doc.line(cx-s, cy, cx+s, cy);
    doc.line(cx, cy-s, cx, cy+s);
  });

  // ── Línea decorativa central bajo título (doble) ──────────────
  const tlY = MY + 26; // posición donde irá la línea bajo título
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(1.8);
  doc.line(MX + 30, tlY, MX + MW - 30, tlY);
  doc.setDrawColor(...LGOLD);
  doc.setLineWidth(0.45);
  doc.line(MX + 30, tlY + 2, MX + MW - 30, tlY + 2);

  // ════════════════════════════════════════════════════════════════
  // CONTENIDO
  // ════════════════════════════════════════════════════════════════

  // ── Título ────────────────────────────────────────────────────
  doc.setTextColor(...NAVY);
  doc.setFontSize(23);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICADO DE APROBACION', W/2, MY + 20, {align:'center'});

  // ── "Otorgado a" ──────────────────────────────────────────────
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'italic');
  doc.text('La organizacion NMC - Kirkhill certifica que el colaborador:', W/2, MY + 37, {align:'center'});

  // ── Nombre del empleado ───────────────────────────────────────
  doc.setTextColor(...NAVY);
  doc.setFontSize(21);
  doc.setFont('helvetica', 'bold');
  doc.text(nombre, W/2, MY + 52, {align:'center'});

  // Subrayado dorado bajo el nombre
  const nmW = doc.getTextWidth(nombre);
  const nmX = W/2 - nmW/2;
  doc.setDrawColor(...LGOLD);
  doc.setLineWidth(0.7);
  doc.line(nmX, MY + 54.5, nmX + nmW, MY + 54.5);

  // ── Datos en dos columnas centradas ──────────────────────────
  const dataY = MY + 65;
  const lCol  = W/2 - 55;
  const rCol  = W/2 + 15;

  // Columna izquierda — etiquetas
  doc.setTextColor(90, 90, 90);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('No. Empleado:', lCol, dataY);
  doc.text('Puesto:', lCol, dataY + 8);
  doc.text('Area:', lCol, dataY + 16);
  doc.text('Supervisor:', lCol, dataY + 24);

  // Columna derecha — valores
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  doc.text(e.numero,          rCol, dataY);
  doc.text(e.puesto,          rCol, dataY + 8);
  doc.text(e.area,            rCol, dataY + 16);
  doc.text(e.supervisor||'—', rCol, dataY + 24);

  // Separador fino horizontal
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MX + 20, dataY + 30, MX + MW - 20, dataY + 30);

  // ── Párrafo descriptivo ───────────────────────────────────────
  doc.setTextColor(55, 55, 55);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'italic');
  const pY = dataY + 40;
  doc.text('Ha completado satisfactoriamente el programa de entrenamiento establecido por la organizacion,', W/2, pY,     {align:'center'});
  doc.text(`habiendo aprobado los ${examCount} examenes correspondientes a su puesto y area de trabajo.`,   W/2, pY + 7, {align:'center'});

  // ── Sello (medallón lateral derecho) ─────────────────────────
  const sx = MX + MW - 32, sy = MY + MH - 52, sr = 18;

  // Anillos exteriores
  doc.setDrawColor(...LGOLD);
  doc.setLineWidth(0.5);
  doc.circle(sx, sy, sr + 3,   'S');
  doc.circle(sx, sy, sr + 1.5, 'S');

  // Relleno del sello
  doc.setFillColor(...NAVY);
  doc.circle(sx, sy, sr, 'F');

  // "NMC" dentro del sello
  doc.setTextColor(...WHITE);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('NMC', sx, sy - 3, {align:'center'});

  // Línea divisoria dentro del sello
  doc.setDrawColor(...LGOLD);
  doc.setLineWidth(0.5);
  doc.line(sx - 10, sy + 0.5, sx + 10, sy + 0.5);

  // "APR." dentro del sello
  doc.setTextColor(...LGOLD);
  doc.setFontSize(7);
  doc.text('APROBADO', sx, sy + 6, {align:'center'});

  // ── Firmas — dos columnas DENTRO del marco ─────────────────────
  const fY   = MY + MH - 22;
  const fc1  = MX + MW * 0.25;
  const fc2  = MX + MW * 0.58;
  const flW  = 42;

  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.45);
  doc.line(fc1 - flW/2, fY, fc1 + flW/2, fY);
  doc.line(fc2 - flW/2, fY, fc2 + flW/2, fY);

  doc.setTextColor(50, 50, 50);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Supervisor / Responsable de Area', fc1, fY + 5, {align:'center'});
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(e.supervisor||'—', fc1, fY + 10, {align:'center'});

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);
  doc.text('Responsable de Entrenamiento', fc2, fY + 5, {align:'center'});
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Recursos Humanos — NMC', fc2, fY + 10, {align:'center'});

  // ════════════════════════════════════════════════════════════════
  // PIE — sobre fondo verde
  // ════════════════════════════════════════════════════════════════
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Documento generado el ${today}   |   Sistema de Entrenamiento NMC   |   Folio: ${e.id}`,
    W/2, H - 5.5, {align:'center'}
  );

  // ════════════════════════════════════════════════════════════════
  // PÁGINA(S) — LISTA DE EXÁMENES
  // ════════════════════════════════════════════════════════════════
  const myExams  = getEmpExams(e);
  const checks   = _getChecks(e.id) || {};
  // Mostrar todos los asignados; marcar cuáles fueron completados
  const examRows = myExams.map(ex => ({
    id   : ex.id,
    tema : ex.tema,
    done : !!checks[ex.id]
  }));

  // ── Helpers de cabecera/pie reutilizables ─────────────────────
  function drawPageShell(docRef, pageNum, totalPages){
    const pw = docRef.internal.pageSize.getWidth();
    const ph = docRef.internal.pageSize.getHeight();

    // Header
    docRef.setFillColor(...NAVY);
    docRef.rect(0, 0, pw, 22, 'F');
    docRef.setFillColor(...LGOLD);
    docRef.rect(0, 22, pw, 0.9, 'F');

    docRef.setTextColor(...WHITE);
    docRef.setFontSize(14);
    docRef.setFont('helvetica', 'bold');
    docRef.text('NMC', 13, 13);
    docRef.setFontSize(7);
    docRef.setFont('helvetica', 'normal');
    docRef.text('Sistema de Entrenamiento', 13, 19.5);

    docRef.setFontSize(7.5);
    docRef.setFont('helvetica', 'bold');
    docRef.text(`Folio: ${e.id}`, pw - 13, 10, {align:'right'});
    docRef.setFont('helvetica', 'normal');
    docRef.setFontSize(7);
    docRef.text(`Pagina ${pageNum} de ${totalPages}`, pw - 13, 17, {align:'right'});

    // Footer verde
    docRef.setFillColor(...GREEN);
    docRef.rect(0, ph - 10, pw, 10, 'F');
    docRef.setFillColor(...LGOLD);
    docRef.rect(0, ph - 10, pw, 0.7, 'F');

    docRef.setTextColor(...WHITE);
    docRef.setFontSize(6.5);
    docRef.setFont('helvetica', 'normal');
    docRef.text(
      `Documento generado el ${today}   |   Sistema de Entrenamiento NMC   |   Folio: ${e.id}`,
      pw/2, ph - 3.5, {align:'center'}
    );
  }

  // ── Calcular paginación ───────────────────────────────────────
  const ROW_H     = 7.2;
  const TABLE_TOP = 50;   // Y donde empieza la tabla en cada página
  const TABLE_BOT = H - 16; // Y máximo antes del pie
  const ROWS_PG   = Math.floor((TABLE_BOT - TABLE_TOP) / ROW_H); // filas por página
  const totalExamPages = Math.ceil(examRows.length / ROWS_PG) || 1;
  const TOTAL_PAGES    = 1 + totalExamPages; // certificado + páginas de exámenes

  // Columnas de la tabla
  const C_NUM  = 10;   // ancho col #
  const C_ID   = 22;   // ancho col ID
  const C_TEMA = 195;  // ancho col Tema
  const C_EST  = 28;   // ancho col Estado
  const TBL_X  = 13;
  const TBL_W  = C_NUM + C_ID + C_TEMA + C_EST;

  let examIdx = 0;
  for(let pg = 0; pg < totalExamPages; pg++){
    doc.addPage('letter', 'landscape');
    const pageNum = pg + 2; // página 1 = certificado
    drawPageShell(doc, pageNum, TOTAL_PAGES);

    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();

    // ── Subtítulo de la página ──────────────────────────────────
    doc.setFillColor(237, 242, 249);
    doc.rect(0, 23, pw, ph - 33, 'F');

    doc.setTextColor(...NAVY);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('ANEXO — LISTA DE EXAMENES APROBADOS', pw/2, 33, {align:'center'});

    doc.setDrawColor(...GREEN);
    doc.setLineWidth(1.2);
    doc.line(pw/2 - 70, 36, pw/2 + 70, 36);
    doc.setDrawColor(...LGOLD);
    doc.setLineWidth(0.35);
    doc.line(pw/2 - 70, 37.5, pw/2 + 70, 37.5);

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(`${nombre}   |   ${e.puesto}   |   ${e.area}`, pw/2, 44, {align:'center'});

    // ── Encabezado de tabla ─────────────────────────────────────
    const thY = TABLE_TOP - 1;
    doc.setFillColor(...NAVY);
    doc.rect(TBL_X, thY, TBL_W, 7, 'F');

    doc.setTextColor(...WHITE);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    let cx = TBL_X + 2;
    doc.text('#',      cx,               thY + 5);   cx += C_NUM;
    doc.text('ID',     cx,               thY + 5);   cx += C_ID;
    doc.text('Nombre del Examen', cx,    thY + 5);   cx += C_TEMA;
    doc.text('Estado', cx,               thY + 5);

    // ── Filas de exámenes ───────────────────────────────────────
    const rowsThisPage = Math.min(ROWS_PG, examRows.length - examIdx);
    for(let r = 0; r < rowsThisPage; r++, examIdx++){
      const row  = examRows[examIdx];
      const rY   = TABLE_TOP + r * ROW_H;
      const even = r % 2 === 0;

      // Fondo alternado
      doc.setFillColor(even ? 255:248, even ? 255:250, even ? 255:255);
      doc.rect(TBL_X, rY, TBL_W, ROW_H, 'F');

      // Línea separadora
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.25);
      doc.line(TBL_X, rY + ROW_H, TBL_X + TBL_W, rY + ROW_H);

      const textY = rY + ROW_H - 2.2;
      cx = TBL_X + 2;

      // # fila
      doc.setTextColor(130, 130, 130);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(String(examIdx + 1), cx, textY);          cx += C_NUM;

      // ID del examen
      doc.setTextColor(...NAVY);
      doc.setFont('helvetica', 'bold');
      doc.text(row.id, cx, textY);                       cx += C_ID;

      // Tema — truncar si es muy largo
      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const maxTema = C_TEMA - 4;
      let tema = row.tema;
      while(tema.length > 10 && doc.getTextWidth(tema) > maxTema){
        tema = tema.slice(0, -4) + '...';
      }
      doc.text(tema, cx, textY);                         cx += C_TEMA;

      // Estado — badge coloreado
      const badgeColor = row.done ? GREEN : [180, 120, 0];
      doc.setFillColor(...badgeColor);
      doc.roundedRect(cx, rY + 1.8, C_EST - 4, ROW_H - 3.5, 1, 1, 'F');
      doc.setTextColor(...WHITE);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.text(row.done ? 'Completado' : 'Pendiente', cx + (C_EST - 4)/2, rY + ROW_H - 2.2, {align:'center'});
    }

    // Borde exterior de la tabla
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.7);
    doc.rect(TBL_X, thY, TBL_W, 7 + rowsThisPage * ROW_H, 'S');

    // Líneas verticales de columna
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.25);
    let vx = TBL_X + C_NUM;
    [C_ID, C_TEMA].forEach(cw => {
      doc.line(vx, thY, vx, thY + 7 + rowsThisPage * ROW_H);
      vx += cw;
    });

    // Resumen al pie de la última página de exámenes
    if(pg === totalExamPages - 1){
      const done  = examRows.filter(r => r.done).length;
      const sumY  = thY + 7 + rowsThisPage * ROW_H + 6;
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total de examenes asignados: ${examRows.length}   |   Completados: ${done}   |   Pendientes: ${examRows.length - done}`,
        TBL_X + TBL_W/2 + TBL_X/2, sumY, {align:'center'});
    }
  }

  // ── Actualizar total de páginas en página 1 (no es posible retroactivo en jsPDF básico,
  //    pero sí podemos anotar el folio en el pie que ya tiene el texto correcto) ──

  // ════════════════════════════════════════════════════════════════
  // GUARDAR
  // ════════════════════════════════════════════════════════════════
  const safeName = nombre.replace(/[^a-zA-Z0-9\s]/g,'').replace(/\s+/g,'_').substring(0,40);
  doc.save(`Certificado_${safeName}_${e.id}.pdf`);
}

// ════════════════════════════════════════════════════════════════
// EDICIÓN DE REGISTROS DE PERSONAL
// ════════════════════════════════════════════════════════════════
function openEmpEdit(id){
  const e = EMPLOYEES.find(x=>x.id===id); if(!e) return;
  window._empModalId = id;

  // Badge
  const badge = document.getElementById('em2-badge');
  if(badge) badge.textContent = e._manual ? '✏️ Alta manual' : '📋 Registro Excel';

  // Áreas y puestos disponibles — unión de empleados reales + catálogo (gestión)
  const _catAreas = (typeof catalogAreas === 'function') ? catalogAreas() : [];
  const empAreas   = [...new Set([...EMPLOYEES.map(x=>x.area).filter(Boolean), ..._catAreas])].sort();
  const empPuestos = (area) => {
    const catP = (typeof catalogPuestosForArea === 'function') ? catalogPuestosForArea(area) : [];
    const empP = EMPLOYEES.filter(x=>x.area===area).map(x=>x.puesto).filter(Boolean);
    return [...new Set([...empP, ...catP])].sort();
  };

  const areaOpts = empAreas.map(a=>
    `<option value="${esc(a)}" ${e.area===a?'selected':''}>${esc(a)}</option>`).join('');

  const puestoOptsFor = (area, curPuesto) =>
    empPuestos(area).map(p=>
      `<option value="${esc(p)}" ${curPuesto===p?'selected':''}>${esc(p)}</option>`).join('');

  const inp = (id,val,type='text',placeholder='') =>
    `<input id="ee-${id}" type="${type}" value="${esc((val||'').toString())}"
      placeholder="${esc(placeholder)}"
      style="width:100%;padding:.48rem .75rem;border-radius:7px;border:1.5px solid var(--border2);
             background:var(--card);color:var(--text);font-family:var(--fb);font-size:.84rem;outline:none"
      onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border2)'">`;

  const sel = (id,opts,style='') =>
    `<select id="ee-${id}"
      style="width:100%;padding:.48rem .75rem;border-radius:7px;border:1.5px solid var(--border2);
             background:var(--card);color:var(--text);font-family:var(--fb);font-size:.84rem;
             outline:none;cursor:pointer${style?';'+style:''}"
      onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border2)'">${opts}</select>`;

  document.getElementById('em2-name').textContent = e.nombre;
  document.getElementById('em2-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:.85rem">

      <!-- Nombre -->
      <div class="m-sec" style="margin:0">
        <label for="ee-nombre">Nombre Completo</label>
        ${inp('nombre', e.nombre, 'text', 'APELLIDO NOMBRE')}
      </div>

      <!-- Área + Puesto -->
      <div class="m-grid" style="gap:.75rem">
        <div class="m-sec" style="margin:0">
          <label for="ee-area">Área</label>
          ${sel('area', areaOpts)}
        </div>
        <div class="m-sec" style="margin:0">
          <label for="ee-puesto">Puesto <span style="font-size:.65rem;color:var(--text3)">(actualiza exámenes)</span></label>
          <select id="ee-puesto"
            style="width:100%;padding:.48rem .75rem;border-radius:7px;border:1.5px solid var(--border2);
                   background:var(--card);color:var(--text);font-family:var(--fb);font-size:.84rem;
                   outline:none;cursor:pointer">
            ${puestoOptsFor(e.area, e.puesto)}
          </select>
        </div>
      </div>

      <!-- Email + Número -->
      <div class="m-grid" style="gap:.75rem">
        <div class="m-sec" style="margin:0"><label for="ee-email">Email</label>${inp('email', e.email!=='No hay numero'?e.email:'', 'email')}</div>
        <div class="m-sec" style="margin:0"><label for="ee-numero">Número de Empleado</label>${inp('numero', e.numero)}</div>
      </div>

      <!-- Supervisor + Ingreso -->
      <div class="m-grid" style="gap:.75rem">
        <div class="m-sec" style="margin:0"><label for="ee-supervisor">Supervisor</label>${inp('supervisor', e.supervisor)}</div>
        <div class="m-sec" style="margin:0"><label for="ee-ingreso">Fecha de Ingreso</label>${inp('ingreso', (e.ingreso||'').slice(0,10), 'date')}</div>
      </div>

      <!-- Horario + Estatus -->
      <div class="m-grid" style="gap:.75rem">
        <div class="m-sec" style="margin:0"><label for="ee-horario">Horario</label>${inp('horario', e.horario)}</div>
        <div class="m-sec" style="margin:0">
          <label for="ee-estatus">Estatus</label>
          ${sel('estatus',
            ['Pendiente','Aprobado','Inactivo','En Proceso','Suspendido'].map(s=>
              `<option value="${s}" ${e.estatus===s?'selected':''}>${s}</option>`).join(''))}
        </div>
      </div>

      <!-- Certs -->
      <div class="m-grid" style="gap:.75rem">
        <div class="m-sec" style="margin:0">
          <label for="ee-cert-cofc">Cert. CofC (SKILL ASSESSMENT)</label>
          ${sel('cert-cofc',['<option value="">— N/A</option>',
            `<option value="Aplica" ${e.cert_cofc==='Aplica'?'selected':''}>✅ Aplica</option>`].join(''))}
        </div>
        <div class="m-sec" style="margin:0">
          <label for="ee-cert-examen">Knowledge Certification</label>
          ${sel('cert-examen',['<option value="">— N/A</option>',
            `<option value="Aplica" ${e.cert_examen==='Aplica'?'selected':''}>✅ Aplica</option>`].join(''))}
        </div>
      </div>

      <!-- Preview exámenes según puesto -->
      <div id="ee-exams-preview" style="padding:.55rem .85rem;background:var(--bg2);
           border-radius:8px;border:1px solid var(--border2);font-size:.78rem;color:var(--text2)">
        📋 <strong id="ee-exams-count">${(e.exam_ids||[]).length}</strong>
        exámenes asignados para <em>${esc(e.puesto)}</em>
      </div>

      <!-- Error -->
      <div id="ee-error" style="display:none;color:var(--red);font-size:.78rem;font-weight:600;
           padding:.42rem .8rem;background:rgba(198,40,40,.08);border-radius:6px;
           border-left:3px solid var(--red)"></div>

      <!-- Acciones -->
      <div style="display:flex;gap:.65rem;justify-content:flex-end;padding-top:.25rem">
        <button onclick="openEmpModal('${id}')"
          style="padding:.5rem 1.1rem;border-radius:7px;border:1.5px solid var(--border2);
                 background:none;color:var(--text2);font-family:var(--fb);font-size:.83rem;
                 font-weight:600;cursor:pointer;transition:all .15s"
          onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background='none'">
          Cancelar
        </button>
        <button onclick="saveEmpEdit('${id}')"
          style="padding:.5rem 1.3rem;border-radius:7px;border:none;background:var(--accent);
                 color:#fff;font-family:var(--fb);font-size:.83rem;font-weight:700;
                 cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:.4rem;
                 box-shadow:0 2px 8px rgba(27,79,138,.3)"
          onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">
          💾 Guardar cambios
        </button>
      </div>
    </div>`;

  // Live cascade: área cambia → actualizar puestos + preview exámenes
  const areaEl   = document.getElementById('ee-area');
  const puestoEl = document.getElementById('ee-puesto');

  function refreshPuestos(){
    const area = areaEl.value;
    const curP = puestoEl.value;
    const catP = (typeof catalogPuestosForArea === 'function') ? catalogPuestosForArea(area) : [];
    const empP = EMPLOYEES.filter(x=>x.area===area).map(x=>x.puesto).filter(Boolean);
    const newPuestos = [...new Set([...catP, ...empP])].sort();
    puestoEl.innerHTML = newPuestos.map(p=>
      `<option value="${esc(p)}" ${p===curP?'selected':''}>${esc(p)}</option>`).join('');
    refreshExamPreview();
  }

  function refreshExamPreview(){
    const puesto = puestoEl.value;
    const ids = _getExamIdsForPuesto(puesto, areaEl.value);
    const cnt = document.getElementById('ee-exams-count');
    const prv = document.getElementById('ee-exams-preview');
    if(cnt) cnt.textContent = ids.length;
    if(prv) prv.innerHTML = `📋 <strong>${ids.length}</strong> exámenes asignados para <em>${esc(puesto)||'—'}</em>`;
  }

  if(areaEl)   areaEl.addEventListener('change', refreshPuestos);
  if(puestoEl) puestoEl.addEventListener('change', refreshExamPreview);

  // Hide Edit button while in edit mode
  const editBtn = document.getElementById('emp-edit-btn');
  if(editBtn) editBtn.style.display = 'none';
}

function saveEmpEdit(id){
  const e = EMPLOYEES.find(x=>x.id===id); if(!e) return;

  const g = (fid) => {
    const el = document.getElementById('ee-'+fid); return el ? el.value.trim() : '';
  };

  const nombre  = g('nombre');
  const area    = g('area');
  const puesto  = g('puesto');
  const errEl   = document.getElementById('ee-error');

  if(!nombre || !area || !puesto){
    if(errEl){ errEl.textContent='Nombre, Área y Puesto son obligatorios.'; errEl.style.display='block'; }
    return;
  }

  // Duplicate name check (excluding self)
  const dup = EMPLOYEES.find(x=>x.id!==id && x.nombre.toUpperCase()===nombre.toUpperCase());
  if(dup){
    if(errEl){ errEl.textContent=`Ya existe otro empleado con ese nombre: ${dup.id}.`; errEl.style.display='block'; }
    return;
  }
  if(errEl) errEl.style.display = 'none';

  const puestoChanged = puesto !== e.puesto;

  // Apply changes to runtime object
  e.nombre      = nombre;
  e.area        = area;
  e.puesto      = puesto;
  e.email       = g('email') || 'No hay numero';
  e.numero      = g('numero') || e.numero;
  e.supervisor  = g('supervisor');
  e.ingreso     = g('ingreso');
  e.horario     = g('horario');
  e.estatus     = g('estatus') || 'Pendiente';
  e.cert_cofc   = g('cert-cofc');
  e.cert_examen = g('cert-examen');

  // If puesto changed, recalculate exam_ids desde el catálogo
  if(puestoChanged) e.exam_ids = _getExamIdsForPuesto(puesto, area);

  // Persist: overrides → nmc-employee-data.overrides
  _saveEmpOverride(e);

  // If manual employee, also update nmc-extra-employees
  if(e._manual) _saveExtraEmployees();

  // Rebuild and refresh
  _rebuildIndexes();
  buildAreaPuestoFilters();
  refreshAllKPIs();
  filterEmps();

  // Show Edit button again and reopen view mode
  const editBtn = document.getElementById('emp-edit-btn');
  if(editBtn) editBtn.style.display = '';

  openEmpModal(id);
  showToast(`✓ Cambios guardados — ${e.nombre}`);
}

// Save field overrides for one employee (persists all editable fields)
function _saveEmpOverride(e){
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('nmc-employee-data')||'{}'); } catch{}
  if(!saved.statuses)  saved.statuses  = {};
  if(!saved.overrides) saved.overrides = {};

  const k = _persistKey(e);
  saved.statuses[k] = e.estatus;
  saved.overrides[k] = {
    nombre:      e.nombre,
    email:       e.email,
    numero:      e.numero,
    supervisor:  e.supervisor,
    ingreso:     e.ingreso,
    horario:     e.horario,
    estatus:     e.estatus,
    cert_cofc:   e.cert_cofc,
    cert_examen: e.cert_examen,
    puesto:      e.puesto,
    area:        e.area,
    exam_ids:    e.exam_ids,
  };
  try { localStorage.setItem('nmc-employee-data', JSON.stringify(saved)); } catch{}
}
// ══ /EDICIÓN DE REGISTROS ════════════════════════════════════════



// ════════════════════════════════════════════════════════
// MATRIX VIEW  (exams × areas)
// ════════════════════════════════════════════════════════
function renderMatrix(){
  const q=document.getElementById('mtx-q').value.toLowerCase();
  const examsF=EXAMS.filter(ex=>!q||ex.tema.toLowerCase().includes(q)||ex.id.toLowerCase().includes(q));

  // Usar ALL_AREAS (Lista2_Empleados) — misma fuente que filtros
  // Mostrar solo áreas que tienen al menos un examen asignado
  const areasConExamen=ALL_AREAS.filter(a=>EXAMS.some(ex=>getExamEmps(ex).some(e=>e.area===a)));

  document.getElementById('matrix-container').innerHTML=`
    <div class="matrix-wrap">
      <table>
        <thead>
          <tr>
            <th style="min-width:200px;background:var(--bg2);color:var(--accent);border-bottom:2px solid var(--accent)">Examen</th>
            ${areasConExamen.map(a=>`
              <th style="writing-mode:vertical-rl;text-orientation:mixed;white-space:nowrap;
                         min-width:32px;font-size:.6rem;transform:rotate(180deg);
                         background:var(--bg2);color:var(--text2);
                         border-left:1px solid var(--border)">${esc(a)}</th>`).join('')}
            <th style="background:var(--bg2);color:var(--text3);text-align:center">Emps.</th>
            <th style="background:var(--bg2);color:var(--green);text-align:center">Aprobados</th>
          </tr>
        </thead>
        <tbody>
          ${examsF.map((ex,ri)=>{
            const emps=getExamEmps(ex);
            const apr=emps.filter(e=>e.estatus==='Aprobado').length;
            const pct=emps.length?Math.round(apr/emps.length*100):0;
            // Áreas reales de empleados asignados a este examen
            const exEmpAreas=new Set(emps.map(e=>e.area));
            const rowBg=ri%2===0?'var(--card)':'var(--card2)';
            return `<tr onclick="showExamDetailMatrix('${esc(ex.id)}')"
              style="cursor:pointer;background:${rowBg}"
              onmouseenter="this.style.background='#ddeeff'"
              onmouseleave="this.style.background='${rowBg}'">
              <td style="max-width:260px;border-right:2px solid var(--border2)">
                <div style="font-size:.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)" title="${esc(ex.tema)}">${esc(ex.tema)}</div>
                <div style="font-size:.63rem;color:var(--accent);font-weight:700;letter-spacing:.04em">${esc(ex.id)}</div>
              </td>
              ${areasConExamen.map(a=>exEmpAreas.has(a)
                ? `<td style="text-align:center;padding:.3rem;border-left:1px solid var(--border)">
                     <div class="matrix-dot" title="${esc(a)}">✓</div></td>`
                : `<td style="border-left:1px solid var(--border)"></td>`
              ).join('')}
              <td style="text-align:center;font-weight:700;color:var(--accent);font-size:.85rem">${emps.length}</td>
              <td style="text-align:center;font-size:.82rem">
                <span style="font-weight:700;color:${pct===100&&emps.length>0?'var(--green)':pct>0?'var(--yellow)':'var(--red)'}">${apr}</span>
                <span style="font-size:.65rem;color:var(--text3);margin-left:.25rem">${emps.length?pct+'%':''}</span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function showExamDetailMatrix(id){
  showView('exams');
  showExamDetail(id);
}

// ════════════════════════════════════════════════════════
// EMAIL BLAST
// ════════════════════════════════════════════════════════
function openFilteredEmailBlast(){
  const area=document.getElementById('emp-area').value;
  const puesto=document.getElementById('emp-puesto').value;

  // Employees matching the current filter with valid email
  const targets=filtEmps.length ? filtEmps : EMPLOYEES;
  const withEmail=targets.filter(e=>e.email&&e.email!=='No hay numero'&&e.email.includes('@'));
  const emails=[...new Set(withEmail.map(e=>e.email.trim()))];
  const noEmail=targets.length-withEmail.length;

  // Exams assigned to any of the filtered employees (via exam_ids from Excel Aplica)
  const allExamIds=new Set(targets.flatMap(e=>e.exam_ids||[]));
  const matchedExams=EXAMS.filter(ex=>allExamIds.has(ex.id));

  const filterDesc=puesto&&area?`Área: ${area} · Puesto: ${puesto}`:puesto?`Puesto: ${puesto}`:area?`Área: ${area}`:'Todos los empleados';

  document.getElementById('em-title').innerHTML=`✉️ Correo — ${esc(filterDesc)}`;
  document.getElementById('em-sub').innerHTML=
    `<strong style="color:var(--accent)">${matchedExams.length}</strong> examen(es) aplican · <strong style="color:var(--accent)">${withEmail.length}</strong> destinatarios con email válido`;
  document.getElementById('em-count').textContent=emails.length;
  document.getElementById('em-noemail').textContent=noEmail;
  document.getElementById('em-list').value=emails.join('; ');

  // Build HTML email body with hyperlinked exam table
  const subject=`Recordatorio de Certificación — ${filterDesc}`;
  const htmlBody=buildExamEmailHtml(
    `Le recordamos que debe completar los siguientes exámenes correspondientes a su puesto (${filterDesc}):`,
    matchedExams, filterDesc
  );
  const btn=document.getElementById('em-mailto');
  window._pendingOutlook=()=>openOutlookCompose(emails, subject, htmlBody);
  btn.style.display=emails.length?'flex':'none';

  // Preview: show exam links section
  const examPreview=matchedExams.length?`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:.8rem;margin-bottom:.85rem">
      <div style="font-size:.7rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.55rem">Exámenes incluidos en el correo (${matchedExams.length})</div>
      ${matchedExams.map(ex=>`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.3rem 0;border-bottom:1px solid var(--border)">
          <div style="min-width:0;flex:1">
            <div style="font-size:.78rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ex.tema)}</div>
            <div style="font-size:.65rem;color:var(--accent)">${esc(ex.id)}</div>
          </div>
          ${safeUrl(ex.url)?`<a href="${esc(safeUrl(ex.url))}" target="_blank" rel="noopener noreferrer" class="btn btn-p btn-sm" style="font-size:.64rem;padding:.18rem .45rem;flex-shrink:0" >🔗</a>`:''}
        </div>`).join('')}
    </div>`:
    `<div style="color:var(--text3);font-size:.8rem;padding:.5rem 0">No se encontraron exámenes para este filtro.</div>`;

  document.getElementById('em-preview').innerHTML=examPreview+
    withEmail.slice(0,15).map(e=>`
    <div style="display:flex;align-items:center;gap:.65rem;padding:.4rem 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:.82rem;font-weight:500">${esc(fmtName(e.nombre))}</div>
        <div style="font-size:.68rem;color:var(--text3)">${esc(e.email)} · <span class="puesto-tag" style="font-size:.62rem">${esc(e.puesto)}</span></div>
      </div>
      ${sBadge(e.estatus)}
    </div>`).join('')+
    (withEmail.length>15?`<div style="text-align:center;color:var(--text3);font-size:.76rem;padding:.55rem">... y ${withEmail.length-15} destinatarios más</div>`:'');

  document.getElementById('email-modal').classList.add('open');
}

function openEmailBlast(examId){
  let targets, title, sub;
  if(examId){
    const ex=EXAMS.find(e=>e.id===examId);
    targets=getExamEmps(ex);
    title=`✉️ Correo — ${esc(examId)}`;
    sub=`Empleados asignados por puesto · <strong style="color:var(--accent)">${esc(ex.tema.substring(0,55))}${ex.tema.length>55?'…':''}</strong>`;
  } else {
    targets=EMPLOYEES.filter(e=>e.cert_examen==='Aplica');
    title='✉️ Envío Masivo — Cert. con Examen';
    sub='Empleados con <strong style="color:var(--accent)">Cert. Examen = Aplica</strong>';
  }
  const withEmail=targets.filter(e=>e.email&&e.email!=='No hay numero'&&e.email.includes('@'));
  const emails=[...new Set(withEmail.map(e=>e.email.trim()))];
  const noEmail=targets.length-withEmail.length;

  document.getElementById('em-title').innerHTML=title;
  document.getElementById('em-sub').innerHTML=sub;
  document.getElementById('em-count').textContent=emails.length;
  document.getElementById('em-noemail').textContent=noEmail;
  document.getElementById('em-list').value=emails.join('; ');

  const subjectText=examId?`Recordatorio — ${examId}`:`Recordatorio de Certificación NMC`;
  const examForHtml=examId?[EXAMS.find(e=>e.id===examId)].filter(Boolean):[];
  const htmlBody=buildExamEmailHtml(
    examId?`Le recordamos completar su examen de certificación:`:`Recuerde completar su certificación en el Sistema NMC:`,
    examForHtml
  );
  const btn=document.getElementById('em-mailto');
  window._pendingOutlook=()=>openOutlookCompose(emails, subjectText, htmlBody);
  btn.style.display=emails.length?'flex':'none';

  document.getElementById('em-preview').innerHTML=withEmail.slice(0,20).map(e=>`
    <div style="display:flex;align-items:center;gap:.65rem;padding:.45rem 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:.83rem;font-weight:500">${esc(fmtName(e.nombre))}</div>
        <div style="font-size:.7rem;color:var(--text3)">${esc(e.email)} · ${esc(e.puesto)} · ${esc(e.area)}</div>
      </div>
      ${sBadge(e.estatus)}
    </div>`).join('')+
    (withEmail.length>20?`<div style="text-align:center;color:var(--text3);font-size:.78rem;padding:.65rem">... y ${withEmail.length-20} más</div>`:'');

  document.getElementById('email-modal').classList.add('open');
}

function copyEmails(){
  const ta=document.getElementById('em-list'); ta.select(); document.execCommand('copy');
  showToast('📋 Correos copiados al portapapeles');
}

// ════════════════════════════════════════════════════════
// STATUS & SCORE
// ════════════════════════════════════════════════════════
function updateStatus(id,val){
  const emp=EMPLOYEES.find(e=>e.id===id); if(!emp) return;
  emp.estatus=val;
  _rebuildIndexes();
  refreshAllKPIs();
  renderEmps();
  saveEmployeeData();
  showToast('✅ Estatus: '+val);
}

// ══════════════════════════════════════════════════════════
// RESTABLECER ESTATUS POR ÁREA / PUESTO
// ══════════════════════════════════════════════════════════
let _rsSelectedStatus = 'Pendiente';

function openResetStatusPanel(){
  // Populate area selector
  const areaEl = document.getElementById('rs-area');
  areaEl.innerHTML = '<option value="">— Todas las áreas —</option>';
  // Get unique areas present in EMPLOYEES (respects runtime data)
  const areasPresentes = [...new Set(EMPLOYEES.map(e=>e.area).filter(Boolean))].sort();
  areasPresentes.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    areaEl.appendChild(opt);
  });

  // Reset state
  areaEl.value = '';
  _rsSelectedStatus = 'Pendiente';
  selectResetStatus('Pendiente');
  onResetAreaChange();
  document.getElementById('reset-status-overlay').style.display='flex';
}

function closeResetStatusPanel(){
  document.getElementById('reset-status-overlay').style.display='none';
}

function onResetAreaChange(){
  const area = document.getElementById('rs-area').value;
  const puestoEl = document.getElementById('rs-puesto');
  puestoEl.innerHTML = '<option value="">— Todos los puestos —</option>';

  // Filter puestos that appear in selected area (or all if no area)
  const filtered = area
    ? EMPLOYEES.filter(e=>e.area===area)
    : EMPLOYEES;
  const puestosUniq = [...new Set(filtered.map(e=>e.puesto).filter(Boolean))].sort();
  puestosUniq.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    puestoEl.appendChild(opt);
  });
  puestoEl.value = '';
  _updateResetPreview();
}

function selectResetStatus(val){
  _rsSelectedStatus = val;
  ['Pendiente','Aprobado','Inactivo'].forEach(s => {
    const el = document.getElementById('rs-opt-'+s.toLowerCase());
    if(!el) return;
    if(s===val){
      el.style.borderColor = s==='Pendiente' ? 'var(--yellow)'
                           : s==='Aprobado'  ? 'var(--green)'
                           :                   'var(--text3)';
      el.style.background  = s==='Pendiente' ? 'rgba(245,197,24,.12)'
                           : s==='Aprobado'  ? 'rgba(34,211,160,.12)'
                           :                   'rgba(148,163,184,.12)';
    } else {
      el.style.borderColor = 'var(--border2)';
      el.style.background  = 'transparent';
    }
  });
  _updateResetPreview();
}

function _getResetTargets(){
  const area   = document.getElementById('rs-area').value;
  const puesto = document.getElementById('rs-puesto').value;
  return EMPLOYEES.filter(e => {
    if(area   && e.area   !== area)   return false;
    if(puesto && e.puesto !== puesto) return false;
    return true;
  });
}

function _updateResetPreview(){
  const targets = _getResetTargets();
  const prev    = document.getElementById('rs-preview');
  const btn     = document.getElementById('rs-confirm-btn');
  const area    = document.getElementById('rs-area').value;
  const puesto  = document.getElementById('rs-puesto').value;

  if(!area && !puesto){
    prev.innerHTML = '<span style="color:var(--text3)">Selecciona un área y/o puesto para ver cuántos empleados se verán afectados.</span>';
    btn.disabled = true; btn.style.opacity = '.45'; btn.style.cursor = 'not-allowed';
    return;
  }

  const n   = targets.length;
  const lbl = area ? (puesto ? `<b>${esc(puesto)}</b> · <span style="opacity:.7">${esc(area)}</span>` : `área <b>${esc(area)}</b>`)
                   : `puesto <b>${esc(puesto)}</b>`;
  const statusLbl = _rsSelectedStatus === 'Pendiente' ? '<span style="color:var(--yellow)">⏳ Pendiente</span>'
                  : _rsSelectedStatus === 'Aprobado'  ? '<span style="color:var(--green)">✅ Aprobado</span>'
                  :                                     '<span style="color:var(--text3)">⛔ Inactivo</span>';

  prev.innerHTML = n === 0
    ? '<span style="color:var(--red)">No se encontraron empleados con ese filtro.</span>'
    : `Se cambiarán <b>${n}</b> empleado${n!==1?'s':''} de ${lbl} a ${statusLbl}.`;

  if(n > 0){
    btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
  } else {
    btn.disabled = true; btn.style.opacity = '.45'; btn.style.cursor = 'not-allowed';
  }
}

function applyResetStatus(){
  const targets = _getResetTargets();
  if(!targets.length) return;

  // Load existing state from localStorage
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('nmc-employee-data')||'{}'); } catch{}
  if(!saved.statuses) saved.statuses = {};

  // Apply new status to each target employee
  targets.forEach(e => {
    e.estatus = _rsSelectedStatus;                  // runtime object
    saved.statuses[_persistKey(e)] = _rsSelectedStatus; // localStorage override (por número)
  });

  // Persist
  try { localStorage.setItem('nmc-employee-data', JSON.stringify(saved)); } catch{}

  // Refresh all views
  _rebuildIndexes();
  refreshAllKPIs();
  filterExams();
  renderEmps();
  renderMatrix();

  // Show toast
  const n = targets.length;
  const toast = document.createElement('div');
  toast.textContent = `↺ ${n} empleado${n!==1?'s':''} → ${_rsSelectedStatus}`;
  toast.style.cssText = 'position:fixed;bottom:1.4rem;left:50%;transform:translateX(-50%);' +
    'background:var(--accent);color:#fff;padding:.55rem 1.3rem;border-radius:20px;' +
    'font-family:var(--fb);font-size:.83rem;font-weight:700;z-index:9999;' +
    'box-shadow:0 4px 20px rgba(27,79,138,.4);animation:fadeIn .2s ease;pointer-events:none';
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(), 2800);

  closeResetStatusPanel();
}
// ══ /RESTABLECER ESTATUS ══════════════════════════════════════════


// ════════════════════════════════════════════════════════
// DOWNLOAD EXCEL
// ════════════════════════════════════════════════════════
function downloadExcel(){
  if(typeof XLSX==='undefined'){showToast('⚠️ XLSX no disponible');return;}
  const wb=XLSX.utils.book_new();

  // Sheet 1: Exams
  const eRows=EXAMS.map(ex=>{
    const emps=getExamEmps(ex);
    const apr=emps.filter(e=>e.estatus==='Aprobado').length;
    const obj={ID:ex.id,Tema:ex.tema,URL:ex.url,Edicion:ex.edicion,Estatus:ex.estatus,
      'Puestos Aplica':ex.aplica.length,'Empleados Asignados':emps.length,
      'Aprobados':apr,'Cumplimiento %':emps.length?Math.round(apr/emps.length*100)+'%':'—'};
    ALL_EXAM_AREAS.forEach(a=>{ obj['Área: '+a]=ex.aplica.some(m=>m.area===a)?'Aplica':''; });
    return obj;
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(eRows),'Lista1_Examenes');

  // Sheet 2: Employees
  const empRows=EMPLOYEES.map(e=>{
    const myExams=(e.exam_ids||[]).length;
    return {ID:e.id,Numero:e.numero,Nombre:e.nombre,Email:e.email,Puesto:e.puesto,
      Area:e.area,Supervisor:e.supervisor,'Cert CofC':e.cert_cofc,'Cert Examen':e.cert_examen,
      'Examenes cubiertos':(e.exam_ids||[]).length,Estatus:e.estatus,
      'Examenes asignados':myExams,Horario:e.horario};
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(empRows),'Lista2_Empleados');

  // Sheet 3: KPI
  const apr=EMPLOYEES.filter(e=>e.estatus==='Aprobado').length;
  const tot=EMPLOYEES.length;
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['Total Empleados','Aprobados','Pendientes','Cumplimiento %','Total Exámenes'],
    [tot,apr,tot-apr,((apr/tot)*100).toFixed(1)+'%',EXAMS.length]
  ]),'KPI');

  XLSX.writeFile(wb,`NMC_Control_Entrenamientos_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('⬇ Excel descargado');
}

// ════════════════════════════════════════════════════════
// EXCEL UPLOAD (reload data)
// ════════════════════════════════════════════════════════
function loadExcel(event){
  const file=event.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const sh1=wb.SheetNames.find(s=>s.toLowerCase().includes('examenes')||s.toLowerCase().includes('lista1'));
      const sh2=wb.SheetNames.find(s=>s.toLowerCase().includes('empleados')||s.toLowerCase().includes('lista2'));
      if(!sh1||!sh2){showToast('⚠️ No se encontraron las hojas correctas');return;}

      const r1=XLSX.utils.sheet_to_json(wb.Sheets[sh1],{header:1,defval:''});
      const r2=XLSX.utils.sheet_to_json(wb.Sheets[sh2],{header:1,defval:''});

      // Extraer HIPERVÍNCULOS de la hoja de exámenes.
      // Las celdas de la columna D ("Edicion de examen") muestran texto,
      // pero llevan un hipervínculo oculto (.l.Target) al link de edición
      // (DesignPageV2). sheet_to_json solo devuelve el texto, así que leemos
      // las celdas crudas para recuperar el link real.
      const sheet1 = wb.Sheets[sh1];
      function _cellLink(rowIdx, colIdx){
        // rowIdx/colIdx en base 0 (igual que r1)
        const addr = XLSX.utils.encode_cell({r: rowIdx, c: colIdx});
        const cell = sheet1[addr];
        return (cell && cell.l && cell.l.Target) ? String(cell.l.Target).trim() : '';
      }

      // El Excel tiene UNA sola fila de encabezado (row 0):
      // cols 0-4: fila, Tema, URL, Edicion, Estatus
      // cols 5+:  nombres de PUESTOS
      // Los datos de exámenes empiezan en row 1
      const hdrRow=r1[0]||[];

      // Construir mapa puesto→área desde COL_META (mapeo hardcoded)
      const puestoAreaMap={};
      (COL_META||[]).forEach(m=>{ if(m.puesto) puestoAreaMap[m.puesto.toUpperCase()]=m.area; });

      // colMeta: columna → {area, puesto}
      const colMeta={};
      for(let c=5;c<hdrRow.length;c++){
        const p=String(hdrRow[c]).trim();
        if(p&&p!=='nan'&&p!==''){
          const area=puestoAreaMap[p.toUpperCase()]||'';
          colMeta[c]={area,puesto:p};
        }
      }

      // Parsear exámenes: datos desde row 1
      const newExams=[];
      for(let r=1;r<r1.length;r++){
        const row=r1[r];
        const id=String(row[0]).trim();
        if(!id.startsWith('REG')) continue;
        const aplica=[];
        Object.entries(colMeta).forEach(([c,m])=>{
          if(String(row[c]).trim().toLowerCase()==='aplica') aplica.push(m);
        });
        // Columna C (col 2) = URL del examen. Preferir el hipervínculo si existe,
        // si no el texto de la celda.
        const urlCell  = String(row[2]).trim();
        const urlLink  = _cellLink(r, 2) || urlCell;
        // Columna D (col 3) = "Edicion de examen": el texto es el nombre,
        // el hipervínculo es el link de edición (DesignPageV2).
        const edText   = String(row[3]).trim();
        const edLink   = _cellLink(r, 3);
        newExams.push({
          id,
          tema: String(row[1]).trim(),
          url: urlLink,
          edicion: edText,
          estatus: String(row[4]).trim()||'Activo',
          aplica,
          edicion_url: edLink   // ← link de edición tomado del hipervínculo de la col D
        });
      }

      // Find header row in sheet 2
      let hIdx=r2.findIndex(row=>row.some(v=>String(v).trim()==='Nombre'));
      if(hIdx<0){showToast('⚠️ No se encontró encabezado en Empleados');return;}
      const hdr=r2[hIdx];
      const H={};
      hdr.forEach((v,i)=>{H[String(v).trim()]=i;});

      const newEmps=[];
      for(let r=hIdx+1;r<r2.length;r++){
        const row=r2[r];
        const nombre=String(row[H['Nombre']]||'').trim();
        if(!nombre||nombre==='Nombre') continue;
        const emp={};
        [['id','ID_Registro'],['numero','Número'],['nombre','Nombre'],['email','Email'],
         ['puesto','Puesto'],['area','Area'],['supervisor','Supervisor'],
         ['cert_cofc','Certificacion con CofC'],['cert_examen','Certificacion con Examen'],
         ['puntaje','Puntaje (%)'],['estatus','Estatus'],['horario','Descripción Horario']
        ].forEach(([k,col])=>{ emp[k]=H[col]!==undefined?String(row[H[col]]||'').replace(/^nan$/,'').trim():''; });
        newEmps.push(emp);
      }

      if(newExams.length&&newEmps.length){
        // Construir mapa puesto→[examIds] para asignar exam_ids a empleados
        const puestoExamMap={};
        newExams.forEach(ex=>{
          ex.aplica.forEach(a=>{
            const pk=a.puesto.toUpperCase();
            if(!puestoExamMap[pk]) puestoExamMap[pk]=[];
            puestoExamMap[pk].push(ex.id);
          });
        });
        // Asignar exam_ids a cada empleado según su puesto
        newEmps.forEach(emp=>{
          const pk=(emp.puesto||'').toUpperCase();
          emp.exam_ids=puestoExamMap[pk]||[];
        });

        EXAMS=newExams; EMPLOYEES=newEmps;
        _applyDeletedFilter(); // respeta bajas "Eliminar del sistema" previas
        COL_META=Object.values(colMeta);
        ALL_EXAM_AREAS=[...new Set(Object.values(colMeta).map(m=>m.area).filter(Boolean))];
        ALL_AREAS=[...new Set(EMPLOYEES.map(e=>e.area).filter(Boolean))];
        ALL_PUESTOS=[...new Set(Object.values(colMeta).map(m=>m.puesto).filter(Boolean))];
        _rebuildIndexes();

        filtExams=[...EXAMS]; filtEmps=[...EMPLOYEES];
        document.getElementById('ex-area').innerHTML='<option value="">Todas las áreas</option>';
        document.getElementById('ex-puesto').innerHTML='<option value="">Todos los puestos</option>';
        document.getElementById('emp-area').innerHTML='<option value="">Todas las áreas</option>';
        document.getElementById('emp-puesto').innerHTML='<option value="">Todos los puestos</option>';
        document.getElementById('emp-cert').value='';
        buildAreaPuestoFilters();
        refreshAllKPIs();
        filterExams();renderEmps();renderMatrix();
        // AUTOSAVE: persiste el dataset COMPLETO + statuses en localStorage
        try { saveDataset(); } catch(e){ console.warn('saveDataset Excel:', e); }
        try { saveEmployeeData(); } catch(e){ console.warn('autosave Excel:', e); }
        // Importación legado: incorpora puestos/asignaciones nuevos a la capa de gestión
        try { if(typeof syncPuestosAfterImport === 'function') syncPuestosAfterImport(); } catch(e){ console.warn('syncPuestosAfterImport:', e); }
        showToast(`✅ Cargado: ${newExams.length} exámenes, ${newEmps.length} empleados`);
        if(typeof window._refreshMasterFromSistema === 'function'){
          try { window._refreshMasterFromSistema(EXAMS, EMPLOYEES); }
          catch(e){ console.warn('_refreshMasterFromSistema:', e); }
        }
      } else showToast('⚠️ No se pudieron leer los datos');
    }catch(err){showToast('❌ Error: '+err.message);}
  };
  reader.readAsArrayBuffer(file);
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function fmtName(n){
  if(!n) return '';
  return n.split(',').reverse().join(' ').trim().split(' ')
    .map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');
}

function sBadge(s){
  const m={Activo:'b-g',Aprobado:'b-g',Pendiente:'b-y',Inactivo:'b-r',Suspendido:'b-r'};
  const i={Activo:'✓',Aprobado:'✓',Pendiente:'⏳',Inactivo:'✕',Suspendido:'⚠️'};
  return `<span class="badge ${m[s]||'b-x'}">${i[s]||''} ${s||'—'}</span>`;
}

function renderPager(containerId,total,ps,current,onPage){
  const pages=Math.ceil(total/ps);
  const cont=document.getElementById(containerId);
  if(pages<=1){cont.innerHTML='';return;}
  let h='';
  if(current>1) h+=`<button class="pg-btn" onclick="(${onPage})(1)">«</button>`;
  if(current>1) h+=`<button class="pg-btn" onclick="(${onPage})(${current-1})">‹</button>`;
  for(let i=Math.max(1,current-2);i<=Math.min(pages,current+2);i++)
    h+=`<button class="pg-btn ${i===current?'active':''}" onclick="(${onPage})(${i})">${i}</button>`;
  if(current<pages) h+=`<button class="pg-btn" onclick="(${onPage})(${current+1})">›</button>`;
  if(current<pages) h+=`<button class="pg-btn" onclick="(${onPage})(${pages})">»</button>`;
  h+=`<span class="pg-info">${current}/${pages} · ${total} registros</span>`;
  cont.innerHTML=h;
}

// ════════════════════════════════════════════════════════
// EXAM LINKS PANEL
// ════════════════════════════════════════════════════════
function openExamLinksPanel(){
  document.getElementById('links-q').value='';
  renderExamLinks();
  document.getElementById('exam-links-modal').classList.add('open');
}

function renderExamLinks(){
  const q=document.getElementById('links-q').value.toLowerCase();
  const list=EXAMS.filter(ex=>
    ex.url && ex.url!=='nan' && ex.url!=='' &&
    (!q || ex.tema.toLowerCase().includes(q) || (ex.edicion||'').toLowerCase().includes(q) || ex.id.toLowerCase().includes(q))
  );
  const noLink=EXAMS.filter(ex=>!ex.url||ex.url==='nan'||ex.url==='');
  document.getElementById('exam-links-list').innerHTML=
    (list.length?list.map(ex=>`
      <div style="display:flex;align-items:flex-start;gap:.75rem;padding:.75rem 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.2rem">
            <span class="id-chip" style="font-size:.72rem;color:var(--accent);font-weight:700">${esc(ex.id)}</span>
            ${sBadge(ex.estatus)}
          </div>
          <div style="font-size:.83rem;font-weight:500;margin-bottom:.25rem;line-height:1.35">${esc(ex.tema)}</div>
          ${ex.edicion?`<div style="font-size:.7rem;color:var(--text3);margin-bottom:.3rem">📄 ${esc(ex.edicion)}</div>`:''}
          <div style="font-size:.68rem;color:var(--text3);word-break:break-all">${esc(ex.url)}</div>
        </div>
        <a href="${esc(safeUrl(ex.url))}" target="_blank" rel="noopener noreferrer" class="btn btn-p btn-sm" style="flex-shrink:0;font-size:.72rem">🔗 Abrir</a>
      </div>`).join('')
    :'<div class="empty"><div class="empty-icon">🔍</div><div>Sin resultados</div></div>')+
    (noLink.length&&!q?`<div style="margin-top:.9rem;font-size:.72rem;color:var(--text3);text-align:center">${noLink.length} examen(es) sin link registrado</div>`:'');
}

function openEdicionLinksPanel(){
  document.getElementById('edicion-q').value='';
  renderEdicionLinks();
  document.getElementById('edicion-links-modal').classList.add('open');
}

function renderEdicionLinks(){
  const q = document.getElementById('edicion-q').value.toLowerCase();
  // Mostrar TODOS los exámenes que coincidan con la búsqueda (no solo los que
  // tienen link), para que el panel nunca quede vacío. Si un examen no tiene
  // edicion_url, el botón se muestra deshabilitado.
  const list = EXAMS.filter(ex =>
    (!q || ex.tema.toLowerCase().includes(q) || (ex.edicion||'').toLowerCase().includes(q) || ex.id.toLowerCase().includes(q))
  );
  const sinLink = EXAMS.filter(ex => !ex.edicion_url).length;
  document.getElementById('edicion-links-list').innerHTML =
    (list.length ? list.map(ex=>`
      <div style="display:flex;align-items:flex-start;gap:.75rem;padding:.75rem 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.2rem">
            <span class="id-chip" style="font-size:.72rem;color:var(--accent);font-weight:700">${esc(ex.id)}</span>
            ${sBadge(ex.estatus)}
          </div>
          <div style="font-size:.83rem;font-weight:500;margin-bottom:.25rem;line-height:1.35">${esc(ex.tema)}</div>
          ${ex.edicion?`<div style="font-size:.7rem;color:var(--text3)">✏️ ${esc(ex.edicion)}</div>`:''}
        </div>
        ${safeUrl(ex.edicion_url)
          ? `<a href="${esc(safeUrl(ex.edicion_url))}" target="_blank" rel="noopener noreferrer" class="btn btn-s btn-sm" style="flex-shrink:0;font-size:.72rem">✏️ Edición de Exámenes</a>`
          : `<span class="btn btn-s btn-sm" style="flex-shrink:0;font-size:.72rem;opacity:.4;cursor:not-allowed" title="Sin link de edición">✏️ Sin link</span>`}
      </div>`).join('')
    : '<div class="empty"><div class="empty-icon">🔍</div><div>Sin resultados</div></div>') +
    (sinLink && !q ? `<div style="margin-top:.9rem;font-size:.72rem;color:var(--text3);text-align:center">${sinLink} examen(es) sin link de edición</div>` : '');
}
window._valDates = {};   // examId → date string

function onValDateChange(examId, dateVal){
  window._valDates[examId] = dateVal;
  const btn=document.getElementById(`auto-email-btn-${examId}`);
  if(btn) btn.style.display = dateVal ? 'flex' : 'none';
  if(dateVal) showToast(`📅 Fecha de validación guardada: ${fmtDate(dateVal)}`);
}

function triggerAutoEmail(examId){
  const ex=EXAMS.find(e=>e.id===examId); if(!ex) return;
  const date=window._valDates[examId];
  if(!date){ showToast('⚠️ Selecciona una fecha primero'); return; }

  const emps=getExamEmps(ex);
  const withEmail=emps.filter(e=>e.email&&e.email!=='No hay numero'&&e.email.includes('@'));
  const emails=[...new Set(withEmail.map(e=>e.email.trim()))];

  const subject=`Aviso de Próxima Validación — ${ex.id}`;
  const examWithDate=[{...ex, tema:`${ex.tema} — 📅 Validación: ${fmtDate(date)}`}];
  const htmlBody=buildExamEmailHtml(
    `Le informamos que el siguiente examen tiene programada su <strong>próxima fecha de validación: ${fmtDate(date)}</strong>. Por favor asegúrese de estar al corriente antes de esa fecha.`,
    examWithDate
  );
  openOutlookCompose(emails, subject, htmlBody);
  showToast(`⚡ Abriendo Outlook con ${emails.length} destinatarios — validación ${fmtDate(date)}`);
}

function fmtDate(d){
  if(!d) return '';
  const [y,m,day]=d.split('-');
  return `${day}/${m}/${y}`;
}

// ════════════════════════════════════════════════════════
// DASHBOARD LAYOUT PERSISTENCE (KPI order + panel order)
// ════════════════════════════════════════════════════════

// Single in-memory cache — read from localStorage ONCE at startup,
// never again. All restore calls use this reference (O(1)).
let _dashLayoutCache = null;

function _loadDashboardLayout(){
  // Already primed — return immediately without touching localStorage
  if(_dashLayoutCache !== null) return _dashLayoutCache;
  try {
    const raw = localStorage.getItem('nmc-dashboard-layout');
    _dashLayoutCache = raw ? JSON.parse(raw) : null;
  } catch(e){ _dashLayoutCache = null; }
  return _dashLayoutCache;
}

function saveDashboardLayout(){
  try {
    const kpiGrid    = document.getElementById('dash-kpis');
    const chartsGrid = document.getElementById('dash-charts');

    const kpiOrder   = [...kpiGrid.children]
      .map(el => el.dataset.kpi).filter(Boolean);
    const panelOrder = [...chartsGrid.querySelectorAll('.dash-panel')]
      .map(el => el.dataset.panel).filter(Boolean);

    // Update cache AND storage atomically
    _dashLayoutCache = { kpiOrder, panelOrder };
    localStorage.setItem('nmc-dashboard-layout', JSON.stringify(_dashLayoutCache));
    showToast('💾 Orden del tablero guardado');
  } catch(e){ console.warn('saveDashboardLayout error:', e); }
}

// Called inside every renderDashboard() — uses in-memory cache, no I/O
function _restoreKpiOrder(){
  const layout = _dashLayoutCache;
  if(!layout?.kpiOrder?.length) return;
  const grid = document.getElementById('dash-kpis');
  // appendChild on existing nodes just moves them — no clone needed
  layout.kpiOrder.forEach(key => {
    const el = grid.querySelector(`[data-kpi="${key}"]`);
    if(el) grid.appendChild(el);
  });
}

// Called ONCE synchronously after the first render — no setTimeout, no flash
function _restorePanelOrder(){
  const layout = _dashLayoutCache;
  if(!layout?.panelOrder?.length) return;
  const grid = document.getElementById('dash-charts');
  layout.panelOrder.forEach(key => {
    const el = grid.querySelector(`[data-panel="${key}"]`);
    if(el) grid.appendChild(el);
  });
}

// ════════════════════════════════════════════════════════
// EMPLOYEE DATA PERSISTENCE (status overrides + exam checks)
// ════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// SINCRONIZACIÓN ← Analizador_Formularios_Entrenamiento
// El Analizador es el disparador: por cada usuario×curso con
// Maestro = "Aplica" y calificación Aprobada genera {num, examReg, pct}.
// Aquí se aplica: se activa el checkbox del examen en "Exámenes
// asignados por puesto" y, si el empleado completa todos sus exámenes,
// su estatus pasa a "Aprobado".
// Canales: 1) localStorage['nmc-analyzer-sync'] — automático al cargar,
// en vivo entre pestañas (evento storage) o forzado con 🔄 Sincronizar.
// 2) Archivo JSON — botón 📥 Importar calificaciones (funciona siempre,
// incluso si los HTML se abren como file:// con localStorage aislado).
// La aplicación es IDEMPOTENTE: re-aplicar el mismo paquete no duplica
// nada; los checks ya marcados solo se contabilizan como "ya aplicados".
// ════════════════════════════════════════════════════════════════
function _syncNormNum(v){ return String(v==null?'':v).trim().replace(/^0+(?=\d)/,''); }

function applyAnalyzerSync(payload, origen, opts){
  opts = opts || {};
  if(!payload || payload.v!==1 || !Array.isArray(payload.results)){
    if(!opts.silent) showToast('⚠️ Paquete de sincronización inválido (se esperaba JSON del Analizador)');
    return null;
  }
  window._examChecks = window._examChecks || {};
  const byNum = {};
  EMPLOYEES.forEach(e => { byNum[_syncNormNum(e.numero)] = e; });

  let checksNuevos = 0, yaMarcados = 0, sinEmpleado = 0;
  const empsTocados = new Set();

  for(const r of payload.results){
    const emp = byNum[_syncNormNum(r.num)];
    if(!emp){ sinEmpleado++; continue; }
    if(!window._examChecks[emp.id]) window._examChecks[emp.id] = {};
    if(window._examChecks[emp.id][r.examReg]){ yaMarcados++; continue; }
    window._examChecks[emp.id][r.examReg] = true;   // ✓ activa checkbox
    checksNuevos++;
    empsTocados.add(emp.id);
  }

  // Auto-aprobación: cualquier empleado cuyos exámenes asignados estén TODOS
  // marcados (p.ej. 8/8) pasa a "Aprobado". Se revisan TODOS los empleados en
  // cada sincronización (no solo los tocados ahora), para que nadie quede
  // Pendiente teniendo el 100% de sus exámenes completados.
  let aprobadosNuevos = 0;
  for(const emp of EMPLOYEES){
    if(emp.estatus === 'Aprobado') continue;
    let myExams = [];
    try {
      const e4 = (typeof _empMap !== 'undefined' && _empMap) ? _empMap[emp.id] : null;
      if(e4) myExams = getEmpExams(e4) || [];
    } catch(e){}
    if(!myExams.length && Array.isArray(emp.exam_ids)){
      myExams = [...new Set(emp.exam_ids)].map(id => ({id}));   // respaldo
    }
    if(!myExams.length) continue;
    const ch = _getChecks(emp.id);
    const done = myExams.filter(ex => ch[ex.id]).length;
    if(done === myExams.length){              // p.ej. 8/8
      emp.estatus = 'Aprobado'; aprobadosNuevos++;
    }
  }

  // Cambios de Estado masivos enviados desde el panel de Personal del Analizador
  let estatusCambiados = 0;
  if(Array.isArray(payload.statuses)){
    for(const s of payload.statuses){
      const emp = byNum[_syncNormNum(s.num)];
      if(!emp){ sinEmpleado++; continue; }
      if(s.estatus && emp.estatus !== s.estatus){ emp.estatus = s.estatus; estatusCambiados++; }
    }
  }

  // Persistir SIEMPRE antes de renderizar: un fallo visual no pierde datos
  try { saveEmployeeData(); } catch(e){ console.warn('sync save:', e); }
  // Trabajo pesado (reindexar, KPIs, tabla de empleados) solo si hubo cambios.
  if(checksNuevos || aprobadosNuevos || estatusCambiados){
    try { _rebuildIndexes(); } catch(e){ console.warn('sync idx:', e); }
    try { refreshAllKPIs(); }  catch(e){ console.warn('sync kpi:', e); }
    try { renderEmps(); }      catch(e){ console.warn('sync emps:', e); }
  }
  // Catálogo y Matriz se recomputan SIEMPRE desde EXAMS/EMPLOYEES en el mismo
  // instante, aunque el paquete se considere "sin novedades": así ambas vistas
  // nunca quedan desincronizadas entre sí por un ciclo de sync previo.
  try { filterExams(); }  catch(e){ console.warn('sync exams:', e); }
  try { renderMatrix(); } catch(e){ console.warn('sync matrix:', e); }

  const resumen = {checksNuevos, yaMarcados, sinEmpleado, aprobadosNuevos,
                   estatusCambiados, total: payload.results.length};
  if(!opts.silent || checksNuevos || aprobadosNuevos || estatusCambiados){
    showToast(
      (checksNuevos || estatusCambiados)
        ? `📥 Sincronización ${origen}: ${checksNuevos} exámenes marcados`
          + (estatusCambiados ? ` · ⚡ ${estatusCambiados} estado(s) actualizados` : '')
          + (aprobadosNuevos ? ` · 🎉 ${aprobadosNuevos} empleado(s) → Aprobado` : '')
          + (sinEmpleado ? ` · ⚠️ ${sinEmpleado} sin coincidencia` : '')
        : `📥 Sincronización ${origen}: sin novedades — ${yaMarcados} registro(s) ya estaban aplicados`
          + (sinEmpleado ? `, ${sinEmpleado} sin coincidencia` : '')
    );
  }
  return resumen;
}

// Lee el paquete del localStorage y lo aplica. SIEMPRE aplica (idempotente);
// el flag 'applied' solo decide si la corrida automática es silenciosa.
function _checkAnalyzerSync(manual){
  let raw = null;
  try { raw = localStorage.getItem('nmc-analyzer-sync'); } catch(e){}
  if(!raw){
    if(manual) showToast('⚠️ No hay paquete del Analizador en este navegador. Genera uno con 📤 Sincronizar en el Analizador, o usa 📥 Importar (JSON).');
    return;
  }
  try {
    const payload = JSON.parse(raw);
    const yaAplicado = localStorage.getItem('nmc-analyzer-sync-applied') === payload.generated;
    applyAnalyzerSync(payload, manual ? 'manual' : 'automática', {silent: !manual && yaAplicado});
    if(payload.generated){
      try{ localStorage.setItem('nmc-analyzer-sync-applied', payload.generated); }catch(e){}
    }
  } catch(e){
    console.warn('_checkAnalyzerSync error:', e);
    if(manual) showToast('⚠️ El paquete de sincronización está dañado; usa 📥 Importar (JSON)');
  }
}

// Importación manual del JSON descargado por el Analizador
function importAnalyzerFile(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    let payload = null;
    try { payload = JSON.parse(ev.target.result); }
    catch(e){ showToast('⚠️ El archivo no es un JSON válido'); input.value=''; return; }
    applyAnalyzerSync(payload, 'manual');
    if(payload && payload.generated){
      try{ localStorage.setItem('nmc-analyzer-sync-applied', payload.generated); }catch(e){}
    }
    input.value = '';
  };
  reader.onerror = () => { showToast('⚠️ No se pudo leer el archivo'); input.value=''; };
  reader.readAsText(file);
}

// ── SINCRONIZACIÓN → Analizador (sentido inverso) ──
// Constructor ÚNICO del paquete Sistema→Analizador: foto actual con estatus de
// todos los empleados (incluye área/puesto/supervisor y el conteo autoritativo
// de "Asignados") y los exámenes marcados. Lo usan tanto el respaldo manual
// (exportToAnalyzer) como el auto-export silencioso (_autoExportToAnalizador).
function _buildSistemaPayload(source){
  const checks = [];
  EMPLOYEES.forEach(e => {
    const ch = _getChecks(e.id);
    const regs = Object.keys(ch).filter(k => ch[k]);
    if(regs.length) checks.push({num:_syncNormNum(e.numero), regs});
  });
  const statuses = EMPLOYEES.map(e => ({
    num: _syncNormNum(e.numero),
    estatus: e.estatus||'',
    asignados: new Set(e.exam_ids||[]).size,
    cert_examen: e.cert_examen||'',
    cert_cofc: e.cert_cofc||'',
    area: e.area||'',
    puesto: e.puesto||'',
    supervisor: e.supervisor||''
  }));
  return {v:1, source, generated:new Date().toISOString(), statuses, checks};
}

// Respaldo manual (menú ⋮): escribe localStorage y descarga el JSON para el
// canal cross-máquina. La sincronización normal ya es automática y en vivo.
function exportToAnalyzer(){
  const payload = _buildSistemaPayload('sistema_entrenamiento_v11');
  const statuses = payload.statuses, checks = payload.checks;
  const json = JSON.stringify(payload);

  // Canal 1 — localStorage (verificación real de escritura)
  let viaLS = false;
  try{
    localStorage.setItem('nmc-sistema-sync', json);
    viaLS = localStorage.getItem('nmc-sistema-sync') === json;
  }catch(e){ viaLS = false; }

  // Canal 2 — descarga JSON (funciona siempre, incluso en file://)
  try{
    const blob = new Blob([json], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sync_sistema_entrenamiento.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  }catch(e){ console.warn('export download:', e); }

  const auto = viaLS && location.protocol !== 'file:';
  showToast(`📤 Enviado al Analizador: ${statuses.length} estatus · ${checks.length} empleado(s) con exámenes marcados`
    + (auto ? ' · canal automático activo' : ' · importa el JSON descargado en el Analizador'));
}

// Sincronización EN VIVO: si el Analizador (mismo origen, otra pestaña)
// publica un paquete nuevo, se aplica aquí sin recargar la página.
window.addEventListener('storage', ev => {
  if(ev.key === 'nmc-analyzer-sync' && ev.newValue) _checkAnalyzerSync(false);
});

function saveEmployeeData(){
  try {
    // FUSIÓN, no reemplazo: leer el registro previo para NO perder los
    // `overrides` (nombre, área, puesto, correo, etc.) que escribe
    // _saveEmpOverride() al editar un empleado. Antes esta función
    // reescribía la clave completa con solo {statuses, checks}, borrando
    // los overrides → los cambios editados desaparecían en el siguiente
    // load/refresh (auto-save del Analizador, checks de examen, sync).
    let prev = {};
    try { prev = JSON.parse(localStorage.getItem('nmc-employee-data')||'{}') || {}; } catch{}

    // Save only the overridden statuses (to keep it lightweight)
    // Clave = NÚMERO de empleado (estable ante reordenamientos del Excel)
    const statuses = {};
    EMPLOYEES.forEach(e => { statuses[_persistKey(e)] = e.estatus; });
    // Reconvertir checks (en memoria por id) a clave por número para persistir
    const checksById = window._examChecks || {};
    const checksByNum = {};
    Object.keys(checksById).forEach(empId => {
      const e = _empMap[empId];
      checksByNum[_persistKey(e) || empId] = checksById[empId];
    });
    const data = {
      // Conservar overrides existentes (los campos editados de cada empleado)
      overrides: prev.overrides || {},
      statuses,
      checks: checksByNum
    };
    localStorage.setItem('nmc-employee-data', JSON.stringify(data));
  } catch(e){ console.warn('saveEmployeeData error:', e); }
  // ► Auto-sync silencioso → Analizador (debounced 600ms para no saturar)
  _schedAutoExport();
}

/* ── AUTO-EXPORT SILENCIOSO → Analizador ─────────────────
   Cada vez que se guardan datos de empleados (check, estatus, etc.),
   se escribe un paquete compacto en localStorage['nmc-sistema-sync']
   para que el Analizador lo aplique en vivo (storage event) o al cargar.
   Solo localStorage — sin descarga de archivo, sin toast.
   Debounced a 600ms para agrupar clics rápidos.                     */
window._autoExportTimer = null;
function _schedAutoExport(){
  clearTimeout(window._autoExportTimer);
  window._autoExportTimer = setTimeout(_autoExportToAnalizador, 600);
}
function _autoExportToAnalizador(){
  try{
    const payload = _buildSistemaPayload('sistema_auto');
    localStorage.setItem('nmc-sistema-sync', JSON.stringify(payload));
    // En la app combinada: aplicar directamente en el Analizador (los eventos
    // `storage` no se disparan en el mismo documento).
    if(typeof window.applySistemaSync==='function'){
      window.applySistemaSync(payload, 'auto-combinado', {silent:true});
    }
  }catch(e){ console.warn('_autoExportToAnalizador:', e); }
}

function loadEmployeeData(){
  try {
    const raw = localStorage.getItem('nmc-employee-data');
    if(!raw) return;
    const data = JSON.parse(raw);

    // Restore employee statuses + field overrides
    // Las claves nuevas son por NÚMERO; las antiguas por id.
    // _empByKey() resuelve ambas (número primero, id como respaldo).
    if(data.statuses || data.overrides){
      const ovMap = data.overrides || {};
      const stMap = data.statuses  || {};
      Object.keys(ovMap).forEach(key => {
        const e = _empByKey(key);
        if(!e) return;
        const ov = ovMap[key];
        ['nombre','email','numero','supervisor','ingreso','horario',
         'cert_cofc','cert_examen','puesto','area','exam_ids'].forEach(f => {
          if(ov[f] !== undefined) e[f] = ov[f];
        });
      });
      Object.keys(stMap).forEach(key => {
        const e = _empByKey(key);
        if(e && stMap[key]) e.estatus = stMap[key];
      });
      _rebuildIndexes();
    }

    // Restore exam checks — reconvertir clave (número→id) para uso en memoria
    if(data.checks){
      const byId = {};
      Object.keys(data.checks).forEach(key => {
        const e = _empByKey(key);
        byId[e ? e.id : key] = data.checks[key];
      });
      window._examChecks = byId;
    }
  } catch(e){ console.warn('loadEmployeeData error:', e); }
}

// ════════════════════════════════════════════════════════════════
// ALTA Y BAJA DE PERSONAL
// ════════════════════════════════════════════════════════════════
// Persistencia: localStorage['nmc-extra-employees'] = [{...emp, _manual:true}]

// ── Utilidades ────────────────────────────────────────────────────
function _loadExtraEmployees(){
  try {
    const raw = localStorage.getItem('nmc-extra-employees');
    if(!raw) return;
    const extras = JSON.parse(raw);
    extras.forEach(e => {
      if(!EMPLOYEES.find(x=>x.id===e.id)) EMPLOYEES.push(e);
    });
    _rebuildIndexes(); // refresca _empMap/_numMap con los manuales antes de loadEmployeeData
  } catch(err){ console.warn('loadExtra error:', err); }
}

function _saveExtraEmployees(){
  const extras = EMPLOYEES.filter(e=>e._manual);
  try { localStorage.setItem('nmc-extra-employees', JSON.stringify(extras)); } catch(e){}
}

// ── Bajas "Eliminar del sistema" ──────────────────────────────────
// Registro persistente de empleados eliminados por clave (número o id).
// Permite que la eliminación sobreviva recargas y reimportaciones del
// Excel: los empleados del Excel se reconstruyen desde el dataset, por lo
// que sin este registro reaparecerían.
function _loadDeletedKeys(){
  try {
    const raw = localStorage.getItem('nmc-deleted-employees');
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch(e){ return new Set(); }
}

function _saveDeletedKey(key){
  if(!key) return;
  const set = _loadDeletedKeys();
  set.add(String(key));
  try { localStorage.setItem('nmc-deleted-employees', JSON.stringify([...set])); } catch(e){}
}

// Quita de EMPLOYEES todo registro cuya clave figure como eliminada.
// No afecta a los empleados de alta manual (viven en nmc-extra-employees
// y su borrado se persiste ahí directamente).
function _applyDeletedFilter(){
  const set = _loadDeletedKeys();
  if(!set.size) return;
  EMPLOYEES = EMPLOYEES.filter(e => e._manual || !set.has(String(_persistKey(e))));
}

// ════════════════════════════════════════════════════════════════
// PERSISTENCIA DEL DATASET COMPLETO (Excel cargado)
// localStorage['nmc-dataset'] = snapshot de EXAMS + EMPLOYEES + metadatos
// Resuelve: al recargar, los datos del Excel no se perdían porque solo
// se guardaban statuses/checks, no la lista completa de registros.
// ════════════════════════════════════════════════════════════════
function saveDataset(){
  try {
    const payload = {
      v: 1,
      ts: Date.now(),
      // No persistir empleados manuales aquí: ya viven en nmc-extra-employees
      employees: EMPLOYEES.filter(e => !e._manual),
      exams: EXAMS,
      colMeta: COL_META,
      allAreas: ALL_AREAS,
      allExamAreas: ALL_EXAM_AREAS,
      allPuestos: ALL_PUESTOS
    };
    const json = JSON.stringify(payload);
    localStorage.setItem('nmc-dataset', json);
    // Verificación real de escritura
    const back = localStorage.getItem('nmc-dataset');
    if(!back || back.length !== json.length){
      console.warn('saveDataset: verificación de escritura falló');
      return false;
    }
    return true;
  } catch(e){
    if(e && e.name === 'QuotaExceededError'){
      console.warn('saveDataset: cuota de almacenamiento excedida');
      try { showToast('⚠️ Sin espacio para guardar todos los datos'); } catch(_){}
    } else {
      console.warn('saveDataset error:', e);
    }
    return false;
  }
}

function loadDataset(){
  try {
    const raw = localStorage.getItem('nmc-dataset');
    if(!raw) return false;
    const d = JSON.parse(raw);
    if(!d || !Array.isArray(d.employees) || !Array.isArray(d.exams)) return false;
    EMPLOYEES = d.employees;
    EXAMS = d.exams;
    if(Array.isArray(d.colMeta))      COL_META       = d.colMeta;
    if(Array.isArray(d.allAreas))     ALL_AREAS      = d.allAreas;
    if(Array.isArray(d.allExamAreas)) ALL_EXAM_AREAS = d.allExamAreas;
    if(Array.isArray(d.allPuestos))   ALL_PUESTOS    = d.allPuestos;
    return true;
  } catch(e){
    console.warn('loadDataset error:', e);
    return false;
  }
}

function restaurarDatosOriginales(){
  const ok = confirm(
    '¿Restaurar los datos originales embebidos en el sistema?\n\n' +
    'Se descartará el Excel cargado y se volverá a la lista base.\n' +
    'Se conservan: empleados dados de alta manualmente, estatus y configuración.\n\n' +
    'Esta acción recarga la página.'
  );
  if(!ok) return;
  try { localStorage.removeItem('nmc-dataset'); } catch(e){}
  location.reload();
}

function _nextEmpId(){
  const nums = EMPLOYEES
    .map(e=>{ const m=e.id.match(/EMP-X-(\d+)/); return m?+m[1]:0; })
    .filter(n=>n>0);
  const next = nums.length ? Math.max(...nums)+1 : 1;
  return `EMP-X-${String(next).padStart(3,'0')}`;
}

function _nextEmpNumero(){
  const existing = new Set(EMPLOYEES.map(e=>e.numero));
  let n = EMPLOYEES.length + 1;
  while(existing.has(String(n))) n++;
  return String(n);
}

// Exam IDs para un puesto.
// Fuente de verdad (Fase 4): el catálogo de asignaciones de la capa de
// gestión (PUESTOS + ASSIGNMENTS). Si el puesto existe en el catálogo,
// sus exámenes son autoritativos (incluso si son 0). Solo si el puesto
// NO está en el catálogo se recurre al comportamiento previo (copiar de
// otro empleado del mismo puesto, o derivar de ex.aplica).
function _getExamIdsForPuesto(puesto, area){
  if(typeof examIdsForPuestoNameArea === 'function'){
    const ids = examIdsForPuestoNameArea(puesto, area);
    if(ids !== null) return [...new Set(ids)];   // catálogo autoritativo
  }
  const ref = EMPLOYEES.find(e=>e.puesto===puesto&&(e.exam_ids||[]).length>0);
  if(ref) return [...new Set(ref.exam_ids)];
  return EXAMS.filter(ex=>ex.aplica.some(m=>
    m.puesto.toUpperCase()===puesto.toUpperCase())).map(ex=>ex.id);
}

// ── ALTA ─────────────────────────────────────────────────────────
function openAltaPanel(){
  // Reset form
  ['alta-nombre','alta-email','alta-numero','alta-supervisor','alta-horario','alta-ingreso']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('alta-estatus').value='Pendiente';
  document.getElementById('alta-cert-cofc').value='';
  document.getElementById('alta-cert-examen').value='';
  document.getElementById('alta-error').style.display='none';
  document.getElementById('alta-exams-preview').style.display='none';

  // Set today's date as default
  document.getElementById('alta-ingreso').value = new Date().toISOString().slice(0,10);

  // Poblar áreas desde el CATÁLOGO (capa de gestión), en unión con las
  // áreas reales de empleados, para incluir puestos/áreas recién creados.
  const areaEl = document.getElementById('alta-area');
  areaEl.innerHTML = '<option value="">— Seleccionar —</option>';
  const catAreas = (typeof catalogAreas === 'function') ? catalogAreas() : [];
  const empAreas = [...new Set(EMPLOYEES.filter(e=>!e._manual||e.puesto).map(e=>e.area).filter(Boolean))];
  [...new Set([...catAreas, ...empAreas])].sort().forEach(a=>{
    const o=document.createElement('option'); o.value=a; o.textContent=a; areaEl.appendChild(o);
  });

  // Reset puesto
  document.getElementById('alta-puesto').innerHTML='<option value="">— Seleccionar área —</option>';

  _altaValidate();
  document.getElementById('alta-modal').classList.add('open');
}

function _altaAreaChange(){
  const area = document.getElementById('alta-area').value;
  const puestoEl = document.getElementById('alta-puesto');
  puestoEl.innerHTML = '<option value="">— Seleccionar puesto —</option>';
  if(!area){ puestoEl.innerHTML='<option value="">— Seleccionar área primero —</option>'; _altaValidate(); return; }

  // Puestos del CATÁLOGO para el área (unión con los de empleados reales)
  const catP = (typeof catalogPuestosForArea === 'function') ? catalogPuestosForArea(area) : [];
  const empP = EMPLOYEES.filter(e=>e.area===area&&e.puesto).map(e=>e.puesto);
  const puestos = [...new Set([...catP, ...empP])].sort();

  puestos.forEach(p=>{
    const o=document.createElement('option'); o.value=p; o.textContent=p; puestoEl.appendChild(o);
  });
  _altaValidate();
}

function _altaPuestoChange(){
  const puesto = document.getElementById('alta-puesto').value;
  const area   = document.getElementById('alta-area').value;
  const prev = document.getElementById('alta-exams-preview');
  if(!puesto){ prev.style.display='none'; _altaValidate(); return; }
  const ids = _getExamIdsForPuesto(puesto, area);
  document.getElementById('alta-exams-count').textContent = ids.length;
  prev.style.display = 'flex';
  _altaValidate();
}

function _altaValidate(){
  const nombre  = document.getElementById('alta-nombre').value.trim();
  const area    = document.getElementById('alta-area').value;
  const puesto  = document.getElementById('alta-puesto').value;
  const btn     = document.getElementById('alta-submit-btn');
  const ok = nombre && area && puesto;
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '.45';
  btn.style.cursor  = ok ? 'pointer' : 'not-allowed';
}

function submitAlta(){
  const nombre   = document.getElementById('alta-nombre').value.trim();
  const area     = document.getElementById('alta-area').value;
  const puesto   = document.getElementById('alta-puesto').value;
  const email    = document.getElementById('alta-email').value.trim()||'No hay numero';
  const numero   = document.getElementById('alta-numero').value.trim()||_nextEmpNumero();
  const sup      = document.getElementById('alta-supervisor').value.trim();
  const ingreso  = document.getElementById('alta-ingreso').value;
  const horario  = document.getElementById('alta-horario').value.trim();
  const estatus  = document.getElementById('alta-estatus').value;
  const certCofc = document.getElementById('alta-cert-cofc').value;
  const certExam = document.getElementById('alta-cert-examen').value;
  const errEl    = document.getElementById('alta-error');

  if(!nombre||!area||!puesto){
    errEl.textContent='Completa los campos obligatorios: Nombre, Área y Puesto.';
    errEl.style.display='block'; return;
  }

  // Verify nombre not duplicate
  if(EMPLOYEES.find(e=>e.nombre.toUpperCase()===nombre.toUpperCase())){
    errEl.textContent=`Ya existe un empleado con el nombre "${nombre}".`;
    errEl.style.display='block'; return;
  }

  errEl.style.display='none';

  const newEmp = {
    id:          _nextEmpId(),
    numero:      numero,
    nombre:      nombre,
    email:       email,
    puesto:      puesto,
    area:        area,
    supervisor:  sup,
    cert_cofc:   certCofc,
    cert_examen: certExam,
    puntaje:     0.2,
    estatus:     estatus,
    horario:     horario,
    ingreso:     ingreso,
    exam_ids:    _getExamIdsForPuesto(puesto, area),
    _manual:     true   // ← distingue de empleados del Excel
  };

  EMPLOYEES.push(newEmp);
  _saveExtraEmployees();
  _rebuildIndexes();
  buildAreaPuestoFilters(); // Rebuild dropdowns in case new area/puesto
  refreshAllKPIs();
  filterEmps();

  document.getElementById('alta-modal').classList.remove('open');
  showToast(`✓ Alta registrada: ${nombre} (${newEmp.id})`);
}

// ── BAJA ──────────────────────────────────────────────────────────
let _bajaTargetId = null;

function openBajaConfirm(id){
  _bajaTargetId = id;
  const e = EMPLOYEES.find(x=>x.id===id);
  if(!e) return;

  // Info del empleado
  document.getElementById('baja-info').innerHTML =
    `<strong>${esc(e.nombre)}</strong><br>
     <span style="color:var(--text3);font-size:.8rem">${esc(e.puesto)} · ${esc(e.area)}</span><br>
     <span style="font-size:.78rem;color:var(--text3)">${esc(e.id)}</span>`;

  // Opción eliminar: disponible para cualquier empleado. El borrado se
  // persiste (nmc-extra-employees para altas manuales; nmc-deleted-employees
  // + dataset para los del Excel) de modo que no reaparezcan al recargar.
  const elimOpt = document.getElementById('baja-tipo-elim');
  const elimLbl = document.getElementById('baja-lbl-elim');
  elimOpt.disabled = false;
  elimLbl.style.opacity = '1';
  elimLbl.style.cursor  = 'pointer';
  // Por seguridad, la opción por defecto siempre es la reversible (Inactivo)
  document.getElementById('baja-tipo-inact').checked = true;
  elimOpt.checked = false;

  _bajaTipoChange();
  document.getElementById('emp-modal').classList.remove('open'); // cierra modal empleado
  document.getElementById('baja-modal').classList.add('open');
}

function _bajaTipoChange(){
  const tipo = document.querySelector('input[name="baja-tipo"]:checked')?.value||'inactivo';
  const warn = document.getElementById('baja-elim-warning');
  warn.style.display = tipo==='eliminar' ? 'block' : 'none';

  // Resaltar opción seleccionada
  document.getElementById('baja-lbl-inact').style.borderColor =
    tipo==='inactivo' ? 'var(--yellow)' : 'var(--border2)';
  document.getElementById('baja-lbl-elim').style.borderColor =
    tipo==='eliminar' ? 'var(--red)' : 'var(--border2)';
}

function applyBaja(){
  const id   = _bajaTargetId;
  if(!id) return;
  const tipo = document.querySelector('input[name="baja-tipo"]:checked')?.value||'inactivo';
  const e    = EMPLOYEES.find(x=>x.id===id);
  if(!e){ document.getElementById('baja-modal').classList.remove('open'); return; }

  if(tipo==='eliminar'){
    // Eliminar del array en memoria
    const idx = EMPLOYEES.indexOf(e);
    if(idx>-1) EMPLOYEES.splice(idx,1);
    if(e._manual){
      // Alta manual: vive en nmc-extra-employees, basta regrabar
      _saveExtraEmployees();
    } else {
      // Empleado del Excel: registrar la baja y regrabar el dataset para
      // que la eliminación persista ante recargas y reimportaciones.
      _saveDeletedKey(_persistKey(e));
      try { saveDataset(); } catch(err){ console.warn('saveDataset baja:', err); }
    }
    showToast(`🗑 ${e.nombre} eliminado del sistema`);
  } else {
    // Marcar como Inactivo (soft baja) — usa el mecanismo existente de statuses
    e.estatus = 'Inactivo';
    // Persist in statuses override
    let saved={};
    try{ saved=JSON.parse(localStorage.getItem('nmc-employee-data')||'{}'); }catch{}
    if(!saved.statuses) saved.statuses={};
    saved.statuses[_persistKey(e)]='Inactivo';
    try{ localStorage.setItem('nmc-employee-data',JSON.stringify(saved)); }catch{}
    showToast(`⏸ ${e.nombre} marcado como Inactivo`);
  }

  _bajaTargetId = null;
  document.getElementById('baja-modal').classList.remove('open');
  _rebuildIndexes();
  refreshAllKPIs();
  filterEmps();
}
// ══ /ALTA-BAJA ══════════════════════════════════════════════════

// ════════════════════════════════════════════════════════
// KEBAB MENU
// ════════════════════════════════════════════════════════

// ── SETTINGS PERSISTENCE ────────────────────────────────────────────────────
function _collectSettings(){
  const cs = getComputedStyle(document.documentElement);
  const el = document.documentElement;
  return {
    // CSS vars overrides (only store if manually set)
    css: {
      '--fh'      : el.style.getPropertyValue('--fh'),
      '--fb'      : el.style.getPropertyValue('--fb'),
      '--fps'     : el.style.getPropertyValue('--fps'),
      '--ft'      : el.style.getPropertyValue('--ft'),
      '--accent'  : el.style.getPropertyValue('--accent'),
      '--accent2' : el.style.getPropertyValue('--accent2'),
      '--ag'      : el.style.getPropertyValue('--ag'),
      '--bg'      : el.style.getPropertyValue('--bg'),
      '--bg2'     : el.style.getPropertyValue('--bg2'),
      '--bg3'     : el.style.getPropertyValue('--bg3'),
      '--th-bg'   : el.style.getPropertyValue('--th-bg'),
      '--th-color': el.style.getPropertyValue('--th-color'),
      '--logo-h'  : el.style.getPropertyValue('--logo-h'),
      '--logo-w'  : el.style.getPropertyValue('--logo-w'),
    },
    // Per-view th/td states
    thViews : JSON.parse(JSON.stringify(_thViews)),
    tdViews : JSON.parse(JSON.stringify(_tdViews)),
    // Chart types
    chartTypes: JSON.parse(JSON.stringify(CHART_TYPES)),
    // Slider values
    sliders: {
      'fmt-kpi-sz'   : (document.getElementById('fmt-kpi-sz')||{}).value,
      'fmt-bg-depth' : (document.getElementById('fmt-bg-depth')||{}).value,
      'fmt-bg-tint'  : (document.getElementById('fmt-bg-tint') ||{}).value,
    }
  };
}

function saveSettings(){
  const settings = _collectSettings();
  try {
    localStorage.setItem('nmc-app-settings', JSON.stringify(settings));
    showToast('💾 Cambios guardados correctamente');
  } catch(e){
    showToast('⚠️ No se pudieron guardar los ajustes');
  }
}

function loadSettings(){
  let raw = null;
  try { raw = localStorage.getItem('nmc-app-settings'); } catch(e){}
  if(!raw) return;

  try {
    const s = JSON.parse(raw);
    const el = document.documentElement;

    // Restore CSS vars
    Object.entries(s.css||{}).forEach(([k,v]) => { if(v) el.style.setProperty(k, v); });

    // Restore th/td views
    if(s.thViews) Object.assign(_thViews, s.thViews);
    if(s.tdViews) Object.assign(_tdViews, s.tdViews);

    // Restore chart types
    if(s.chartTypes){
      Object.keys(s.chartTypes).forEach(group => {
        Object.keys(s.chartTypes[group]).forEach(key => {
          if(CHART_TYPES[group]?.[key]) CHART_TYPES[group][key].current = s.chartTypes[group][key].current;
        });
      });
    }

    // Re-apply th/td scoped vars to DOM
    ['exams','employees','matrix'].forEach(v => {
      const thCfg = _thViews[v]; const tdCfg = _tdViews[v];
      const thEl  = document.getElementById(thCfg.viewId);
      const tdEl  = document.getElementById(tdCfg.viewId);
      if(thEl){
        thEl.style.setProperty('--th-align',     thCfg.align);
        thEl.style.setProperty('--th-weight',    thCfg.weight);
        thEl.style.setProperty('--th-size',      (parseInt(thCfg.size)/16).toFixed(3)+'rem');
        thEl.style.setProperty('--th-transform', thCfg.transform);
      }
      if(tdEl){
        tdEl.style.setProperty('--td-align',     tdCfg.align);
        tdEl.style.setProperty('--td-weight',    tdCfg.weight);
        tdEl.style.setProperty('--td-size',      (parseInt(tdCfg.size)/16).toFixed(3)+'rem');
        tdEl.style.setProperty('--td-transform', tdCfg.transform);
      }
    });

    // Restore slider values + labels
    Object.entries(s.sliders||{}).forEach(([id, val]) => {
      const el2 = document.getElementById(id); if(el2 && val) el2.value = val;
    });

    // Restore bg-tint if saved
    const _savedTint = s.sliders?.['fmt-bg-tint'];
    if(_savedTint){
      const _ti = document.getElementById('fmt-bg-tint');
      if(_ti) try { _ti.value = _savedTint; } catch(e){}
    }
    // Re-apply depth with restored tint
    const _depthVal = s.sliders?.['fmt-bg-depth'];
    if(_depthVal !== undefined) applyBgDepth(_depthVal);

    // Re-render dashboard with saved chart types — always, regardless of which
    // view is active, since the dashboard's DOM is built once and only
    // refreshed on view-switch when explicitly re-rendered. Without this,
    // settings saved via "Guardar cambios" only appear after some other
    // event happens to call renderDashboard() again.
    renderDashboard();

  } catch(e){ console.warn('loadSettings error:', e); }
}

function toggleKebab(){
  const m=document.getElementById('kebab-menu');
  m.style.display=m.style.display==='none'?'block':'none';
}
function closeKebab(){
  document.getElementById('kebab-menu').style.display='none';
}
document.addEventListener('click',e=>{
  const wrap=document.getElementById('kebab-wrap');
  if(wrap&&!wrap.contains(e.target)) closeKebab();
});

// ════════════════════════════════════════════════════════
// OUTLOOK COMPOSE DEEP-LINK
// Builds a compose URL for Outlook Web App (office365.us)
// ════════════════════════════════════════════════════════
// Builds SHORT compose URL (to + subject only — no body to avoid HTTP 414)
function buildOutlookUrl(emails, subject){
  const base = 'https://outlook.office365.us/mail/deeplink/compose';
  const to   = emails.slice(0, 50).join(';');
  return `${base}?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}`;
}

// Opens Outlook compose + copies HTML body to clipboard so user can Ctrl+V

async function openOutlookCompose(emails, subject, htmlBody){
  if(!emails.length){ showToast('⚠️ No hay destinatarios con correo válido'); return; }
  try {
    const blob = new Blob([htmlBody], {type:'text/html'});
    await navigator.clipboard.write([new ClipboardItem({'text/html': blob})]);
  } catch(e) {
    try { await navigator.clipboard.writeText(htmlBody.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()); } catch(_){}
  }
  window.open(buildOutlookUrl(emails, subject), '_blank');
  showToast('📋 Cuerpo copiado — pega en Outlook con Ctrl+V', 5000);
}

// ════════════════════════════════════════════════════════════════
// MATRIZ EXÁMENES × PUESTOS (copiable con Ctrl+V)
// Filas = exámenes (con hipervínculo), columnas = puestos agrupados por
// área, ✓ donde el examen aplica al puesto. Se copia como text/html para
// pegar con formato e hipervínculos en Outlook, Word o Excel.
// Condicionada por el filtro activo del correo: solo los exámenes y
// puestos del filtro (área / puesto) seleccionado.
// ════════════════════════════════════════════════════════════════
function buildExamPuestoMatrixHtml(examsArg, paresArg){
  const examenes = (examsArg && examsArg.length) ? examsArg : EXAMS;
  // pares = [{area, puesto}] ya filtrados por el llamador (copyExamPuestoMatrix).
  // Si no se pasan, se derivan de todos los exámenes (sin filtro).
  let pares = paresArg;
  if(!pares){
    pares = [];
    const vistos = new Set();
    examenes.forEach(ex => (ex.aplica||[]).forEach(p => {
      const area=p.area||'(Sin área)', puesto=(p.puesto||'').trim();
      const k=area+'||'+puesto;
      if(!vistos.has(k)){ vistos.add(k); pares.push({area, puesto}); }
    }));
    pares.sort((a,b)=> a.area.localeCompare(b.area) || a.puesto.localeCompare(b.puesto));
  }

  // Set de búsqueda rápida "área||puesto" por examen
  const examTienePuesto = (ex, area, puesto) =>
    (ex.aplica||[]).some(p => (p.area||'(Sin área)')===area && (p.puesto||'').trim()===puesto);

  // Encabezado superior: áreas con colspan
  const areaSpans = [];
  let i=0;
  while(i<pares.length){
    const area=pares[i].area; let n=0;
    while(i+n<pares.length && pares[i+n].area===area) n++;
    areaSpans.push({area, n}); i+=n;
  }

  const thBase = 'padding:5px 7px;border:1px solid #cad5e8;font-size:10px;font-weight:700;color:#ffffff;background:#1b4f8a;text-align:center';
  const thArea = 'padding:5px 7px;border:1px solid #cad5e8;font-size:10px;font-weight:700;color:#ffffff;background:#13395f;text-align:center;text-transform:uppercase;letter-spacing:.04em';
  const tdEx   = 'padding:5px 8px;border:1px solid #cad5e8;font-size:11px;color:#1b2a4a;white-space:nowrap';
  const tdChk  = 'padding:5px 7px;border:1px solid #cad5e8;font-size:12px;text-align:center;color:#2e7d32;font-weight:700';
  const tdEmpty= 'padding:5px 7px;border:1px solid #e3e9f4;font-size:12px;text-align:center;color:#c7cfe0';

  // Fila 1: áreas; Fila 2: puestos
  const headArea = `<tr>
    <th rowspan="2" style="${thBase};text-align:left;min-width:240px">Examen</th>
    ${areaSpans.map(a=>`<th colspan="${a.n}" style="${thArea}">${esc(a.area)}</th>`).join('')}
  </tr>`;
  const headPuesto = `<tr>
    ${pares.map(p=>`<th style="${thBase};font-weight:600;writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;max-height:160px">${esc(p.puesto)}</th>`).join('')}
  </tr>`;

  const rows = examenes.map(ex=>{
    const examCell = safeUrl(ex.url)
      ? `<strong style="color:#d2531a">${esc(ex.id)}</strong> · <a href="${esc(safeUrl(ex.url))}" target="_blank" rel="noopener noreferrer" style="color:#1b4f8a;text-decoration:none">${esc(ex.tema)}</a>`
      : `<strong style="color:#d2531a">${esc(ex.id)}</strong> · ${esc(ex.tema)}`;
    const cells = pares.map(p =>
      examTienePuesto(ex, p.area, p.puesto)
        ? `<td style="${tdChk}">✓</td>`
        : `<td style="${tdEmpty}"></td>`
    ).join('');
    return `<tr><td style="${tdEx}">${examCell}</td>${cells}</tr>`;
  }).join('');

  return `<div style="font-family:Segoe UI,Arial,sans-serif">
  <div style="font-size:14px;font-weight:700;color:#1b4f8a;margin-bottom:6px">Matriz de Exámenes por Puesto — NMC</div>
  <div style="font-size:11px;color:#4a5878;margin-bottom:10px">${examenes.length} exámenes × ${pares.length} puestos · ✓ indica que el examen aplica al puesto · el nombre del examen es un hipervínculo</div>
  <table style="border-collapse:collapse;background:#ffffff">
    <thead>${headArea}${headPuesto}</thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ════════════════════════════════════════════════════════════════
// ALCANCE FILTRADO COMPARTIDO (correo + matriz)
// Devuelve {examenes, pares} acotados al área/puesto activo, usando el
// campo 'aplica' del examen y los puestos reales de los empleados objetivo.
// Tanto el cuerpo del correo (clipboard) como la matriz usan ESTO, para que
// el clipboard liste exactamente los exámenes de la matriz filtrada y no la
// sumatoria de filtExams.
// ════════════════════════════════════════════════════════════════
function getMatrizScope(areaFiltro, puestoFiltro, baseExams){
  const examenesBase = (baseExams && baseExams.length) ? baseExams
    : ((typeof filtExams!=='undefined' && filtExams.length) ? filtExams : EXAMS);
  const hayFiltro = !!(areaFiltro || puestoFiltro);
  let puestosSet;
  if(hayFiltro && typeof getFilteredEmpTargets==='function'){
    const targets = getFilteredEmpTargets(areaFiltro, puestoFiltro);
    puestosSet = new Set(targets.map(e=>(e.puesto||'').trim()).filter(Boolean));
  }
  const pares = [];
  const vistos = new Set();
  examenesBase.forEach(ex => (ex.aplica||[]).forEach(p => {
    const area = p.area||'(Sin área)';
    const puesto = (p.puesto||'').trim();
    if(puestoFiltro && puesto!==puestoFiltro) return;
    if(puestosSet && !puestosSet.has(puesto)) return;
    const k = area+'||'+puesto;
    if(!vistos.has(k)){ vistos.add(k); pares.push({area, puesto}); }
  }));
  pares.sort((a,b)=> a.area.localeCompare(b.area) || a.puesto.localeCompare(b.puesto));

  const enPares = new Set(pares.map(p=>p.area+'||'+p.puesto));
  const examenes = examenesBase.filter(ex =>
    (ex.aplica||[]).some(a => enPares.has((a.area||'(Sin área)')+'||'+(a.puesto||'').trim()))
  );
  return { examenes, pares };
}

async function copyExamPuestoMatrix(){
  if(!EXAMS.length){ showToast('⚠️ No hay exámenes cargados'); return; }

  // Mismo alcance filtrado que usa el cuerpo del correo.
  const areaEl   = document.getElementById('ex-area');
  const puestoEl = document.getElementById('ex-puesto');
  const areaFiltro   = areaEl   ? (areaEl.value||'')   : '';
  const puestoFiltro = puestoEl ? (puestoEl.value||'') : '';

  const { examenes: examenesMatriz, pares } = getMatrizScope(areaFiltro, puestoFiltro);

  if(!pares.length){ showToast('⚠️ El filtro actual no tiene puestos con exámenes que mostrar'); return; }
  if(!examenesMatriz.length){ showToast('⚠️ Ningún examen aplica a los puestos del filtro actual'); return; }

  const html = buildExamPuestoMatrixHtml(examenesMatriz, pares);

  const tsvHead = ['Examen', ...pares.map(p=>p.puesto)].join('\t');
  const tsvRows = examenesMatriz.map(ex=>{
    const cells = pares.map(p => (ex.aplica||[]).some(a=>(a.puesto||'').trim()===p.puesto && (a.area||'(Sin área)')===p.area) ? '✓' : '');
    return [`${ex.id} ${ex.tema}`, ...cells].join('\t');
  });
  const tsv = [tsvHead, ...tsvRows].join('\n');

  const alcance = `${examenesMatriz.length} examen(es) × ${pares.length} puesto(s)`;
  try {
    const blobHtml = new Blob([html], {type:'text/html'});
    const blobText = new Blob([tsv],  {type:'text/plain'});
    await navigator.clipboard.write([new ClipboardItem({'text/html':blobHtml, 'text/plain':blobText})]);
    showToast(`📊 Matriz copiada (${alcance}) — pega con Ctrl+V en Outlook, Word o Excel`, 5000);
  } catch(e) {
    try {
      await navigator.clipboard.writeText(tsv);
      showToast(`📊 Matriz copiada como texto (${alcance}). Para formato con ✓, usa HTTPS o localhost`, 6000);
    } catch(_){
      showToast('⚠️ No se pudo copiar al portapapeles en este contexto (prueba en HTTPS o localhost)', 6000);
    }
  }
}

// Builds an HTML email body with exam hyperlinks
function buildExamEmailHtml(intro, exams, filterDesc=''){
  // Fecha límite = fecha de emisión del correo (hoy) + 30 días
  const _hoy = new Date();
  const _limite = new Date(_hoy.getTime() + 30*24*60*60*1000);
  const _fmtFecha = d => d.toLocaleDateString('es-MX', {day:'2-digit', month:'long', year:'numeric'});
  const fechaEmision = _fmtFecha(_hoy);
  const fechaLimite  = _fmtFecha(_limite);
  const examRows = exams.map(ex => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #cad5e8;font-size:13px;color:#1b2a4a;white-space:nowrap">
        <strong style="color:#d2531a">${esc(ex.id)}</strong>
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #cad5e8;font-size:13px;color:#1b2a4a">
        ${esc(ex.tema)}
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #cad5e8;text-align:center">
        ${safeUrl(ex.url)
          ? `<a href="${esc(safeUrl(ex.url))}" style="color:#d2531a;font-weight:600;font-size:12px;text-decoration:none">🔗 Ir al examen</a>`
          : `<span style="color:#6b7494;font-size:12px">Sin link</span>`}
      </td>
    </tr>`).join('');

  return `<div style="font-family:Segoe UI,Arial,sans-serif;background:#edf2f9;padding:24px;border-radius:10px;max-width:680px">
  <div style="border-left:4px solid #d2531a;padding-left:14px;margin-bottom:20px">
    <h2 style="margin:0;color:#1b4f8a;font-size:18px">Recordatorio de Certificación</h2>
    ${filterDesc?`<p style="margin:4px 0 0;color:#4a5878;font-size:13px">${esc(filterDesc)}</p>`:''}
  </div>
  <p style="color:#34405c;font-size:14px;margin-bottom:18px">${intro}</p>
  <table style="width:100%;border-collapse:collapse;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #cad5e8">
    <thead>
      <tr style="background:#1b4f8a">
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#ffffff;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap">ID</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#ffffff;text-transform:uppercase;letter-spacing:.08em">Tema de Entrenamiento</th>
        <th style="padding:8px 10px;text-align:center;font-size:11px;color:#ffffff;text-transform:uppercase;letter-spacing:.08em">Link</th>
      </tr>
    </thead>
    <tbody>${examRows}</tbody>
  </table>
  <div style="margin-top:20px;padding:12px 14px;background:#fff4ec;border-left:4px solid #d2531a;border-radius:6px">
    <p style="margin:0;color:#34405c;font-size:13px">Por favor complete los exámenes a más tardar el <strong style="color:#d2531a">${fechaLimite}</strong> (30 días a partir de la fecha de emisión de este correo).</p>
  </div>
  <p style="color:#4a5878;font-size:12px;margin-top:16px">Fecha de emisión: ${fechaEmision}<br>NMC Training System</p>
</div>`;
}

function showToast(msg, duration=3200){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), duration);
}

// ═══════════════════════════════════════════════════════════════════
// CONSTRUCTOR DE REPORTE PDF — Directorio de Empleados
// Arma un PDF a la medida a partir de la lógica/datos disponibles:
// filtros (área, puesto, estatus, certificación), columnas seleccionables,
// orientación, tamaño, orden y resumen.
// ═══════════════════════════════════════════════════════════════════

// Columnas disponibles: [key, etiqueta, valor(e)]. El orden aquí es el orden
// en que aparecen en el PDF; el usuario decide cuáles incluir con checkboxes.
const REPORT_COLUMNS = [
  { key:'numero',     label:'Número',                 def:true,  val:e=>e.numero||'' },
  { key:'nombre',     label:'Nombre',                 def:true,  val:e=>fmtName(e.nombre) },
  { key:'puesto',     label:'Puesto',                 def:true,  val:e=>e.puesto||'' },
  { key:'area',       label:'Área',                   def:true,  val:e=>e.area||'' },
  { key:'supervisor', label:'Supervisor',             def:false, val:e=>e.supervisor||'' },
  { key:'email',      label:'Email',                  def:false, val:e=>(e.email&&e.email!=='No hay numero')?e.email:'' },
  { key:'horario',    label:'Horario',                def:false, val:e=>e.horario||'' },
  { key:'cert_cofc',  label:'Skill Assessment',       def:false, val:e=>e.cert_cofc||'' },
  { key:'cert_examen',label:'Knowledge Cert.',        def:true,  val:e=>e.cert_examen||'' },
  { key:'estatus',    label:'Estatus',                def:true,  val:e=>e.estatus||'' },
  { key:'exams',      label:'Exámenes aplicables',    def:false, val:e=>String((e.exam_ids||[]).length) },
];

// Transliteración a ASCII: jsPDF (Helvetica) no soporta Unicode.
function _repPdfText(s){
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/Ñ/g,'N').replace(/ñ/g,'n')
    .replace(/[“”]/g,'"').replace(/[‘’]/g,"'")
    .replace(/–/g,'-').replace(/—/g,'-')
    .replace(/[^\x20-\x7E]/g,'');
}

function openReportBuilder(){
  // Poblar áreas (unión catálogo + empleados reales, igual que el alta)
  const areaEl = document.getElementById('rep-area');
  areaEl.innerHTML = '<option value="">Todas las áreas</option>';
  const areas = [...new Set(EMPLOYEES.map(e=>e.area).filter(Boolean))].sort();
  areas.forEach(a=>{ const o=document.createElement('option'); o.value=a; o.textContent=a; areaEl.appendChild(o); });
  _repAreaChange();

  // Reset filtros/opciones a valores por defecto
  document.getElementById('rep-status').value='';
  document.getElementById('rep-cert').value='';
  document.getElementById('rep-use-current').checked=false;

  // Construir checkboxes de columnas
  const colsWrap=document.getElementById('rep-cols');
  colsWrap.innerHTML=REPORT_COLUMNS.map(c=>
    `<label style="display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:var(--text2);cursor:pointer">
       <input type="checkbox" class="rep-col-chk" value="${esc(c.key)}" ${c.def?'checked':''}> ${esc(c.label)}
     </label>`).join('');

  _repUpdateCount();
  document.getElementById('report-modal').classList.add('open');
}

function _repAreaChange(){
  const area=document.getElementById('rep-area').value;
  const puestoEl=document.getElementById('rep-puesto');
  puestoEl.innerHTML='<option value="">Todos los puestos</option>';
  const src = area ? EMPLOYEES.filter(e=>e.area===area) : EMPLOYEES;
  [...new Set(src.map(e=>e.puesto).filter(Boolean))].sort().forEach(p=>{
    const o=document.createElement('option'); o.value=p; o.textContent=p; puestoEl.appendChild(o);
  });
}

// Copia el filtro activo del directorio a los controles del modal.
function _repSyncFromDirectory(){
  const use=document.getElementById('rep-use-current').checked;
  const ids=['rep-area','rep-puesto','rep-status','rep-cert'];
  if(use){
    document.getElementById('rep-area').value=document.getElementById('emp-area').value||'';
    _repAreaChange();
    document.getElementById('rep-puesto').value=document.getElementById('emp-puesto').value||'';
    document.getElementById('rep-status').value=document.getElementById('emp-status').value||'';
    document.getElementById('rep-cert').value=document.getElementById('emp-cert').value||'';
    ids.forEach(id=>document.getElementById(id).disabled=true);
  } else {
    ids.forEach(id=>document.getElementById(id).disabled=false);
  }
  _repUpdateCount();
}

// Aplica los filtros del modal y devuelve la lista de empleados objetivo.
function _repFilteredEmps(){
  const area=document.getElementById('rep-area').value;
  const puesto=document.getElementById('rep-puesto').value;
  const status=document.getElementById('rep-status').value;
  const cert=document.getElementById('rep-cert').value;
  return EMPLOYEES.filter(e=>{
    const mA=!area||e.area===area;
    const mP=!puesto||e.puesto===puesto;
    const mS=!status||(status==='__INACTIVOS__'?(e.estatus!=='Aprobado'&&e.estatus!=='Pendiente'):e.estatus===status);
    const mC=!cert||(cert==='Aplica'?e.cert_examen==='Aplica':e.cert_examen!=='Aplica');
    return mA&&mP&&mS&&mC;
  });
}

function _repUpdateCount(){
  const n=_repFilteredEmps().length;
  const el=document.getElementById('rep-count');
  el.textContent=`${n} empleado${n===1?'':'s'} coinciden con los filtros seleccionados`;
}

function generateEmpReport(){
  const J=(window.jspdf&&window.jspdf.jsPDF)?window.jspdf.jsPDF:null;
  if(!J){ alert('⚠️ No se pudo cargar la librería de PDF (requiere conexión a internet la primera vez).'); return; }

  const emps=_repFilteredEmps();
  if(!emps.length){ showToast('⚠️ No hay empleados que coincidan con los filtros'); return; }

  // Columnas seleccionadas (respetando el orden de REPORT_COLUMNS)
  const chosen=new Set([...document.querySelectorAll('.rep-col-chk:checked')].map(c=>c.value));
  const cols=REPORT_COLUMNS.filter(c=>chosen.has(c.key));
  if(!cols.length){ showToast('⚠️ Selecciona al menos una columna'); return; }

  // Orden
  const sortKey=document.getElementById('rep-sort').value;
  const sorted=[...emps].sort((a,b)=>{
    const va=String(sortKey==='nombre'?fmtName(a.nombre):(a[sortKey]||'')).toLowerCase();
    const vb=String(sortKey==='nombre'?fmtName(b.nombre):(b[sortKey]||'')).toLowerCase();
    if(sortKey==='numero') return (parseInt(a.numero)||0)-(parseInt(b.numero)||0);
    return va<vb?-1:va>vb?1:0;
  });

  const orient=document.getElementById('rep-orient').value;
  const size=document.getElementById('rep-size').value;
  const title=document.getElementById('rep-title').value.trim()||'Directorio de Empleados';
  const withSummary=document.getElementById('rep-summary').checked;
  const withDate=document.getElementById('rep-date').checked;

  const doc=new J({orientation:orient,unit:'pt',format:size});
  const pageW=doc.internal.pageSize.getWidth();

  // Encabezado
  doc.setFontSize(15); doc.setTextColor(27,79,138);
  doc.text(_repPdfText('Sistema de Entrenamiento NMC'),40,42);
  doc.setFontSize(12); doc.setTextColor(40);
  doc.text(_repPdfText(title),40,62);

  let y=78;
  doc.setFontSize(9); doc.setTextColor(90);
  if(withDate){
    doc.text(_repPdfText(`Generado: ${new Date().toLocaleString()}   ·   Registros: ${sorted.length}`),40,y);
    y+=13;
  }
  // Descripción de filtros aplicados
  const area=document.getElementById('rep-area').value;
  const puesto=document.getElementById('rep-puesto').value;
  const status=document.getElementById('rep-status').value;
  const cert=document.getElementById('rep-cert').value;
  const filtros=[
    area?('Area: '+area):'Todas las areas',
    puesto?('Puesto: '+puesto):null,
    status?('Estatus: '+(status==='__INACTIVOS__'?'Inactivos':status)):null,
    cert?('Knowledge Cert.: '+(cert==='Aplica'?'Aplica':'N/A')):null,
  ].filter(Boolean).map(_repPdfText).join('   |   ');
  doc.text(_repPdfText('Filtros: '+filtros),40,y); y+=13;

  // Resumen por estatus (opcional)
  if(withSummary){
    const byStatus={};
    sorted.forEach(e=>{ byStatus[e.estatus]=(byStatus[e.estatus]||0)+1; });
    const resumen=Object.entries(byStatus).map(([k,v])=>`${_repPdfText(k)}: ${v}`).join('   ·   ');
    doc.setTextColor(27,79,138);
    doc.text(_repPdfText('Resumen — '+resumen),40,y); y+=13;
  }

  // Tabla
  doc.autoTable({
    startY:y+6,
    head:[cols.map(c=>_repPdfText(c.label))],
    body:sorted.map(e=>cols.map(c=>_repPdfText(c.val(e)))),
    styles:{fontSize:7.5,cellPadding:3,overflow:'linebreak'},
    headStyles:{fillColor:[27,79,138],textColor:255,fontSize:8},
    alternateRowStyles:{fillColor:[237,242,249]},
    margin:{left:40,right:40},
    didDrawPage:d=>{
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Pagina ${doc.internal.getNumberOfPages()}`,d.settings.margin.left,doc.internal.pageSize.getHeight()-14);
      doc.text(_repPdfText('Sistema de Entrenamiento NMC'),pageW-40,doc.internal.pageSize.getHeight()-14,{align:'right'});
    }
  });

  const safeTitle=_repPdfText(title).replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'_')||'reporte';
  doc.save(`${safeTitle}_${new Date().toISOString().slice(0,10)}.pdf`);
  showToast('✅ Reporte PDF generado');
}
