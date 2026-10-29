// ════════════════════════════════════════════════════════════════
// RESPALDO — sección 💾 Respaldo
// Un respaldo es una foto de TODAS las llaves 'nmc-*' del localStorage
// (dataset, estatus, empleados manuales/eliminados, puestos, ajustes…),
// guardada como .json. Al abrir la aplicación se descarga uno automático
// (se puede desactivar en la sección) y desde aquí se puede restaurar.
//
// Formato: { app, formato, generado, claves, datos: { 'nmc-…': '<texto crudo>' } }
// Los valores se guardan como texto crudo para que restaurar sea idéntico.
//
// Fuera del respaldo: 'nmc-respaldo-config' (preferencia propia de esta
// sección), para que restaurar no cambie si la descarga automática está activa.
// ════════════════════════════════════════════════════════════════
(function(){
  const APP_ID     = 'NMC-Sistema-Entrenamiento';
  const FORMATO    = 1;
  const PREFIJO    = 'nmc-';
  const CFG_KEY    = 'nmc-respaldo-config';
  const AUTO_DELAY = 1200;   // ms: deja que termine la inicialización de la app

  // Descripción legible de las llaves conocidas (las demás se listan tal cual).
  const ETIQUETAS = {
    'nmc-dataset'              : 'Dataset completo (exámenes y empleados cargados)',
    'nmc-employee-data'        : 'Estatus y checks de empleados',
    'nmc-extra-employees'      : 'Empleados dados de alta manualmente',
    'nmc-deleted-employees'    : 'Empleados eliminados',
    'nmc-puestos'              : 'Gestión: puestos y asignaciones de exámenes',
    'nmc-puestos-bak-v1'       : 'Gestión: copia previa a la migración v2',
    'nmc-app-settings'         : 'Formato, colores y tipos de gráfica',
    'nmc-dashboard-layout'     : 'Orden del Dashboard',
    'nmc-hidden-kpis'          : 'KPIs ocultos del Dashboard',
    'nmc-analyzer-sync'        : 'Paquete del Analizador de Formularios',
    'nmc-analyzer-sync-applied': 'Marca de sincronización del Analizador',
    'nmc-sm-pdf-config'        : 'Configuración del PDF de Skill Matrix'
  };

  // ── localStorage seguro ────────────────────────────────────────
  function _lsKeys(){
    const out = [];
    try {
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.indexOf(PREFIJO) === 0 && k !== CFG_KEY) out.push(k);
      }
    } catch(e){}
    return out.sort();
  }

  function _cfg(){
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      return { auto: c.auto !== false, last: c.last || null, lastAuto: c.lastAuto || null };
    } catch(e){ return { auto:true, last:null, lastAuto:null }; }
  }
  function _saveCfg(patch){
    try { localStorage.setItem(CFG_KEY, JSON.stringify(Object.assign(_cfg(), patch))); } catch(e){}
  }

  // ── Construcción / descarga ────────────────────────────────────
  function _buildBackup(){
    const datos = {};
    _lsKeys().forEach(k => {
      try { const v = localStorage.getItem(k); if(v !== null) datos[k] = v; } catch(e){}
    });
    return {
      app: APP_ID,
      formato: FORMATO,
      generado: new Date().toISOString(),
      claves: Object.keys(datos).length,
      datos
    };
  }

  function _stamp(d){
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) +
           '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function _download(backup){
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'respaldo-nmc_' + _stamp(new Date()) + '.json';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }

  // Descarga manual (botón). Devuelve true si descargó algo.
  function descargarRespaldo(){
    const b = _buildBackup();
    if(!b.claves){
      _toast('⚠️ No hay datos guardados para respaldar todavía');
      return false;
    }
    _download(b);
    _saveCfg({ last: Date.now() });
    _toast('💾 Respaldo descargado (' + b.claves + ' conjuntos de datos)');
    renderRespaldo();
    return true;
  }

  // Descarga automática al abrir. Sin datos guardados no genera un archivo vacío.
  function _autoRespaldo(){
    if(!_cfg().auto) return;
    const b = _buildBackup();
    if(!b.claves) return;
    try {
      _download(b);
      const now = Date.now();
      _saveCfg({ last: now, lastAuto: now });
      renderRespaldo();
    } catch(e){ console.warn('Respaldo automático falló:', e); }
  }

  // ── Restauración ───────────────────────────────────────────────
  function _validar(obj){
    if(!obj || typeof obj !== 'object' || obj.app !== APP_ID)
      return 'El archivo no es un respaldo de este sistema.';
    if(!obj.datos || typeof obj.datos !== 'object' || Array.isArray(obj.datos))
      return 'El respaldo no contiene datos.';
    const keys = Object.keys(obj.datos);
    if(!keys.length) return 'El respaldo está vacío.';
    for(const k of keys){
      if(k.indexOf(PREFIJO) !== 0 || k === CFG_KEY) return 'El respaldo contiene una llave no válida: ' + k;
      if(typeof obj.datos[k] !== 'string') return 'Valor no válido en la llave: ' + k;
    }
    return null;
  }

  function importarRespaldo(input){
    const file = input && input.files && input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onerror = () => { _toast('⚠️ No se pudo leer el archivo'); input.value = ''; };
    reader.onload = () => {
      input.value = '';                       // permite elegir el mismo archivo otra vez
      let obj;
      try { obj = JSON.parse(reader.result); }
      catch(e){ alert('El archivo no es un JSON válido.'); return; }
      const err = _validar(obj);
      if(err){ alert(err); return; }

      const fecha = obj.generado ? new Date(obj.generado).toLocaleString() : 'fecha desconocida';
      const ok = confirm(
        '¿Restaurar este respaldo?\n\n' +
        'Archivo: ' + file.name + '\n' +
        'Generado: ' + fecha + '\n' +
        'Conjuntos de datos: ' + Object.keys(obj.datos).length + '\n\n' +
        'Se REEMPLAZARÁN los datos actuales del sistema (empleados, estatus, ' +
        'puestos, ajustes). Si quieres conservarlos, descarga un respaldo antes.\n\n' +
        'La página se recargará al terminar.'
      );
      if(!ok) return;
      _aplicar(obj.datos);
    };
    reader.readAsText(file);
  }

  // Reemplaza todas las llaves 'nmc-*'; si algo falla (p. ej. cuota) revierte.
  function _aplicar(datos){
    const previo = {};
    _lsKeys().forEach(k => { previo[k] = localStorage.getItem(k); });
    try {
      Object.keys(previo).forEach(k => localStorage.removeItem(k));
      Object.keys(datos).forEach(k => localStorage.setItem(k, datos[k]));
    } catch(e){
      try {
        _lsKeys().forEach(k => localStorage.removeItem(k));
        Object.keys(previo).forEach(k => localStorage.setItem(k, previo[k]));
      } catch(_){}
      alert('No se pudo restaurar el respaldo (' + (e && e.name || 'error') + '). Se conservaron los datos actuales.');
      return;
    }
    _toast('✅ Respaldo restaurado. Recargando…');
    setTimeout(() => location.reload(), 700);
  }

  // ── Interfaz ───────────────────────────────────────────────────
  function _toast(msg){
    if(typeof showToast === 'function') showToast(msg); else console.info(msg);
  }

  function _esc(s){
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function _fmtBytes(n){
    if(n < 1024) return n + ' B';
    if(n < 1048576) return (n/1024).toFixed(1) + ' KB';
    return (n/1048576).toFixed(2) + ' MB';
  }

  function _fmtFecha(ts){ return ts ? new Date(ts).toLocaleString() : '—'; }

  function setRespaldoAuto(on){
    _saveCfg({ auto: !!on });
    _toast(on ? '✅ Descarga automática al abrir: activada' : 'Descarga automática al abrir: desactivada');
    renderRespaldo();
  }

  function renderRespaldo(){
    const root = document.getElementById('respaldo-root');
    if(!root) return;
    const cfg  = _cfg();
    const keys = _lsKeys();
    let total = 0;
    const filas = keys.map(k => {
      let len = 0;
      try { len = (localStorage.getItem(k) || '').length; } catch(e){}
      total += len;
      return '<tr><td>' + _esc(ETIQUETAS[k] || 'Otros datos') + '</td>' +
             '<td><code>' + _esc(k) + '</code></td>' +
             '<td style="text-align:right">' + _fmtBytes(len) + '</td></tr>';
    }).join('');

    root.innerHTML =
      '<div class="rs-grid">' +
        '<div class="rs-card">' +
          '<h3>⬇ Descargar respaldo</h3>' +
          '<p>Guarda un archivo <b>.json</b> con todos los datos que el sistema tiene en este navegador.</p>' +
          '<button class="btn btn-p" onclick="descargarRespaldo()">💾 Descargar respaldo ahora</button>' +
          '<div class="rs-meta">Último respaldo: <b>' + _esc(_fmtFecha(cfg.last)) + '</b></div>' +
        '</div>' +
        '<div class="rs-card">' +
          '<h3>⬆ Restaurar respaldo</h3>' +
          '<p>Carga un respaldo .json. <b>Reemplaza</b> los datos actuales y recarga la página.</p>' +
          '<button class="btn btn-s" onclick="document.getElementById(\'respaldo-file-input\').click()">📂 Elegir archivo…</button>' +
          '<input type="file" id="respaldo-file-input" accept=".json,application/json" style="display:none" onchange="importarRespaldo(this)">' +
        '</div>' +
        '<div class="rs-card">' +
          '<h3>⚙️ Descarga automática</h3>' +
          '<p>Descarga un respaldo cada vez que se abre la aplicación (si ya hay datos guardados).</p>' +
          '<label class="rs-switch"><input type="checkbox" ' + (cfg.auto ? 'checked' : '') +
            ' onchange="setRespaldoAuto(this.checked)"> Descargar al abrir la aplicación</label>' +
          '<div class="rs-meta">Última descarga automática: <b>' + _esc(_fmtFecha(cfg.lastAuto)) + '</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="tbl-wrap" style="margin-top:1.25rem">' +
        '<table><thead><tr><th>Contenido del respaldo</th><th>Llave</th><th style="text-align:right">Tamaño</th></tr></thead><tbody>' +
          (filas || '<tr><td colspan="3" style="text-align:center;color:var(--text3)">Aún no hay datos guardados en este navegador.</td></tr>') +
        '</tbody>' +
        (keys.length ? '<tfoot><tr><td colspan="2"><b>Total (' + keys.length + ')</b></td><td style="text-align:right"><b>' + _fmtBytes(total) + '</b></td></tr></tfoot>' : '') +
      '</table></div>' +
      '<p class="rs-note">El respaldo contiene los datos guardados en este navegador. Las listas base ' +
      'incluidas en la aplicación no se respaldan porque ya viven en los archivos del sistema. ' +
      'Los archivos descargados incluyen datos de empleados: guárdalos en un lugar seguro.</p>';
  }

  // ── Arranque ───────────────────────────────────────────────────
  window.descargarRespaldo = descargarRespaldo;
  window.importarRespaldo  = importarRespaldo;
  window.setRespaldoAuto   = setRespaldoAuto;
  window.renderRespaldo    = renderRespaldo;

  // La tabla refleja lo guardado ahora: se refresca cada vez que se abre la pestaña.
  const _showViewOrig = window.showView;
  if(typeof _showViewOrig === 'function'){
    window.showView = function(name){
      const r = _showViewOrig.apply(this, arguments);
      if(name === 'respaldo') renderRespaldo();
      return r;
    };
  }

  function _init(){
    renderRespaldo();
    setTimeout(_autoRespaldo, AUTO_DELAY);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
  else _init();
})();
