// ════════════════════════════════════════════════════════
// SKILL MATRIX MODULE — basado en datos de Puestos × Exámenes
// ════════════════════════════════════════════════════════
(function(){

  function smBuildAreaFilter(){
    const sel = document.getElementById('sm-area-filter');
    const current = sel.value;
    const areas = (typeof ALL_AREAS!=='undefined' && ALL_AREAS.length)
      ? ALL_AREAS.filter(a=>EMPLOYEES.some(e=>e.area===a))
      : [...new Set(EMPLOYEES.map(e=>e.area).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Todas las áreas</option>';
    areas.forEach(a=>{
      const o = document.createElement('option');
      o.value = a; o.textContent = a;
      sel.appendChild(o);
    });
    sel.value = current;
  }

  function smGetCertFilter(){
    return document.getElementById('sm-cert-filter').value;
  }

  function smFilterByCert(empList){
    const cert = smGetCertFilter();
    if(!cert) return empList;
    if(cert==='skill')     return empList.filter(e=>e.cert_cofc==='Aplica');
    if(cert==='knowledge') return empList.filter(e=>e.cert_examen==='Aplica');
    return empList;
  }

  function smGetAreaData(area){
    let emps = EMPLOYEES.filter(e=>e.area===area && e.nombre);
    emps = smFilterByCert(emps);
    if(!emps.length) return null;

    const examIdSet = new Set(emps.flatMap(e=>e.exam_ids||[]));
    const exams = EXAMS.filter(ex=>examIdSet.has(ex.id));
    if(!exams.length) return null;

    const puestos = [...new Set(emps.map(e=>e.puesto).filter(Boolean))].sort();

    return {area, emps, exams, puestos};
  }

  function smRenderKPIs(datasets){
    const el = document.getElementById('sm-kpis');
    if(!datasets.length){ el.innerHTML=''; return; }

    let totalEmps=0, totalExams=new Set(), totalAplica=0, totalAprobado=0, totalPendiente=0;
    datasets.forEach(ds=>{
      totalEmps += ds.emps.length;
      ds.exams.forEach(ex=> totalExams.add(ex.id));
      ds.emps.forEach(emp=>{
        const checks = (window._examChecks && window._examChecks[emp.id]) || {};
        (emp.exam_ids||[]).forEach(xid=>{
          if(ds.exams.some(ex=>ex.id===xid)){
            totalAplica++;
            if(checks[xid]) totalAprobado++;
            else totalPendiente++;
          }
        });
      });
    });

    el.innerHTML = `
      <div class="kpi" style="border-left:3px solid var(--accent)"><div class="kpi-lbl">Áreas</div><div class="kpi-val o">${datasets.length}</div></div>
      <div class="kpi" style="border-left:3px solid var(--accent)"><div class="kpi-lbl">Empleados</div><div class="kpi-val o">${totalEmps}</div></div>
      <div class="kpi" style="border-left:3px solid var(--accent)"><div class="kpi-lbl">Exámenes</div><div class="kpi-val o">${totalExams.size}</div></div>
      <div class="kpi" style="border-left:3px solid var(--green)"><div class="kpi-lbl">Aprobados</div><div class="kpi-val g">${totalAprobado}</div><div class="kpi-sub">${totalAplica?Math.round(totalAprobado/totalAplica*100):0}% del total</div></div>
      <div class="kpi" style="border-left:3px solid var(--yellow)"><div class="kpi-lbl">Pendientes</div><div class="kpi-val y">${totalPendiente}</div></div>
    `;
  }

  function smRenderMatrix(){
    smBuildAreaFilter();
    smRenderLegend();
    const pdfCfg = smGetPdfConfig();
    const container = document.getElementById('sm-table-container');
    const filter = document.getElementById('sm-area-filter').value;

    if(!EMPLOYEES||!EMPLOYEES.length||!EXAMS||!EXAMS.length){
      container.innerHTML='<p style="text-align:center;color:var(--text3);padding:2rem">Cargue primero el Excel maestro desde el menú principal</p>';
      document.getElementById('sm-kpis').innerHTML='';
      return;
    }

    const areas = filter ? [filter]
      : (typeof ALL_AREAS!=='undefined' && ALL_AREAS.length ? ALL_AREAS : [...new Set(EMPLOYEES.map(e=>e.area).filter(Boolean))].sort())
          .filter(a=>EMPLOYEES.some(e=>e.area===a && (e.exam_ids||[]).length));

    const datasets = areas.map(a=>smGetAreaData(a)).filter(Boolean);

    smRenderKPIs(datasets);

    if(!datasets.length){
      container.innerHTML='<p style="text-align:center;color:var(--text3);padding:2rem">No hay datos de empleados/exámenes para las áreas seleccionadas</p>';
      return;
    }

    const certF = smGetCertFilter();
    const certTag = certF==='skill' ? ' · SKILL ASSESSMENT' : certF==='knowledge' ? ' · Knowledge Certification' : '';

    let html = '';
    datasets.forEach(ds=>{
      const aprArea = ds.emps.filter(e=>e.estatus==='Aprobado').length;
      const pctArea = ds.emps.length ? Math.round(aprArea/ds.emps.length*100) : 0;

      html += `<h3 style="font-family:var(--fh);font-size:.95rem;font-weight:700;color:var(--accent);margin:1.5rem 0 .5rem;display:flex;align-items:center;gap:.5rem">
        📊 ${esc(ds.area)}${esc(certTag)}
        <span style="font-size:.75rem;color:var(--text3);font-weight:400">${ds.emps.length} empleados · ${ds.exams.length} exámenes · ${pctArea}% aprobados</span>
      </h3>`;
      html += '<div class="sm-table-wrap"><table>';

      // Header — two rows: category span + vertical exam names
      html += '<thead>';
      html += '<tr>';
      html += '<th class="sm-th-fixed" style="left:0;min-width:30px" rowspan="2">#</th>';
      html += '<th class="sm-th-fixed" style="left:30px;text-align:left" rowspan="2">No. Emp</th>';
      html += '<th class="sm-th-fixed" style="left:85px;text-align:left" rowspan="2">Nombre / Name</th>';
      html += '<th class="sm-th-fixed" style="left:140px;text-align:left" rowspan="2">Puesto / Title</th>';
      html += '<th class="sm-th-fixed" rowspan="2">Estatus</th>';
      if(ds.exams.length) html += `<th colspan="${ds.exams.length}" style="text-align:center;font-size:.72rem;letter-spacing:.03em">Procedimientos / Procedures</th>`;
      html += '</tr><tr>';
      ds.exams.forEach(ex=>{
        html += `<th class="sm-th-vert" title="${esc(ex.id)}: ${esc(ex.tema)}">${esc(ex.tema)}</th>`;
      });
      html += '</tr></thead><tbody>';

      // Employee rows
      ds.emps.forEach((emp, ri)=>{
        const empExamIds = new Set(emp.exam_ids||[]);
        const checks = (window._examChecks && window._examChecks[emp.id]) || {};
        html += '<tr>';
        html += `<td class="sm-num">${ri+1}</td>`;
        html += `<td class="sm-num">${esc(emp.numero)||''}</td>`;
        html += `<td class="sm-name">${esc(emp.nombre)||''}</td>`;
        html += `<td class="sm-title">${esc(emp.puesto)||''}</td>`;
        const stCls = emp.estatus==='Aprobado'?'sm-cell-aprobado': emp.estatus==='Pendiente'?'sm-cell-pendiente':'sm-cell-empty';
        html += `<td class="${stCls}" style="font-size:.65rem;white-space:nowrap">${esc(emp.estatus)||'—'}</td>`;
        const symStyle = `font-size:${pdfCfg.symbolSize}px`;
        ds.exams.forEach(ex=>{
          if(empExamIds.has(ex.id)){
            if(checks[ex.id]){
              html += `<td class="sm-cell-aprobado" style="background:${esc(pdfCfg.legend[0].color)}!important;${symStyle}" title="${esc(ex.tema)} — Aprobado">${esc(pdfCfg.legend[0].symbol)}</td>`;
            } else {
              html += `<td class="sm-cell-pendiente" style="background:${esc(pdfCfg.legend[1].color)}!important;${symStyle}" title="${esc(ex.tema)} — Pendiente">${esc(pdfCfg.legend[1].symbol)}</td>`;
            }
          } else {
            html += `<td class="sm-cell-empty" style="background:${esc(pdfCfg.legend[2].color)}!important"></td>`;
          }
        });
        html += '</tr>';
      });

      // Summary row: count per exam
      html += '<tr class="sm-summary-row">';
      html += '<td></td><td></td><td class="sm-name" style="background:var(--bg3)!important"><strong>Total Asignados</strong></td><td class="sm-title" style="background:var(--bg3)!important"></td><td></td>';
      ds.exams.forEach(ex=>{
        const count = ds.emps.filter(e=>(e.exam_ids||[]).includes(ex.id)).length;
        html += `<td>${count}</td>`;
      });
      html += '</tr>';

      // Aprobados per exam row (per-exam checks)
      html += '<tr class="sm-summary-row">';
      html += '<td></td><td></td><td class="sm-name" style="background:var(--bg3)!important"><strong>Aprobados</strong></td><td class="sm-title" style="background:var(--bg3)!important"></td><td></td>';
      ds.exams.forEach(ex=>{
        const count = ds.emps.filter(e=>{
          if(!(e.exam_ids||[]).includes(ex.id)) return false;
          const ch = (window._examChecks && window._examChecks[e.id]) || {};
          return !!ch[ex.id];
        }).length;
        html += `<td style="color:var(--green)">${count}</td>`;
      });
      html += '</tr>';

      html += '</tbody></table></div>';
    });

    container.innerHTML = html;
    smAutofitVerticalHeaders(container);
  }

  // Autofit de encabezados verticales: si el nombre del examen no cabe en la
  // altura objetivo, reduce el font-size del encabezado (por tabla) para
  // acercarse a esa altura y fija la altura real necesaria — nunca recorta
  // el texto, solo lo compacta cuando es posible.
  function smAutofitVerticalHeaders(container){
    const SM_VERT_TARGET_H = 220; // px — altura deseada del encabezado vertical
    const SM_VERT_MIN_FONT = 6.5; // px — tamaño mínimo legible
    container.querySelectorAll('table').forEach(table=>{
      const ths = table.querySelectorAll('.sm-th-vert');
      if(!ths.length) return;
      ths.forEach(th=>{ th.style.fontSize=''; th.style.height=''; });
      let maxH = 0;
      ths.forEach(th=>{ if(th.scrollHeight>maxH) maxH=th.scrollHeight; });
      if(maxH<=SM_VERT_TARGET_H) return;

      const baseFontPx = parseFloat(getComputedStyle(ths[0]).fontSize) || 10.4;
      const scale = SM_VERT_TARGET_H/maxH;
      const newFontPx = Math.max(SM_VERT_MIN_FONT, baseFontPx*scale);
      ths.forEach(th=>{ th.style.fontSize = newFontPx+'px'; });

      let fittedH = 0;
      ths.forEach(th=>{ if(th.scrollHeight>fittedH) fittedH=th.scrollHeight; });
      ths.forEach(th=>{ th.style.height = fittedH+'px'; });
    });
  }

  // ── PDF Configuration (alineación, logo, leyenda, tipografía de cajas) ──
  const SM_PDF_CONFIG_KEY = 'nmc-sm-pdf-config';
  const SM_PDF_CONFIG_DEFAULT = {
    logoAlign: 'left',       // left | center | right
    logoW: 25, logoH: 18,
    textAlign: 'right',      // left | center | right — bloque de título/área/meta
    fontFamily: 'helvetica', // helvetica | times | courier (fuentes estándar de jsPDF)
    headerSize: 9,
    cellSize: 5.5,
    symbolSize: 5.5,         // tamaño del contenido de celda (HTML px / PDF pt)
    symbolFont: 'auto',      // auto (con símbolos) | helvetica | times | courier
    legendShape: 'square',   // square | rounded | circle
    // symbol = contenido mostrado en la celda de examen, idéntico en HTML y PDF
    legend: [
      {label:'OK = Aprobado', color:'#c8e6c9', symbol:'OK'},
      {label:'X = Pendiente', color:'#fff9c4', symbol:'X'},
      {label:'No aplica',     color:'#ffffff', symbol:''}
    ],
    borderColor: '#b4bfda',
    borderWidth: 0.15
  };

  function smHexToRgb(hex){
    const h = String(hex||'#000000').replace('#','');
    const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
    const n = parseInt(full,16) || 0;
    return [(n>>16)&255, (n>>8)&255, n&255];
  }

  function smGetPdfConfig(){
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SM_PDF_CONFIG_KEY)||'null'); } catch(e){}
    const cfg = Object.assign({}, SM_PDF_CONFIG_DEFAULT, saved||{});
    // Merge por-item para tolerar configs guardadas antes de agregar el campo "symbol"
    cfg.legend = SM_PDF_CONFIG_DEFAULT.legend.map((def,i)=>{
      const savedItem = (saved && Array.isArray(saved.legend) && saved.legend[i]) || {};
      return Object.assign({}, def, savedItem);
    });
    return cfg;
  }

  // Alterna el botón activo dentro de un grupo y guarda el valor en el input oculto
  window.smSetGroupVal = function(hiddenId, val, btnEl){
    document.getElementById(hiddenId).value = val;
    btnEl.parentElement.querySelectorAll('.ct-btn').forEach(b=>b.classList.remove('active'));
    btnEl.classList.add('active');
  };

  function smFillPdfConfigForm(cfg){
    document.getElementById('smpdf-logo-w').value = cfg.logoW;
    document.getElementById('smpdf-logo-w-lbl').textContent = cfg.logoW+'mm';
    document.getElementById('smpdf-logo-h').value = cfg.logoH;
    document.getElementById('smpdf-logo-h-lbl').textContent = cfg.logoH+'mm';
    document.getElementById('smpdf-font-family').value = cfg.fontFamily;
    document.getElementById('smpdf-header-size').value = cfg.headerSize;
    document.getElementById('smpdf-header-size-lbl').textContent = cfg.headerSize+'pt';
    document.getElementById('smpdf-cell-size').value = cfg.cellSize;
    document.getElementById('smpdf-cell-size-lbl').textContent = cfg.cellSize+'pt';
    document.getElementById('smpdf-symbol-size').value = cfg.symbolSize;
    document.getElementById('smpdf-symbol-size-lbl').textContent = cfg.symbolSize+'pt';
    document.getElementById('smpdf-symbol-font').value = cfg.symbolFont;
    document.getElementById('smpdf-border-color').value = cfg.borderColor;
    document.getElementById('smpdf-border-width').value = cfg.borderWidth;
    document.getElementById('smpdf-border-width-lbl').textContent = cfg.borderWidth+'mm';
    cfg.legend.forEach((it,i)=>{
      document.getElementById(`smpdf-leg-color-${i}`).value = it.color;
      document.getElementById(`smpdf-leg-label-${i}`).value = it.label;
      document.getElementById(`smpdf-leg-symbol-${i}`).value = it.symbol;
    });

    const setGroup = (hiddenId, val)=>{
      const hidden = document.getElementById(hiddenId);
      hidden.value = val;
      const group = hidden.nextElementSibling;
      if(!group) return;
      group.querySelectorAll('.ct-btn').forEach(b=>b.classList.remove('active'));
      const idx = ['left','center','right'].indexOf(val);
      const shapeIdx = ['square','rounded','circle'].indexOf(val);
      const i = idx>=0 ? idx : shapeIdx;
      if(group.children[i]) group.children[i].classList.add('active');
    };
    setGroup('smpdf-logo-align', cfg.logoAlign);
    setGroup('smpdf-text-align', cfg.textAlign);
    setGroup('smpdf-legend-shape', cfg.legendShape);
  }

  window.smOpenPdfConfig = function(){
    smFillPdfConfigForm(smGetPdfConfig());
    document.getElementById('sm-pdf-config-modal').classList.add('open');
  };

  window.smSavePdfConfig = function(){
    const cfg = {
      logoAlign: document.getElementById('smpdf-logo-align').value,
      logoW: parseFloat(document.getElementById('smpdf-logo-w').value),
      logoH: parseFloat(document.getElementById('smpdf-logo-h').value),
      textAlign: document.getElementById('smpdf-text-align').value,
      fontFamily: document.getElementById('smpdf-font-family').value,
      headerSize: parseFloat(document.getElementById('smpdf-header-size').value),
      cellSize: parseFloat(document.getElementById('smpdf-cell-size').value),
      symbolSize: parseFloat(document.getElementById('smpdf-symbol-size').value),
      symbolFont: document.getElementById('smpdf-symbol-font').value,
      legendShape: document.getElementById('smpdf-legend-shape').value,
      legend: [0,1,2].map(i=>({
        label: document.getElementById(`smpdf-leg-label-${i}`).value || SM_PDF_CONFIG_DEFAULT.legend[i].label,
        color: document.getElementById(`smpdf-leg-color-${i}`).value,
        symbol: document.getElementById(`smpdf-leg-symbol-${i}`).value
      })),
      borderColor: document.getElementById('smpdf-border-color').value,
      borderWidth: parseFloat(document.getElementById('smpdf-border-width').value)
    };
    try { localStorage.setItem(SM_PDF_CONFIG_KEY, JSON.stringify(cfg)); } catch(e){}
    document.getElementById('sm-pdf-config-modal').classList.remove('open');
    smRenderLegend();
    if(typeof showToast==='function') showToast('⚙️ Configuración de PDF guardada');
  };

  window.smResetPdfConfig = function(){
    try { localStorage.removeItem(SM_PDF_CONFIG_KEY); } catch(e){}
    smFillPdfConfigForm(smGetPdfConfig());
    smRenderLegend();
    if(typeof showToast==='function') showToast('↺ Configuración de PDF restablecida');
  };

  function smLegendBoxRadius(shape){
    if(shape==='circle') return '50%';
    if(shape==='rounded') return '6px';
    return '2px';
  }

  function smRenderLegend(){
    const el = document.getElementById('sm-legend');
    if(!el) return;
    const cfg = smGetPdfConfig();
    const radius = smLegendBoxRadius(cfg.legendShape);
    let html = '<strong>Leyenda:</strong>';
    cfg.legend.forEach(item=>{
      html += `<div class="sm-legend-item"><div class="sm-legend-box" style="background:${esc(item.color)};border-radius:${radius}"></div> ${esc(item.label)}</div>`;
    });
    el.innerHTML = html;
  }

  // ── PDF Generation (A3) ──
  window.smGeneratePDF = function(){
    const filter = document.getElementById('sm-area-filter').value;
    if(!EMPLOYEES||!EMPLOYEES.length||!EXAMS||!EXAMS.length){
      if(typeof showToast==='function') showToast('⚠️ No hay datos cargados'); return;
    }
    const areas = filter ? [filter]
      : (typeof ALL_AREAS!=='undefined'&&ALL_AREAS.length? ALL_AREAS : [...new Set(EMPLOYEES.map(e=>e.area).filter(Boolean))].sort())
          .filter(a=>EMPLOYEES.some(e=>e.area===a&&(e.exam_ids||[]).length));
    const datasets = areas.map(a=>smGetAreaData(a)).filter(Boolean);
    if(!datasets.length){ if(typeof showToast==='function') showToast('⚠️ No hay datos para generar PDF'); return; }
    smBuildPDF(datasets);
  };

  window.smGenerateAllPDF = function(){
    if(!EMPLOYEES||!EMPLOYEES.length||!EXAMS||!EXAMS.length){
      if(typeof showToast==='function') showToast('⚠️ No hay datos cargados'); return;
    }
    const areas = (typeof ALL_AREAS!=='undefined'&&ALL_AREAS.length? ALL_AREAS : [...new Set(EMPLOYEES.map(e=>e.area).filter(Boolean))].sort())
        .filter(a=>EMPLOYEES.some(e=>e.area===a&&(e.exam_ids||[]).length));
    areas.forEach(area=>{
      const ds = smGetAreaData(area);
      if(ds) smBuildPDF([ds], area);
    });
  };

  function smBuildPDF(datasets, filenameSuffix){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:'landscape', unit:'mm', format:'a3'});
    const cfg = smGetPdfConfig();

    // Fuente Unicode embebida (subset de DejaVu Sans, cargada desde
    // sm-pdf-font.js) — permite usar símbolos especiales (• ● ✓ ✔ ✗ ✘ ★ ☆ ⚠
    // → ← etc.) en el contenido de celda y la leyenda, algo que las 14
    // fuentes estándar de PDF (Helvetica/Times/Courier) no soportan. No
    // incluye emoji a color (esos requieren tablas de color que jsPDF no
    // puede incrustar); para eso solo se ve el glifo en negro si existe.
    const SM_FONT_NAME = 'SMSymbols';
    let hasSymbolFont = false;
    if(window.SM_PDF_FONT_REGULAR){
      try {
        doc.addFileToVFS('SMSymbols-Regular.ttf', window.SM_PDF_FONT_REGULAR);
        doc.addFont('SMSymbols-Regular.ttf', SM_FONT_NAME, 'normal');
        if(window.SM_PDF_FONT_BOLD){
          doc.addFileToVFS('SMSymbols-Bold.ttf', window.SM_PDF_FONT_BOLD);
          doc.addFont('SMSymbols-Bold.ttf', SM_FONT_NAME, 'bold');
        }
        hasSymbolFont = true;
      } catch(e){ hasSymbolFont = false; }
    }

    // "auto" usa la fuente con símbolos si cargó; elegir un estándar a
    // propósito renuncia a los símbolos especiales (ver pdfSafeSymbol).
    const symbolFontName = cfg.symbolFont==='auto'
      ? (hasSymbolFont ? SM_FONT_NAME : cfg.fontFamily)
      : cfg.symbolFont;
    const symbolFontSupportsUnicode = cfg.symbolFont==='auto' && hasSymbolFont;

    // jsPDF Helvetica/Times/Courier no soportan Unicode — transliterar a ASCII
    function ascii(s){
      return String(s ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g,'')
        .replace(/Ñ/g,'N').replace(/ñ/g,'n')
        .replace(/[""]/g,'"').replace(/['']/g,"'")
        .replace(/[–—]/g,'-')
        .replace(/✓/g,'X')
        .replace(/[^\x20-\x7E]/g,'');
    }

    // Símbolo de celda para PDF: si la fuente activa soporta Unicode, se usa
    // el texto tal cual. Si el usuario forzó una fuente estándar (o la fuente
    // Unicode no cargó), se recurre a la transliteración ASCII con un
    // respaldo legible para que la celda no quede vacía.
    function pdfSafeSymbol(raw, fallback){
      if(symbolFontSupportsUnicode) return String(raw ?? '');
      const a = ascii(raw);
      if(a.trim()==='' && String(raw||'').trim()!=='') return fallback;
      return a;
    }

    // Grab NMC logo from header as base64 for PDF
    const logoEl = document.getElementById('hdr-logo');
    let logoSrc = null;
    if(logoEl && logoEl.src && logoEl.src.startsWith('data:image')){
      logoSrc = logoEl.src;
    }

    const certF = smGetCertFilter();
    const certLabel = certF==='skill' ? 'SKILL ASSESSMENT' : certF==='knowledge' ? 'Knowledge Certification' : '';

    const cellSizeSmall = Math.max(3, cfg.cellSize - 0.5);

    datasets.forEach((ds, dsIdx)=>{
      if(dsIdx > 0) doc.addPage('a3','landscape');

      // ── Autofit: measure longest name/title/numero ──
      const pxPerMm = 0.28; // approx chars-to-mm at fontSize 5.5
      let maxNumW = 4;
      let maxNameW = 12;
      let maxTitleW = 10;
      ds.emps.forEach(emp=>{
        const numL = ascii(emp.numero||'').length * pxPerMm * 5;
        const nameL = ascii(emp.nombre||'').length * pxPerMm * 5.5;
        const titleL = ascii(emp.puesto||'').length * pxPerMm * 5;
        if(numL > maxNumW) maxNumW = numL;
        if(nameL > maxNameW) maxNameW = nameL;
        if(titleL > maxTitleW) maxTitleW = titleL;
      });
      const numW = Math.min(Math.max(maxNumW, 10), 18);
      const nameW = Math.min(Math.max(maxNameW, 25), 55);
      const titleW = Math.min(Math.max(maxTitleW, 20), 45);
      const statusW = 14;

      // ── Geometría de los encabezados verticales de examen ──
      const fixedTotal = 7 + numW + nameW + titleW + statusW;
      const marginL = 5;
      const availW = 420 - marginL - 3;
      const examColW = Math.min(8, Math.max(4, (availW - fixedTotal) / ds.exams.length));
      const headerAreaTop = 30;
      const procLabelH = 5;
      const vertHeaderH = 100;
      const tableStartY = headerAreaTop + procLabelH + vertHeaderH + 2;

      const examStartX = marginL + fixedTotal;
      const examTotalW = ds.exams.length * examColW;

      // Dibuja el encabezado completo (barra de título, logo, leyenda y
      // nombres de examen en vertical). Se llama en la primera página del
      // área y se repite en cada página adicional que genere autoTable al
      // paginar la tabla — de lo contrario esas páginas quedan sin encabezado.
      function drawHeaderArt(){
        // Title bar — 22mm de alto para no encimar
        doc.setFillColor(27,79,138);
        doc.rect(0, 0, 420, 22, 'F');

        // Logo — posición según alineación configurada
        let logoX = 5;
        if(cfg.logoAlign==='center') logoX = (420 - cfg.logoW)/2;
        else if(cfg.logoAlign==='right') logoX = 420 - cfg.logoW - 5;
        const logoY = Math.max(1, (22 - cfg.logoH)/2);
        if(logoSrc){
          try { doc.addImage(logoSrc, 'PNG', logoX, logoY, cfg.logoW, cfg.logoH); } catch(e){}
        }

        // Bloque de texto (título/área/meta) — alineación configurable,
        // desplazado para no encimarse con el logo cuando comparten lado.
        let aX;
        if(cfg.textAlign==='left') aX = (logoSrc && cfg.logoAlign==='left') ? logoX+cfg.logoW+4 : 8;
        else if(cfg.textAlign==='center') aX = 210;
        else aX = (logoSrc && cfg.logoAlign==='right') ? logoX-4 : 412;

        doc.setTextColor(255,255,255);
        doc.setFontSize(13);
        doc.setFont(cfg.fontFamily,'bold');
        doc.text('Matriz de Habilidades / Skills Matrix', aX, 7, {align: cfg.textAlign});
        doc.setFontSize(11);
        doc.setFont(cfg.fontFamily,'normal');
        doc.text(ascii(`Area: ${ds.area}`), aX, 12.5, {align: cfg.textAlign});
        doc.setFontSize(7.5);
        const metaParts = [`Empleados: ${ds.emps.length}`, `Examenes: ${ds.exams.length}`];
        if(certLabel) metaParts.push(`Tipo: ${certLabel}`);
        doc.text(ascii(metaParts.join('  |  ')), aX, 17, {align: cfg.textAlign});
        doc.setFontSize(7);
        doc.text(`Generado: ${new Date().toLocaleDateString('es-MX')}`, aX, 20.5, {align: cfg.textAlign});

        // Legend — debajo de la caja titulo (Y=24), forma y colores configurables.
        // El rect plano (forma "square") usa doc.rect() en vez de roundedRect con
        // radio casi cero: algunos motores de impresión/PDF fallan al rasterizar
        // curvas Bézier degeneradas y la caja terminaba sin imprimirse.
        doc.setFontSize(6.5);
        doc.setFont(symbolFontName, 'normal');
        doc.setTextColor(0,0,0);
        doc.setDrawColor(0,0,0);
        doc.setLineWidth(0.1);
        let lx = 10;
        cfg.legend.forEach((item, li)=>{
          doc.setFillColor(...smHexToRgb(item.color));
          let textX;
          if(cfg.legendShape==='circle'){
            const r = 1.9;
            doc.circle(lx+r, 25.75, r, 'FD');
            textX = lx + 2*r + 1.5;
          } else if(cfg.legendShape==='rounded'){
            doc.roundedRect(lx, 24, 5, 3.5, 1, 1, 'FD');
            textX = lx + 5 + 1.5;
          } else {
            doc.rect(lx, 24, 5, 3.5, 'FD');
            textX = lx + 5 + 1.5;
          }
          const label = pdfSafeSymbol(item.label, SM_PDF_CONFIG_DEFAULT.legend[li].label);
          doc.text(label, textX, 27);
          lx = textX + doc.getTextWidth(label) + 6;
        });

        // Fondo azul de los títulos de columnas fijas — mismo alto total que
        // el bloque de encabezados de examen (banner + área vertical), para
        // que ambos grupos de títulos queden alineados a la misma altura.
        const headerBlockH = procLabelH + vertHeaderH;
        doc.setFillColor(27,79,138);
        doc.rect(marginL, headerAreaTop, fixedTotal, headerBlockH, 'F');

        // Títulos de columnas fijas, centrados verticalmente en ese bloque
        doc.setFontSize(cfg.headerSize);
        doc.setFont(cfg.fontFamily,'bold');
        doc.setTextColor(255,255,255);
        const fixedCols = [
          {label:'#', w:7},
          {label:'No. Emp', w:numW},
          {label:'Nombre / Name', w:nameW},
          {label:'Puesto / Title', w:titleW},
          {label:'Estatus', w:statusW}
        ];
        const fixedCenterY = headerAreaTop + headerBlockH/2 + 1.5;
        let fx = marginL;
        fixedCols.forEach(col=>{
          doc.text(ascii(col.label), fx + col.w/2, fixedCenterY, {align:'center'});
          fx += col.w;
        });

        // "Procedimientos / Procedures" horizontal label bar
        doc.setFillColor(21,65,128);
        doc.rect(examStartX, headerAreaTop, examTotalW, procLabelH, 'F');
        doc.setFontSize(13);
        doc.setFont(cfg.fontFamily,'bold');
        doc.setTextColor(255,255,255);
        doc.text('Procedimientos / Procedures', examStartX + examTotalW/2, headerAreaTop + 3.5, {align:'center'});

        // Vertical header background
        doc.setFillColor(27,79,138);
        doc.rect(examStartX, headerAreaTop + procLabelH, examTotalW, vertHeaderH, 'F');

        // Draw each exam name vertically
        doc.setFontSize(cfg.headerSize);
        doc.setFont(cfg.fontFamily,'normal');
        doc.setTextColor(255,255,255);
        ds.exams.forEach((ex, ei)=>{
          const x = examStartX + ei * examColW + examColW/2 + 1;
          const y = headerAreaTop + procLabelH + vertHeaderH - 2;
          const txt = ascii(ex.tema.length > 55 ? ex.tema.substring(0,53)+'..' : ex.tema);
          doc.text(txt, x, y, {angle: 90});
        });
      }

      // Dibuja el pie de página: espacio de firma del Gerente de Área
      // (Nombre / Firma / Fecha) centrado, más el crédito y el número de
      // página. Se llama en cada página (ver didDrawPage más abajo).
      function drawFooterArt(){
        const pageH = doc.internal.pageSize.getHeight();

        const sigFieldW = 55;
        const sigGap = 10;
        const sigTotalW = sigFieldW*3 + sigGap*2;
        const sigStartX = (420 - sigTotalW) / 2;
        const sigLineY = pageH - 15;

        doc.setFontSize(7);
        doc.setFont(cfg.fontFamily,'bold');
        doc.setTextColor(90,100,120);
        doc.text('Gerente de Area', 210, sigLineY - 4, {align:'center'});

        doc.setDrawColor(120,140,180);
        doc.setLineWidth(0.2);
        doc.setFontSize(6.5);
        doc.setFont(cfg.fontFamily,'normal');
        let sx = sigStartX;
        ['Nombre', 'Firma', 'Fecha'].forEach(label=>{
          doc.line(sx, sigLineY, sx + sigFieldW, sigLineY);
          doc.text(label, sx + sigFieldW/2, sigLineY + 3.5, {align:'center'});
          sx += sigFieldW + sigGap;
        });

        doc.setFontSize(6);
        doc.setTextColor(120,140,180);
        doc.text('NMC — Sistema de Control de Entrenamientos · Skill Matrix', 10, pageH - 4);
        doc.text(`Pagina ${dsIdx+1} de ${datasets.length}`, 380, pageH - 4);
      }

      drawHeaderArt();

      // Build table data — includes No. Emp column
      const head = [['#', 'No. Emp', 'Nombre / Name', 'Puesto / Title', 'Estatus', ...ds.exams.map(()=>'')]];

      // examCellKind[rowIndex][examIndex] = 'ok'|'pending'|'na' — evita ambigüedad
      // en didParseCell cuando el símbolo configurado coincide entre estados.
      const examCellKind = [];
      const body = [];
      ds.emps.forEach((emp, i)=>{
        const empExamIds = new Set(emp.exam_ids||[]);
        const checks = (window._examChecks && window._examChecks[emp.id]) || {};
        const kinds = [];
        const examTexts = ds.exams.map(ex=>{
          if(!empExamIds.has(ex.id)){ kinds.push('na'); return pdfSafeSymbol(cfg.legend[2].symbol, ''); }
          if(checks[ex.id]){ kinds.push('ok'); return pdfSafeSymbol(cfg.legend[0].symbol, 'OK'); }
          kinds.push('pending'); return pdfSafeSymbol(cfg.legend[1].symbol, 'X');
        });
        examCellKind.push(kinds);
        body.push([
          i+1,
          ascii(emp.numero||''),
          ascii(emp.nombre||''),
          ascii(emp.puesto||''),
          ascii(emp.estatus||'-'),
          ...examTexts
        ]);
      });

      // Summary rows
      body.push([
        '', '', 'Total Asignados', '', '',
        ...ds.exams.map(ex=> String(ds.emps.filter(e=>(e.exam_ids||[]).includes(ex.id)).length))
      ]);
      body.push([
        '', '', 'Aprobados', '', '',
        ...ds.exams.map(ex=> String(ds.emps.filter(e=>{
          if(!(e.exam_ids||[]).includes(ex.id)) return false;
          const ch = (window._examChecks && window._examChecks[e.id]) || {};
          return !!ch[ex.id];
        }).length))
      ]);

      const totalDataRows = ds.emps.length;

      // Dynamic column styles — autofit widths
      const colStyles = {
        0: {cellWidth: 7, halign:'center'},
        1: {cellWidth: numW, halign:'center', fontSize: cellSizeSmall},
        2: {cellWidth: nameW, halign:'left', overflow:'ellipsize'},
        3: {cellWidth: titleW, halign:'left', overflow:'ellipsize', fontSize: cellSizeSmall},
        4: {cellWidth: statusW, halign:'center', fontSize: cellSizeSmall}
      };
      ds.exams.forEach((_, ei)=>{
        colStyles[5 + ei] = {cellWidth: examColW, halign:'center'};
      });

      doc.autoTable({
        head,
        body,
        startY: tableStartY,
        theme: 'grid',
        styles: {
          font: cfg.fontFamily,
          fontSize: cfg.cellSize,
          cellPadding: 1.2,
          lineWidth: cfg.borderWidth,
          lineColor: smHexToRgb(cfg.borderColor),
          overflow: 'ellipsize',
          halign: 'center',
          valign: 'middle'
        },
        headStyles: {
          font: cfg.fontFamily,
          fillColor: [27,79,138],
          textColor: [27,79,138],
          fontStyle: 'bold',
          fontSize: 0.1,
          halign: 'center',
          cellPadding: 0.3,
          minCellHeight: 1
        },
        columnStyles: colStyles,
        didParseCell: function(data){
          // Todos los títulos del head (fijos y de examen) ya se dibujaron a
          // mano en drawHeaderArt() — el header real de autoTable se oculta
          // por completo para no duplicarlos.
          if(data.section==='head' && data.column.index >= 5){
            data.cell.styles.fillColor = [27,79,138];
            data.cell.styles.textColor = [27,79,138];
            data.cell.styles.fontSize = 0.1;
            data.cell.styles.minCellHeight = 1;
            data.cell.styles.cellPadding = 0.3;
          }
          if(data.section==='body'){
            const ri = data.row.index;
            const ci = data.column.index;

            // Estatus column (index 4)
            if(ci === 4 && ri < totalDataRows){
              const st = data.cell.raw;
              if(st==='Aprobado'){ data.cell.styles.fillColor=[187,222,251]; data.cell.styles.textColor=[13,71,161]; data.cell.styles.fontStyle='bold'; }
              else if(st==='Pendiente'){ data.cell.styles.fillColor=[255,249,196]; data.cell.styles.textColor=[245,127,23]; data.cell.styles.fontStyle='bold'; }
            }
            // Exam cells (index 5+) — color y símbolo vienen de la configuración
            // de leyenda (misma fuente que usa el HTML), identificados por
            // examCellKind en vez del texto de la celda para evitar ambigüedad.
            if(ci >= 5 && ri < totalDataRows){
              const kind = examCellKind[ri][ci-5];
              data.cell.styles.font = symbolFontName;
              data.cell.styles.fontSize = cfg.symbolSize;
              if(kind==='ok'){
                data.cell.styles.fillColor = smHexToRgb(cfg.legend[0].color);
                data.cell.styles.textColor = [46,125,50];
                data.cell.styles.fontStyle = 'bold';
              } else if(kind==='pending'){
                data.cell.styles.fillColor = smHexToRgb(cfg.legend[1].color);
                data.cell.styles.textColor = [245,127,23];
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.fillColor = smHexToRgb(cfg.legend[2].color);
              }
            }
            // Summary rows
            if(ri >= totalDataRows){
              data.cell.styles.fillColor = [214,225,240];
              data.cell.styles.fontStyle = 'bold';
              if(ri === totalDataRows+1 && ci>=5){
                const v = parseInt(data.cell.raw);
                if(!isNaN(v) && v>0){ data.cell.styles.textColor=[46,125,50]; }
              }
            }
          }
        },
        margin: {left: marginL, right:5, top: tableStartY},
        tableWidth: 'auto',
        didDrawPage: function(data){
          // Cuando la tabla no cabe en una sola página, autoTable crea
          // páginas nuevas — sin esto quedaban sin encabezado (en blanco).
          // data.pageNumber es relativo a ESTE autoTable() (siempre arranca en 1,
          // incluso en el 2do+ dataset de un PDF combinado) — NO es el número de
          // página absoluto del documento, por eso se compara contra 1 y no
          // contra el conteo de páginas del doc.
          if(data.pageNumber > 1) drawHeaderArt();
          drawFooterArt();
        }
      });
    });

    const suffix = filenameSuffix || (datasets.length===1 ? datasets[0].area : 'Todas_las_Areas');
    const certSuffix = certLabel ? '_'+certLabel.replace(/\s+/g,'_') : '';
    doc.save(`Skill_Matrix_${suffix.replace(/\s+/g,'_')}${certSuffix}_${new Date().toISOString().slice(0,10)}.pdf`);
    if(typeof showToast==='function') showToast(ascii('PDF generado: ' + suffix + (certLabel?' ('+certLabel+')':'')));
  }

  window.smRenderMatrix = smRenderMatrix;

  function smSyncLogo(){
    const src = document.getElementById('hdr-logo');
    const dst = document.getElementById('sm-logo');
    if(src && dst && src.src){
      dst.src = src.src;
      dst.style.display = '';
      const hdr = dst.closest('.sm-header');
      if(hdr){ dst.style.maxHeight = hdr.offsetHeight + 'px'; }
    }
  }

  // Auto-render when view is shown
  const origShowView = window.showView;
  window.showView = function(name){
    origShowView(name);
    if(name==='skillmatrix'){ smSyncLogo(); smRenderMatrix(); }
  };
})();
