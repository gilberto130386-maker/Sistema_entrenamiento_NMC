// ════════════════════════════════════════════════════════════════
// ORGANIGRAMA — pestaña 🏢 de la Capa de Gestión
// ----------------------------------------------------------------
// Los nodos son PUESTOS del catálogo (PUESTOS[] de gestion.js) con el
// nombre de la(s) persona(s) que los ocupan. La jerarquía vive en el
// propio puesto, así que se persiste en localStorage['nmc-puestos'] vía
// savePuestos() y entra al Respaldo sin trabajo extra. Campos opcionales:
//   reportaA   — id del puesto superior capturado A MANO (gana sobre el
//                automático)
//   orgRaiz    — true: es raíz de un organigrama (no reporta a nadie)
//   orgSuelto  — true: sacado del organigrama a mano (sin jefe automático)
//   nivel      — clave de ORG_NIVELES (color del nodo)
//   titular    — nombre capturado a mano; si falta se toma del padrón
//   plazas, turno, descripcion, responsabilidades, requisitos
//
// Dos vistas: 🏭 Planta (todos los puestos) y 🧩 Por área (solo los de
// un área; si el jefe está en otra área se indica arriba del nodo).
// Sin captura manual, "Reporta a" se toma AUTOMÁTICAMENTE del supervisor
// que el padrón asigna al personal del puesto (ver _orgGraph).
// Un puesto sin jefe, sin subordinados y sin orgRaiz queda "sin ubicar"
// en la bandeja inferior, desde donde se arrastra al organigrama.
// ════════════════════════════════════════════════════════════════

const ORG_NIVELES = [
  { key:'gerencia',  label:'Gerencia / Dirección',   fg:'#7f6000', bg:'#fff2cc', bd:'#bf9000' },
  { key:'jefatura',  label:'Jefatura / Supervisión', fg:'#a5490c', bg:'#fce4d6', bd:'#c55a11' },
  { key:'staff',     label:'Ingeniería / Staff',     fg:'#1f5c70', bg:'#ddebf2', bd:'#3a7f97' },
  { key:'lider',     label:'Líder / Lead',           fg:'#4f6228', bg:'#e2efda', bd:'#70883a' },
  { key:'operacion', label:'Operación',              fg:'#4b3b6b', bg:'#e8e3f1', bd:'#6f5c94' },
  { key:'soporte',   label:'Soporte / Administrativo', fg:'#44546a', bg:'#e7ecf3', bd:'#8497b0' }
];
const _ORG_NIVEL_IDX = Object.fromEntries(ORG_NIVELES.map((n,i) => [n.key, i]));

// ── Estado de la vista (solo en memoria) ──────────────────────────
let _orgVista = 'planta';      // 'planta' | 'area'
let _orgArea  = '';
let _orgZoom  = 1;
let _orgQ     = '';
const _orgCollapsed = new Set();

// ── Helpers de datos ──────────────────────────────────────────────
// Nivel sugerido por el nombre del puesto cuando no se ha capturado.
function _orgNivelAuto(nombre){
  const n = _normNombre(nombre);
  if(/GERENTE|MANAGER|DIRECTOR/.test(n))                                   return 'gerencia';
  if(/LIDER|LÍDER|\bLEAD\b|JEFE DE LINEA|ENTRENADOR/.test(n))              return 'lider';
  if(/SUPERVISOR|COORDINADOR|JEFE/.test(n))                                return 'jefatura';
  if(/INGENIER|ENGINEER|PLANNER|ANALISTA|CONTADOR|RECLUTADOR|PROGRAMADOR|ESPECIALISTA/.test(n)) return 'staff';
  if(/OPERADOR|BUILDER|INSPECTOR|TECNICO|TÉCNICO|MATERIALISTA|MOLD MAKER|SET UP/.test(n))       return 'operacion';
  return 'soporte';
}
function _orgNivel(p){
  const k = p.nivel && _ORG_NIVEL_IDX[p.nivel] !== undefined ? p.nivel : _orgNivelAuto(p.nombre);
  return ORG_NIVELES[_ORG_NIVEL_IDX[k]];
}
// Personal activo del padrón en el puesto (misma regla que el filtro
// "inactivos" del directorio: activo = Aprobado o Pendiente).
function _orgEmpleados(p){
  const k = _puestoKey(p.area, p.nombre);
  return (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : [])
    .filter(e => _puestoKey(e.area, e.puesto) === k && (e.estatus === 'Aprobado' || e.estatus === 'Pendiente'));
}
// Texto principal del nodo: titular capturado > persona del padrón >
// "N personas" > Vacante.
function _orgTitular(p, emps){
  if(String(p.titular||'').trim()) return { texto:p.titular.trim(), vacante:false };
  if(emps.length === 1) return { texto:emps[0].nombre, vacante:false };
  if(emps.length > 1)   return { texto:`${emps.length} personas`, vacante:false };
  return { texto:'Vacante', vacante:true };
}
function _orgIniciales(s){
  const w = String(s||'').trim().split(/\s+/).filter(x => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(x));
  return ((w[0]||'?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
}
function _orgById(){ return new Map(PUESTOS.map(p => [p.id, p])); }

// ── "Reporta a" automático desde el supervisor del padrón ─────────
// El padrón guarda al empleado como "APELLIDOS, NOMBRES" y al supervisor
// como "NOMBRE APELLIDO" ("CAMPILLO MORALES, EMMANUEL" ↔ "EMMANUEL
// CAMPILLO"), así que se comparan por palabras, sin acentos. El jefe de
// un puesto es el puesto del supervisor que más personas del puesto
// tienen asignado. Un "Reporta a" capturado a mano siempre gana.
function _orgToks(s){
  return String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^A-Z]+/).filter(Boolean);
}
// Puntaje de coincidencia supervisor ↔ nombre (0 = no coincide). Cada
// palabra del supervisor debe estar en el nombre (una inicial basta con
// la primera letra). Con formato "APELLIDOS, NOMBRES" exige al menos un
// apellido y un nombre, y desempata por primer apellido / primer nombre
// ("ANGEL HERNANDEZ" → HERNANDEZ ALTAMIRANO, ANGEL y no ENRIQUEZ
// HERNANDEZ, MIGUEL ANGEL).
function _orgNameScore(sup, nombre){
  const st = _orgToks(sup);
  if(!st.length) return 0;
  const n = String(nombre||'');
  const ci = n.indexOf(',');
  const ap = ci >= 0 ? _orgToks(n.slice(0, ci)) : null;
  const no = ci >= 0 ? _orgToks(n.slice(ci + 1)) : _orgToks(n);
  const full = (ap || []).concat(no);
  for(const t of st){
    if(t.length === 1 ? !full.some(x => x[0] === t) : !full.includes(t)) return 0;
  }
  const big = st.filter(t => t.length > 1);
  let score = big.length;
  if(ap){
    if(!big.some(t => ap.includes(t)) || !big.some(t => no.includes(t))) return 0;
    if(big.includes(ap[0])) score += 2;
    if(big.includes(no[0])) score += 2;
  }
  return score;
}
// Supervisor → puesto del catálogo. Primero un titular capturado a mano
// (sirve para jefes que no están en el padrón); luego el padrón. Si dos
// personas empatan, no se adivina.
function _orgResolveSupervisor(sup, cache){
  const key = _orgToks(sup).join(' ');
  if(!key) return { puesto:null, motivo:'vacío' };
  if(cache.has(key)) return cache.get(key);
  const best = (cands) => {
    let top = 0, hits = [];
    cands.forEach(([obj, nombre]) => {
      const s = _orgNameScore(sup, nombre);
      if(s > top){ top = s; hits = [obj]; } else if(s && s === top) hits.push(obj);
    });
    return hits;
  };
  let r;
  const tit = best(PUESTOS.filter(p => String(p.titular||'').trim() && !p.orgSuelto).map(p => [p, p.titular]));
  if(tit.length === 1) r = { puesto:tit[0], motivo:'titular' };
  else {
    const emps = best((typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []).map(e => [e, e.nombre]));
    if(emps.length > 1)       r = { puesto:null, motivo:'ambiguo', personas:emps.map(e => e.nombre) };
    else if(!emps.length)     r = { puesto:null, motivo:'no está en el padrón' };
    else {
      const e = emps[0];
      const p = _findPuesto(e.area, e.puesto);
      r = p && !p.orgSuelto ? { puesto:p, motivo:'padrón', persona:e.nombre }
                            : { puesto:null, motivo:p ? 'su puesto está fuera del organigrama' : 'su puesto no está en el catálogo', persona:e.nombre };
    }
  }
  cache.set(key, r);
  return r;
}

// Votos de un puesto: cada persona activa aporta el puesto de su
// supervisor. Gana el más votado (empate: el de nivel más alto).
function _orgAutoVotes(p, cache, byId){
  const votos = new Map(), detalle = new Map();
  _orgEmpleados(p).forEach(e => {
    const sup = String(e.supervisor||'').trim();
    if(!sup) return;
    const d = detalle.get(sup) || { sup, n:0, r:_orgResolveSupervisor(sup, cache) };
    d.n++; detalle.set(sup, d);
    if(d.r.puesto && d.r.puesto.id !== p.id) votos.set(d.r.puesto.id, (votos.get(d.r.puesto.id) || 0) + 1);
  });
  const ranking = [...votos.entries()].sort((a, b) =>
    (b[1] - a[1]) || _orgSortPuestos(byId.get(a[0]), byId.get(b[0])));
  return { detalle:[...detalle.values()].sort((a, b) => b.n - a.n),
           candidato:ranking[0]?.[0] || null, votos:ranking[0]?.[1] || 0 };
}

// Grafo efectivo de jefes: primero los enlaces manuales, después los
// automáticos de mayor a menor evidencia, saltando los que cerrarían un
// ciclo. Se calcula al vuelo (refleja altas, bajas y cambios de
// supervisor en el padrón) y se cachea hasta la siguiente mutación.
let _orgG = null;
function _orgInvalidate(){ _orgG = null; }
function _orgGraph(){
  if(_orgG) return _orgG;
  const byId = _orgById();
  const parent = new Map(), info = new Map(), cache = new Map();
  const wouldCycle = (child, par) => {
    for(let x = par, g = 0; x && g < 1000; x = parent.get(x), g++) if(x === child) return true;
    return false;
  };
  PUESTOS.forEach(p => {
    if(p.reportaA && p.reportaA !== p.id && byId.has(p.reportaA) && !wouldCycle(p.id, p.reportaA)){
      parent.set(p.id, p.reportaA);
      info.set(p.id, { fuente:'manual' });
    }
  });
  const autos = [];
  PUESTOS.forEach(p => {
    if(parent.has(p.id) || (p.reportaA && byId.has(p.reportaA)) || p.orgRaiz || p.orgSuelto) return;
    const a = _orgAutoVotes(p, cache, byId);
    info.set(p.id, { fuente:'auto', ...a });
    if(a.candidato) autos.push({ id:p.id, par:a.candidato, n:a.votos });
  });
  autos.sort((a, b) => b.n - a.n).forEach(a => {
    if(wouldCycle(a.id, a.par)){ info.get(a.id).ciclo = true; return; }
    parent.set(a.id, a.par);
  });
  return (_orgG = { byId, parent, info });
}
// Jefe efectivo (manual o automático) de un puesto, o null.
function _orgParentId(p){ return _orgGraph().parent.get(p.id) || null; }
function _orgChildrenMap(byId){
  const m = new Map();
  PUESTOS.forEach(p => {
    const par = _orgParentId(p, byId);
    if(par) (m.get(par) || m.set(par, []).get(par)).push(p);
  });
  return m;
}
// Descendientes de un puesto (para impedir ciclos al cambiar de jefe).
function _orgDescendants(id){
  const kids = _orgChildrenMap(_orgById());
  const out = new Set(), stack = [id];
  while(stack.length){
    (kids.get(stack.pop()) || []).forEach(c => { if(!out.has(c.id)){ out.add(c.id); stack.push(c.id); } });
  }
  return out;
}
function _orgSortPuestos(a, b){
  return (_ORG_NIVEL_IDX[_orgNivel(a).key] - _ORG_NIVEL_IDX[_orgNivel(b).key]) || a.nombre.localeCompare(b.nombre);
}
function _orgAreas(){
  const m = new Map();
  PUESTOS.forEach(p => { const a = String(p.area||'').trim(); if(a && !m.has(_normArea(a))) m.set(_normArea(a), a); });
  return [...m.values()].sort((a,b) => a.localeCompare(b));
}

// ── Render ────────────────────────────────────────────────────────
function renderOrganigrama(host){
  _injectOrgModal();
  const areas = _orgAreas();
  if(_orgVista === 'area' && !areas.some(a => _normArea(a) === _normArea(_orgArea))) _orgArea = areas[0] || '';
  const vBtn = (key, label) =>
    `<button class="btn ${_orgVista===key?'btn-p':'btn-s'} btn-sm" onclick="orgSetVista('${key}')">${label}</button>`;
  const areaSel = _orgVista === 'area'
    ? `<select class="flt" onchange="orgSetArea(this.value)">${areas.map(a =>
        `<option value="${esc(a)}" ${_normArea(a)===_normArea(_orgArea)?'selected':''}>${esc(a)}</option>`).join('')}</select>`
    : '';

  host.innerHTML = `
    <div class="org-toolbar">
      <span class="org-lbl">Vista:</span>
      ${vBtn('planta', '🏭 Planta')}
      ${vBtn('area',   '🧩 Por área')}
      ${areaSel}
      <div class="srch-wrap"><span class="srch-ico">🔍</span>
        <input class="srch" id="org-q" placeholder="Buscar puesto o persona..." value="${esc(_orgQ)}" oninput="orgSearch(this.value)"></div>
      <span style="flex:1"></span>
      <button class="btn btn-s btn-sm" onclick="orgResetAuto()" title="Quitar todas las asignaciones manuales y tomar el jefe del supervisor del padrón">🤖 Todo automático</button>
      <button class="btn btn-s btn-sm" onclick="orgExpandAll()" title="Expandir todo">⊕</button>
      <button class="btn btn-s btn-sm" onclick="orgCollapseAll()" title="Colapsar todo">⊖</button>
      <button class="btn btn-s btn-sm" onclick="orgZoomBy(-0.1)" title="Alejar">−</button>
      <span class="org-lbl" id="org-zoom-lbl" style="min-width:2.6rem;text-align:center">${Math.round(_orgZoom*100)}%</span>
      <button class="btn btn-s btn-sm" onclick="orgZoomBy(0.1)" title="Acercar">+</button>
    </div>
    <div class="org-legend">${ORG_NIVELES.map(n =>
      `<span><i style="background:${n.fg}"></i>${esc(n.label)}</span>`).join('')}
      <span class="org-hint">“Reporta a” se toma del supervisor del padrón · 📌 asignado a mano · ⚠️ supervisor no identificado · clic para editar · arrastra para reasignar</span>
    </div>
    <div class="org-canvas" id="org-canvas"></div>
    <div class="org-tray" id="org-tray" data-org-drop="__TRAY__"></div>`;

  _orgBindDnd(host);
  _orgRenderCanvas();
}

// Solo el lienzo y la bandeja: la búsqueda no pierde el foco.
function _orgRenderCanvas(){
  const canvas = document.getElementById('org-canvas');
  const tray   = document.getElementById('org-tray');
  if(!canvas || !tray) return;

  _orgInvalidate();                             // refleja cambios del padrón/catálogo
  const byId   = _orgGraph().byId;
  const inArea = p => _orgVista !== 'area' || _normArea(p.area) === _normArea(_orgArea);
  const scope  = PUESTOS.filter(inArea);
  const scopeIds = new Set(scope.map(p => p.id));
  // En la vista por área, un jefe de otra área no se dibuja: el puesto
  // queda como raíz de su área con una etiqueta "↑ Reporta a".
  const parentInView = p => { const par = _orgParentId(p, byId); return par && scopeIds.has(par) ? par : null; };
  const extParent    = p => { const par = _orgParentId(p, byId); return par && !scopeIds.has(par) ? byId.get(par) : null; };

  const kids = new Map();
  scope.forEach(p => { const par = parentInView(p); if(par) (kids.get(par) || kids.set(par, []).get(par)).push(p); });
  kids.forEach(list => list.sort(_orgSortPuestos));

  const tops   = scope.filter(p => !parentInView(p)).sort(_orgSortPuestos);
  const roots  = tops.filter(p => p.orgRaiz || kids.has(p.id) || extParent(p));
  const sueltos = tops.filter(p => !roots.includes(p));

  // Búsqueda: resalta coincidencias y abre los ancestros colapsados.
  const q = _orgQ.trim().toLowerCase();
  const match = new Set(), abrir = new Set();
  if(q){
    scope.forEach(p => {
      const emps = _orgEmpleados(p);
      const hay = [p.nombre, p.area, p.titular, ...emps.map(e => e.nombre)].join(' ').toLowerCase();
      if(!hay.includes(q)) return;
      match.add(p.id);
      let par = parentInView(p), guard = 0;
      while(par && guard++ < 500){ abrir.add(par); par = parentInView(byId.get(par)); }
    });
  }

  const visited = new Set();
  const nodeHtml = p => {
    if(visited.has(p.id)) return '';            // defensa ante ciclos en datos viejos
    visited.add(p.id);
    const ch = kids.get(p.id) || [];
    const collapsed = _orgCollapsed.has(p.id) && !abrir.has(p.id);
    return `<li>${_orgNodeHtml(p, { nKids:ch.length, collapsed, match:match.has(p.id), ext:null })}
      ${ch.length && !collapsed ? `<ul>${ch.map(nodeHtml).join('')}</ul>` : ''}</li>`;
  };

  const forest = roots.map(r => {
    const ext = extParent(r);
    visited.add(r.id);
    const ch = kids.get(r.id) || [];
    const collapsed = _orgCollapsed.has(r.id) && !abrir.has(r.id);
    return `<ul class="org-tree"><li>
      ${_orgNodeHtml(r, { nKids:ch.length, collapsed, match:match.has(r.id), ext })}
      ${ch.length && !collapsed ? `<ul>${ch.map(nodeHtml).join('')}</ul>` : ''}</li></ul>`;
  }).join('');

  canvas.innerHTML = `
    <div class="org-forest" style="zoom:${_orgZoom}">
      ${forest || `<div class="empty" style="padding:2rem 3rem"><div class="empty-icon">🏢</div>
        <div>Aún no hay organigrama${_orgVista==='area' ? ' para esta área' : ''}.</div>
        <div style="font-size:.75rem;color:var(--text3);margin-top:.4rem">Arrastra un puesto de la bandeja a la zona de abajo para crear la raíz, o ábrelo y elige “Raíz del organigrama”.</div></div>`}
    </div>
    <div class="org-rootzone" data-org-drop="__ROOT__">⬇️ Suelta aquí un puesto para hacerlo raíz de un organigrama</div>`;

  const nPlaced = scope.length - sueltos.length;
  tray.innerHTML = `
    <div class="org-tray-hdr">
      <strong>📥 Sin ubicar (${sueltos.length})</strong>
      <span>${nPlaced} de ${scope.length} puesto(s) en el organigrama · suelta aquí un puesto para sacarlo</span>
    </div>
    <div class="org-tray-list">${sueltos.map(p => {
      const nv = _orgNivel(p);
      return `<div class="org-chip ${match.has(p.id)?'is-match':''}" draggable="true" data-org-id="${esc(p.id)}"
        style="border-left-color:${nv.fg}" title="${esc(p.area)}">
        <strong>${esc(p.nombre)}</strong><span>${esc(_orgTitular(p, _orgEmpleados(p)).texto)}${_orgVista==='planta' ? ' · '+esc(p.area) : ''}</span></div>`;
    }).join('') || '<span class="org-hint">Todos los puestos están ubicados.</span>'}</div>`;
}

function _orgNodeHtml(p, o){
  const nv   = _orgNivel(p);
  const emps = _orgEmpleados(p);
  const tit  = _orgTitular(p, emps);
  const plazas = +p.plazas > 0 ? `${emps.length}/${+p.plazas}` : `${emps.length}`;
  const falta  = +p.plazas > emps.length;
  const inf  = _orgGraph().info.get(p.id);
  const sinId = inf && inf.fuente === 'auto' && !_orgParentId(p) &&
    inf.detalle.filter(d => !d.r.puesto && d.r.motivo !== 'vacío').map(d => d.sup);
  const meta = [
    inf && inf.fuente === 'manual' ? '<span title="Reporta a: asignado a mano">📌</span>' : '',
    sinId && sinId.length ? `<span title="Supervisor no identificado: ${esc(sinId.join(', '))}">⚠️</span>` : '',
    _orgVista === 'planta' ? esc(p.area) : '',
    `<span title="Personal activo del padrón${+p.plazas>0?' / plazas autorizadas':''}" ${falta?'style="color:#c62828;font-weight:700"':''}>👥 ${plazas}</span>`
  ].filter(Boolean).join(' · ');
  return `
    ${o.ext ? `<div class="org-ext" title="Reporta a un puesto de otra área">↑ ${esc(o.ext.nombre)} · ${esc(o.ext.area)}</div>` : ''}
    <div class="org-node ${o.match?'is-match':''}" draggable="true" data-org-id="${esc(p.id)}"
      style="--org-fg:${nv.fg};--org-bg:${nv.bg};--org-bd:${nv.bd}">
      <div class="org-ico">${esc(_orgIniciales(tit.vacante || /^\d+ personas$/.test(tit.texto) ? p.nombre : tit.texto))}</div>
      <div class="org-card">
        <div class="org-name ${tit.vacante?'is-vac':''}">${esc(tit.texto)}</div>
        <div class="org-title">${esc(p.nombre)}</div>
        <div class="org-meta">${meta}</div>
      </div>
      ${o.nKids ? `<button class="org-tog" data-org-tog="${esc(p.id)}" title="${o.collapsed?'Expandir':'Colapsar'}">${o.collapsed ? '+'+o.nKids : '−'}</button>` : ''}
    </div>`;
}

// ── Interacción: clic, colapsar y arrastrar ───────────────────────
function _orgBindDnd(host){
  host.onclick = ev => {
    const tog = ev.target.closest('[data-org-tog]');
    if(tog){
      const id = tog.dataset.orgTog;
      _orgCollapsed.has(id) ? _orgCollapsed.delete(id) : _orgCollapsed.add(id);
      _orgRenderCanvas();
      return;
    }
    const n = ev.target.closest('[data-org-id]');
    if(n) orgOpenEditor(n.dataset.orgId);
  };
  host.ondragstart = ev => {
    const n = ev.target.closest('[data-org-id]');
    if(!n) return;
    ev.dataTransfer.setData('text/plain', n.dataset.orgId);
    ev.dataTransfer.effectAllowed = 'move';
  };
  const target = ev => ev.target.closest('.org-node[data-org-id], [data-org-drop]');
  host.ondragover = ev => {
    const t = target(ev);
    if(!t) return;
    ev.preventDefault();
    host.querySelectorAll('.is-drop').forEach(x => { if(x !== t) x.classList.remove('is-drop'); });
    t.classList.add('is-drop');
  };
  host.ondragleave = ev => { const t = target(ev); if(t && !t.contains(ev.relatedTarget)) t.classList.remove('is-drop'); };
  host.ondrop = ev => {
    const t = target(ev);
    host.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop'));
    if(!t) return;
    ev.preventDefault();
    const id = ev.dataTransfer.getData('text/plain');
    if(!id) return;
    if(t.dataset.orgDrop === '__ROOT__')      orgSetParent(id, '__ROOT__');
    else if(t.dataset.orgDrop === '__TRAY__') orgQuitar(id);
    else                                      orgSetParent(id, t.dataset.orgId);
  };
}

// Cambia a quién reporta un puesto.
// parentId: id | '__ROOT__' | '__AUTO__' (según supervisor) | '' (sin ubicar).
function orgSetParent(id, parentId){
  const p = PUESTOS.find(x => x.id === id);
  if(!p) return false;
  _orgInvalidate();
  if(parentId === '__AUTO__'){
    delete p.reportaA; delete p.orgRaiz; delete p.orgSuelto;
    showToast(`🤖 ${p.nombre}: “Reporta a” automático`);
  } else if(parentId && parentId !== '__ROOT__'){
    if(parentId === id) return false;
    if(_orgDescendants(id).has(parentId)){ showToast('⚠️ No se puede: ese puesto depende de este'); return false; }
    const par = PUESTOS.find(x => x.id === parentId);
    if(!par) return false;
    p.reportaA = parentId; delete p.orgRaiz; delete p.orgSuelto;
    showToast(`↪️ ${p.nombre} ahora reporta a ${par.nombre}`);
  } else if(parentId === '__ROOT__'){
    delete p.reportaA; delete p.orgSuelto; p.orgRaiz = true;
    showToast(`🔝 ${p.nombre} es raíz del organigrama`);
  } else {
    _orgDetach(p);
  }
  savePuestos();
  _orgRenderCanvas();
  return true;
}

// Saca un puesto del organigrama (orgSuelto: tampoco recibe jefe ni
// subordinados automáticos); sus subordinados directos pasan a su jefe
// (o quedan como raíz si no tenía), para no desarmar la rama.
function _orgDetach(p){
  const par = _orgParentId(p);
  PUESTOS.forEach(x => {
    if(x.id === p.id || _orgParentId(x) !== p.id) return;
    delete x.orgSuelto;
    if(par){ x.reportaA = par; delete x.orgRaiz; } else { delete x.reportaA; x.orgRaiz = true; }
  });
  delete p.reportaA; delete p.orgRaiz; p.orgSuelto = true;
  _orgInvalidate();
}
function orgQuitar(id){
  const p = PUESTOS.find(x => x.id === id);
  if(!p) return;
  _orgInvalidate();
  const nKids = _orgChildrenMap(_orgById()).get(id)?.length || 0;
  if(nKids && !confirm(`¿Quitar "${p.nombre}" del organigrama?\n\nSus ${nKids} subordinado(s) directo(s) pasarán a reportar a su jefe (o quedarán como raíz).`)) return;
  _orgDetach(p);
  savePuestos();
  document.getElementById('go-modal')?.classList.remove('open');
  _orgRenderCanvas();
  showToast(`📥 ${p.nombre} quedó sin ubicar`);
}

// Quita todas las capturas manuales de "Reporta a": el organigrama queda
// armado solo con los supervisores del padrón.
function orgResetAuto(){
  const n = PUESTOS.filter(p => p.reportaA || p.orgRaiz || p.orgSuelto).length;
  if(!n){ showToast('🤖 Todo el organigrama ya es automático'); return; }
  if(!confirm(`¿Volver a “Reporta a” automático en ${n} puesto(s) con asignación manual?\n\nEl jefe de cada puesto se tomará del supervisor asignado en el padrón.`)) return;
  PUESTOS.forEach(p => { delete p.reportaA; delete p.orgRaiz; delete p.orgSuelto; });
  savePuestos();
  _orgRenderCanvas();
  showToast(`🤖 ${n} puesto(s) regresaron a automático`);
}

function orgSetVista(v){ _orgVista = v; renderGestion(); }
function orgSetArea(a){ _orgArea = a; _orgRenderCanvas(); }
function orgSearch(q){ _orgQ = q; _orgRenderCanvas(); }
function orgZoomBy(d){
  _orgZoom = Math.min(1.6, Math.max(0.4, Math.round((_orgZoom + d) * 10) / 10));
  const f = document.querySelector('#org-canvas .org-forest');
  if(f) f.style.zoom = _orgZoom;
  const l = document.getElementById('org-zoom-lbl');
  if(l) l.textContent = Math.round(_orgZoom*100) + '%';
}
function orgExpandAll(){ _orgCollapsed.clear(); _orgRenderCanvas(); }
function orgCollapseAll(){
  const byId = _orgById();
  _orgChildrenMap(byId).forEach((_, id) => _orgCollapsed.add(id));
  // Las raíces quedan abiertas para ver al menos el primer nivel.
  PUESTOS.filter(p => !_orgParentId(p, byId)).forEach(p => _orgCollapsed.delete(p.id));
  _orgRenderCanvas();
}

// ── Editor del puesto ─────────────────────────────────────────────
// opts.parentId / opts.area prellenan el alta de un subordinado.
function orgOpenEditor(id, opts){
  _injectOrgModal();
  opts = opts || {};
  const p    = id ? PUESTOS.find(x => x.id === id) : null;
  _orgInvalidate();
  const byId = _orgGraph().byId;
  const emps = p ? _orgEmpleados(p) : [];
  const $ = s => document.getElementById(s);

  $('go-id').value      = p ? p.id : '';
  $('go-nombre').value  = p ? p.nombre : '';
  $('go-area').value    = p ? p.area : (opts.area || (_orgVista==='area' ? _orgArea : ''));
  $('go-titular').value = p ? (p.titular || '') : '';
  $('go-plazas').value  = p && +p.plazas > 0 ? +p.plazas : '';
  $('go-turno').value   = p ? (p.turno || '') : '';
  $('go-desc').value    = p ? (p.descripcion || '') : '';
  $('go-resp').value    = p ? (p.responsabilidades || '') : '';
  $('go-req').value     = p ? (p.requisitos || '') : '';
  $('go-error').style.display = 'none';

  const nivelSel = p ? _orgNivel(p).key : _orgNivelAuto('');
  $('go-nivel').innerHTML = ORG_NIVELES.map(n =>
    `<option value="${n.key}" ${n.key===nivelSel?'selected':''}>${esc(n.label)}</option>`).join('');
  $('go-nivel-auto').textContent = p && !p.nivel ? '(sugerido por el nombre del puesto)' : '';

  // "Reporta a": excluye al propio puesto y a sus descendientes (ciclo).
  const bloqueados = p ? _orgDescendants(p.id) : new Set();
  if(p) bloqueados.add(p.id);
  // Valor actual: captura manual > raíz > fuera > automático.
  const auto   = p ? _orgAutoVotes(p, new Map(), byId) : null;
  const autoP  = auto && auto.candidato ? byId.get(auto.candidato) : null;
  const curVal = !p ? (opts.parentId || '__AUTO__')
    : (p.reportaA && byId.has(p.reportaA) && !bloqueados.has(p.reportaA)) ? p.reportaA
    : p.orgRaiz ? '__ROOT__' : p.orgSuelto ? '' : '__AUTO__';
  const byArea = {};
  PUESTOS.filter(x => !bloqueados.has(x.id)).forEach(x => (byArea[x.area||'Sin área'] = byArea[x.area||'Sin área'] || []).push(x));
  $('go-parent').innerHTML =
    `<option value="__AUTO__">🤖 Automático — ${autoP ? 'según supervisor: ' + esc(autoP.nombre) : 'sin supervisor identificable'}</option>
     <option value="">— Sin ubicar (fuera del organigrama) —</option>
     <option value="__ROOT__">🔝 Raíz del organigrama (no reporta a nadie)</option>` +
    Object.entries(byArea).sort((a,b)=>a[0].localeCompare(b[0])).map(([area, ps]) =>
      `<optgroup label="${esc(area)}">` + ps.sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(x => {
        const t = _orgTitular(x, _orgEmpleados(x));
        return `<option value="${esc(x.id)}">${esc(x.nombre)}${t.vacante ? '' : ' — ' + esc(t.texto)}</option>`;
      }).join('') + `</optgroup>`).join('');
  $('go-parent').value = curVal;

  // Sugerencias de titular: personal del puesto + supervisores del padrón.
  const sug = new Set(emps.map(e => e.nombre));
  (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []).forEach(e => { if(String(e.supervisor||'').trim()) sug.add(e.supervisor.trim()); });
  $('go-titular-list').innerHTML = [...sug].sort().map(n => `<option value="${esc(n)}">`).join('');
  $('go-titular').placeholder = emps.length === 1 ? `Del padrón: ${emps[0].nombre}` : 'Nombre de la persona';

  const areas = [...new Map([...catalogAreas(), ...Object.values(_empAreaCanon())].map(a => [_normArea(a), a])).values()].sort((a,b)=>a.localeCompare(b));
  $('go-area-list').innerHTML = areas.map(a => `<option value="${esc(a)}">`).join('');

  // Información derivada (solo lectura)
  const nEx = p ? _examIdsForPuestoId(p.id).length : 0;
  const inf = p ? _orgGraph().info.get(p.id) : null;
  const supHtml = !p ? '' : !auto.detalle.length
    ? `<div class="org-sup">🤖 Sin personal con supervisor en el padrón: el jefe automático no se puede calcular.</div>`
    : `<div class="org-sup"><strong>🤖 Supervisor asignado en el padrón:</strong>${auto.detalle.map(d => {
        const destino = d.r.puesto
          ? (d.r.puesto.id === p.id ? '<em>es el mismo puesto</em>' : `→ ${esc(d.r.puesto.nombre)} <span style="color:var(--text3)">(${esc(d.r.puesto.area)})</span>`)
          : `→ ⚠️ ${esc(d.r.motivo)}${d.r.personas ? ': ' + esc(d.r.personas.join(' / ')) : ''}`;
        return `<div>• ${esc(d.sup)} <span style="color:var(--text3)">(${d.n})</span> ${destino}</div>`;
      }).join('')}
      ${auto.detalle.some(d => !d.r.puesto && d.r.motivo !== 'vacío')
        ? `<div style="color:var(--text3);margin-top:.25rem">Si el supervisor no está en el padrón, captúralo como <strong>Titular</strong> de su puesto y se enlazará solo.</div>` : ''}
      ${inf && inf.fuente === 'manual' ? `<div style="margin-top:.25rem">📌 Este puesto tiene “Reporta a” asignado a mano.</div>` : ''}
      ${inf && inf.ciclo ? `<div style="color:var(--red);margin-top:.25rem">⚠️ El jefe automático formaría un ciclo y se ignoró.</div>` : ''}</div>`;
  $('go-info').innerHTML = p ? `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap">
      <span><strong>👥 ${emps.length}</strong> persona(s) activa(s) en el padrón${+p.plazas>0?` de <strong>${+p.plazas}</strong> plaza(s)`:''} · <strong>📝 ${nEx}</strong> examen(es)</span>
      <button class="btn btn-s btn-sm" onclick="document.getElementById('go-modal').classList.remove('open');openAsgFor('puesto','${esc(p.id)}')">🔀 Asignar exámenes</button>
    </div>
    ${emps.length ? `<div class="org-emps">${emps.map(e => `<span>${esc(e.nombre)}</span>`).join('')}</div>` : ''}
    ${emps.length ? `<div style="color:var(--text3);font-size:.7rem;margin-top:.35rem">⚠️ Renombrar el puesto o cambiar el área no modifica el puesto de estas personas en el padrón.</div>` : ''}
    ${supHtml}` : '';
  $('go-info').style.display = p ? '' : 'none';

  $('go-modal-kicker').textContent = p ? `✏️ ${p.id}` : (opts.parentId ? `➕ Subordinado de ${byId.get(opts.parentId)?.nombre || ''}` : '➕ Nuevo puesto');
  $('go-modal-title').textContent  = p ? p.nombre : 'Nuevo puesto';
  ['go-btn-sub','go-btn-quitar','go-btn-del'].forEach(b => $(b).style.display = p ? '' : 'none');
  $('go-modal').classList.add('open');
}

function orgSave(){
  const $ = s => document.getElementById(s);
  const id     = $('go-id').value;
  const nombre = $('go-nombre').value.trim();
  const area   = _canonicalArea($('go-area').value);
  const errEl  = $('go-error');
  const fail = msg => { errEl.textContent = msg; errEl.style.display = 'block'; };

  if(!nombre || !area) return fail('Nombre del puesto y área son obligatorios.');
  const dup = _findPuesto(area, nombre);
  if(dup && dup.id !== id) return fail(`Ya existe el puesto "${nombre}" en el área "${area}".`);
  const parent = $('go-parent').value;
  _orgInvalidate();
  if(id && parent && parent !== '__ROOT__' && parent !== '__AUTO__' && (parent === id || _orgDescendants(id).has(parent)))
    return fail('Un puesto no puede reportar a sí mismo ni a uno de sus subordinados.');
  const plazasRaw = $('go-plazas').value.trim();
  const plazas = plazasRaw === '' ? null : parseInt(plazasRaw, 10);
  if(plazasRaw !== '' && !(plazas >= 0)) return fail('Plazas autorizadas debe ser un número entero.');
  errEl.style.display = 'none';

  let p = id ? PUESTOS.find(x => x.id === id) : null;
  if(id && !p){ showToast('⚠️ Puesto no encontrado'); return; }
  const cambioClave = !p || p.nombre !== nombre || p.area !== area;
  if(!p){
    // manual:true → la migración del catálogo nunca lo reubica ni lo fusiona
    p = { id:_nextPuestoId(), nombre, area, manual:true };
    PUESTOS.push(p);
  }
  p.nombre = nombre; p.area = area;
  p.nivel  = $('go-nivel').value;
  const setTxt = (k, v) => { v = String(v||'').trim(); if(v) p[k] = v; else delete p[k]; };
  setTxt('titular', $('go-titular').value);
  setTxt('turno', $('go-turno').value);
  setTxt('descripcion', $('go-desc').value);
  setTxt('responsabilidades', $('go-resp').value);
  setTxt('requisitos', $('go-req').value);
  if(plazas > 0) p.plazas = plazas; else delete p.plazas;

  if(parent === '__AUTO__'){ delete p.reportaA; delete p.orgRaiz; delete p.orgSuelto; }
  else if(parent === '__ROOT__'){ delete p.reportaA; delete p.orgSuelto; p.orgRaiz = true; }
  else if(parent){ p.reportaA = parent; delete p.orgRaiz; delete p.orgSuelto; }
  else if(!p.orgSuelto){ _orgDetach(p); }

  savePuestos();
  if(cambioClave){ try { buildAreaPuestoFilters(); } catch(_){} }
  $('go-modal').classList.remove('open');
  showToast(id ? `✏️ Puesto actualizado: ${nombre}` : `➕ Puesto creado: ${nombre}`);
  renderGestion();
}

function orgSubordinado(){
  const id = document.getElementById('go-id').value;
  const p  = PUESTOS.find(x => x.id === id);
  if(p) orgOpenEditor(null, { parentId:p.id, area:p.area });
}
function orgEliminar(){
  const id = document.getElementById('go-id').value;
  gDeletePuesto(id);   // pide confirmación y reacomoda subordinados
  if(!PUESTOS.some(x => x.id === id)) document.getElementById('go-modal').classList.remove('open');
}

function _injectOrgModal(){
  if(document.getElementById('go-modal')) return;
  const inp = "width:100%;padding:.52rem .8rem;border-radius:7px;border:1.5px solid var(--border2);background:var(--card);color:var(--text);font-family:var(--fb);font-size:.85rem;outline:none";
  const ta  = inp + ";resize:vertical;min-height:58px";
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <div class="modal-overlay" id="go-modal" role="dialog" aria-modal="true" aria-label="Editar puesto del organigrama">
    <div class="modal" style="max-width:640px">
      <div class="modal-hdr" style="border-bottom:1px solid var(--border);padding-bottom:1rem">
        <div>
          <div id="go-modal-kicker" style="font-size:.7rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.2rem"></div>
          <div class="modal-title" id="go-modal-title"></div>
        </div>
        <button class="modal-close" aria-label="Cerrar" onclick="document.getElementById('go-modal').classList.remove('open')">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:.8rem">
        <input type="hidden" id="go-id">
        <div id="go-info" class="org-info"></div>
        <div class="org-grid2">
          <div class="m-sec" style="margin:0"><label>Puesto <span style="color:var(--red)">*</span></label>
            <input id="go-nombre" type="text" placeholder="Ej. GERENTE DE PLANTA" style="${inp}"></div>
          <div class="m-sec" style="margin:0"><label>Área <span style="color:var(--red)">*</span></label>
            <input id="go-area" type="text" list="go-area-list" placeholder="Ej. MANUFACTURA" style="${inp}">
            <datalist id="go-area-list"></datalist></div>
          <div class="m-sec" style="margin:0"><label>Titular (nombre de la persona)</label>
            <input id="go-titular" type="text" list="go-titular-list" style="${inp}">
            <datalist id="go-titular-list"></datalist></div>
          <div class="m-sec" style="margin:0"><label>Nivel <span id="go-nivel-auto" style="color:var(--text3);font-weight:400;text-transform:none"></span></label>
            <select id="go-nivel" style="${inp};cursor:pointer"></select></div>
          <div class="m-sec" style="margin:0;grid-column:1/-1"><label>Reporta a</label>
            <select id="go-parent" style="${inp};cursor:pointer"></select></div>
          <div class="m-sec" style="margin:0"><label>Plazas autorizadas</label>
            <input id="go-plazas" type="number" min="0" step="1" placeholder="Ej. 4" style="${inp}"></div>
          <div class="m-sec" style="margin:0"><label>Turno / horario</label>
            <input id="go-turno" type="text" placeholder="Ej. 7:00 AM - 7:00 PM" style="${inp}"></div>
        </div>
        <div class="m-sec" style="margin:0"><label>Descripción del puesto</label>
          <textarea id="go-desc" rows="2" style="${ta}"></textarea></div>
        <div class="m-sec" style="margin:0"><label>Responsabilidades</label>
          <textarea id="go-resp" rows="3" placeholder="Una por línea" style="${ta}"></textarea></div>
        <div class="m-sec" style="margin:0"><label>Requisitos (escolaridad, experiencia, certificaciones)</label>
          <textarea id="go-req" rows="2" style="${ta}"></textarea></div>
        <div id="go-error" style="display:none;color:var(--red);font-size:.78rem;font-weight:600;padding:.45rem .8rem;background:rgba(198,40,40,.08);border-radius:6px;border-left:3px solid var(--red)"></div>
      </div>
      <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;background:var(--bg2)">
        <button class="btn btn-s btn-sm" id="go-btn-sub" onclick="orgSubordinado()">➕ Subordinado</button>
        <button class="btn btn-s btn-sm" id="go-btn-quitar" onclick="orgQuitar(document.getElementById('go-id').value)">📥 Quitar del organigrama</button>
        <button class="btn btn-s btn-sm" id="go-btn-del" style="color:var(--red);border-color:var(--red)" onclick="orgEliminar()">🗑️ Eliminar</button>
        <span style="flex:1"></span>
        <button onclick="document.getElementById('go-modal').classList.remove('open')" style="padding:.5rem 1.1rem;border-radius:7px;border:1.5px solid var(--border2);background:none;color:var(--text2);font-family:var(--fb);font-size:.83rem;font-weight:600;cursor:pointer">Cancelar</button>
        <button onclick="orgSave()" style="padding:.5rem 1.3rem;border-radius:7px;border:none;background:var(--accent);color:#fff;font-family:var(--fb);font-size:.83rem;font-weight:700;cursor:pointer">💾 Guardar</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap);
}
