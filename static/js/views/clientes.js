// Clientes view + client detail/edit modals.
// Extracted literally from legacy-inline.js.

import { getTaskColor, getActiveTaskTypes } from '../taskTypes.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { formatDateShort } from '../utils/dates.js';
import { getTaskStatus } from '../utils/format.js';
import { showToast } from '../ui/toast.js';
import { showConfirm } from '../ui/dialogs.js';
import { render } from '../router.js';
import { populateFilters, populateFormSelects } from './list.js';

// --------------- Recurrence helpers (mirrors backend _normalize_cat) ---------------

export function normCat(cat) {
  if (typeof cat === 'string') return { tarea: cat, frecuencia_tipo: 'mensual', frecuencia_valor: 1 };
  return {
    tarea: cat.tarea || cat,
    frecuencia_tipo: cat.frecuencia_tipo || 'mensual',
    frecuencia_valor: cat.frecuencia_valor || 1,
  };
}

function catLabel(cat) {
  const c = normCat(cat);
  if (c.frecuencia_tipo === 'mensual' && c.frecuencia_valor === 1) return c.tarea;
  const tipoLabel = { mensual: 'x/mes', quincenal: 'quincenal', semanal: 'x/sem', diaria: 'diaria' };
  const suffix = (c.frecuencia_tipo === 'mensual' || c.frecuencia_tipo === 'semanal')
    ? `${c.frecuencia_valor}${tipoLabel[c.frecuencia_tipo]}`
    : tipoLabel[c.frecuencia_tipo];
  return `${c.tarea} (${suffix})`;
}

function catTarea(cat) { return normCat(cat).tarea; }

// =================== RENDER: CLIENTES ===================
export function renderClientes() {
  document.getElementById('monthLabel').textContent = 'Base de Clientes';

  const search = state.clientSearch.toLowerCase();
  const filtered = state.clientes.filter(c =>
    !search || c.nombre.toLowerCase().includes(search) || (c.cuit && c.cuit.includes(search))
  );

  // Count tasks per client
  const taskCounts = {};
  state.tasks.forEach(t => {
    taskCounts[t.cliente] = (taskCounts[t.cliente] || 0) + 1;
  });

  let h = `<div class="clients-toolbar">
    <div class="search-wrapper" style="max-width:300px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input type="text" class="search-input" id="clientSearchInput" placeholder="Buscar cliente o CUIT..." value="${state.clientSearch}" oninput="onClientSearch(this.value)">
    </div>
    <span class="clients-count">${filtered.length} cliente${filtered.length!==1?'s':''}</span>
    <button class="btn btn-primary" onclick="addClient()">＋ Nuevo Cliente</button>
  </div>`;

  h += `<div class="clients-grid">`;
  filtered.forEach(c => {
    const tc = taskCounts[c.nombre] || 0;
    const claves = [
      { label: 'ARCA', val: c.claveArca },
      { label: 'AGIP', val: c.claveAgip },
      { label: 'ARBA', val: c.claveArba },
    ];
    h += `<div class="client-card" onclick="showClientDetail(${c.clienteId})">`;
    h += `<div class="cc-header">`;
    h += `<div><div class="cc-name">${c.nombre}</div>`;
    h += `<div class="cc-cuit" style="display:flex;align-items:center;gap:6px">CUIT: ${c.cuit || '-'}`;
    if (c.condicionIva) h += ` <span class="iva-badge iva-${c.condicionIva}">${c.condicionIva}</span>`;
    h += `</div></div>`;
    h += `<span class="cc-tasks-count">${tc} tarea${tc!==1?'s':''}</span>`;
    h += `</div>`;
    h += `<div class="cc-claves">`;
    claves.forEach(cl => {
      const has = cl.val && cl.val !== '-' && cl.val !== '';
      h += `<span class="cc-clave ${has?'has-value':'no-value'}">${cl.label}: ${has?'✓':'✗'}</span>`;
    });
    h += `</div>`;
    const pago = c.formaPago && c.formaPago !== '-' && c.formaPago !== '';
    h += `<span class="cc-pago ${pago?'':'no-pago'}">${pago ? '💳 '+c.formaPago : 'Sin forma de pago'}</span>`;
    if (c.categorias && c.categorias.length > 0) {
      h += `<div class="cc-cats">`;
      c.categorias.forEach(cat => {
        const co = getTaskColor(catTarea(cat));
        h += `<span class="cc-cat-tag" style="background:${co}20;color:${co};border:1px solid ${co}40">${catLabel(cat)}</span>`;
      });
      h += `</div>`;
    }
    h += `</div>`;
  });
  h += `</div>`;

  document.getElementById('viewClientes').innerHTML = h;
  // Restore focus after full re-render so typing is uninterrupted
  if (state.clientSearch) {
    const inp = document.getElementById('clientSearchInput');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
}

export function onClientSearch(val) {
  state.clientSearch = val;
  renderClientes();
}

// ── Tipo de comprobante helpers ──
const TIPO_LABEL = {
  1:'Fac. A', 2:'ND A', 3:'NC A', 4:'Rec. A',
  6:'Fac. B', 7:'ND B', 8:'NC B', 9:'Rec. B',
  11:'Fac. C', 12:'ND C', 13:'NC C', 15:'Rec. C',
  19:'Fac. E', 21:'ND E', 22:'NC E',
  51:'Fac. M', 52:'ND M', 53:'NC M',
};
const TIPO_CLASS = {
  1:'fac-a',2:'fac-a',3:'fac-a',4:'fac-a',
  6:'fac-b',7:'fac-b',8:'fac-b',9:'fac-b',
  11:'fac-c',12:'fac-c',13:'fac-c',15:'fac-c',
  19:'fac-e',21:'fac-e',22:'fac-e',
  51:'fac-a',52:'fac-a',53:'fac-a',
};
function fmtFecha(s) {
  if (!s) return '—';
  const str = String(s);
  if (str.length === 8) return `${str.slice(6)}/${str.slice(4,6)}/${str.slice(0,4)}`;
  if (str.includes('-')) return str.split('T')[0].split('-').reverse().join('/');
  return s;
}
function fmtARS(n) {
  if (n == null || n === '') return '—';
  return '$ ' + Math.round(Number(n)).toLocaleString('es-AR');
}
function getMesName(ym) {
  if (!ym || ym.length < 6) return '?';
  const year = ym.slice(0, 4);
  const month = parseInt(ym.slice(4, 6), 10);
  const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${MES[month - 1] ?? '?'} ${year}`;
}

// Module-level state for the billing detail modal
let _billingData = null;
let _billingClientName = '';

function buildBillingStatsHTML(data) {
  const list = data?.comprobantes ?? [];
  const total = data?.totalFacturado ?? 0;
  if (list.length === 0) {
    return `<div class="cd-comp-empty">Sin comprobantes registrados para este CUIT</div>`;
  }

  // Group by YYYYMM
  const byMonth = {};
  list.forEach(c => {
    const fecha = String(c.fechaCbte || '');
    const ym = fecha.length >= 6 ? fecha.slice(0, 6) : 'unknown';
    if (!byMonth[ym]) byMonth[ym] = { total: 0, count: 0 };
    byMonth[ym].total += Number(c.importeTotal || 0);
    byMonth[ym].count++;
  });
  const months = Object.entries(byMonth)
    .filter(([ym]) => ym !== 'unknown')
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12);
  const maxMonthTotal = months.length > 0 ? Math.max(...months.map(([, v]) => v.total)) : 0;

  // Type breakdown
  const byTipo = {};
  list.forEach(c => {
    const tipo = c.tipoCbte ?? 0;
    const label = TIPO_LABEL[tipo] ?? `Cbte ${tipo}`;
    const cls = TIPO_CLASS[tipo] ?? 'fac-x';
    if (!byTipo[label]) byTipo[label] = { cls, count: 0, total: 0 };
    byTipo[label].count++;
    byTipo[label].total += Number(c.importeTotal || 0);
  });

  let h = '';

  // Summary strip
  h += `<div class="cd-bill-summary">`;
  h += `<div class="cd-bill-total-block">`;
  h += `<span class="cd-bill-total-label">Total facturado</span>`;
  h += `<span class="cd-bill-total-val">${fmtARS(total)}</span>`;
  h += `</div>`;
  h += `<div class="cd-bill-meta">`;
  h += `<span class="cd-bill-meta-count">${list.length} comprobante${list.length !== 1 ? 's' : ''}</span>`;
  h += `<button class="cd-bill-detail-btn" onclick="showBillingDetail()">Ver detalle ›</button>`;
  h += `</div>`;
  h += `</div>`;

  // Type chips
  if (Object.keys(byTipo).length > 0) {
    h += `<div class="cd-bill-types">`;
    Object.entries(byTipo).forEach(([label, info]) => {
      h += `<div class="cd-bill-type-chip">`;
      h += `<span class="cd-comp-badge ${info.cls}">${label}</span>`;
      h += `<span class="cd-bill-type-count">${info.count}</span>`;
      h += `<span class="cd-bill-type-amt">${fmtARS(info.total)}</span>`;
      h += `</div>`;
    });
    h += `</div>`;
  }

  // Monthly timeline bars
  if (months.length > 0) {
    h += `<div class="cd-bill-months">`;
    months.forEach(([ym, mdata]) => {
      const pct = maxMonthTotal > 0 ? Math.max(3, Math.round(mdata.total / maxMonthTotal * 100)) : 0;
      h += `<div class="cd-bill-month-row">`;
      h += `<span class="cd-bill-month-name">${getMesName(ym)}</span>`;
      h += `<div class="cd-bill-month-bar-wrap"><div class="cd-bill-month-bar" style="width:${pct}%"></div></div>`;
      h += `<span class="cd-bill-month-amt">${fmtARS(mdata.total)}</span>`;
      h += `</div>`;
    });
    h += `</div>`;
  }

  return h;
}

function buildBillingDetailHTML(data, clientName) {
  const list = data?.comprobantes ?? [];
  const total = data?.totalFacturado ?? 0;
  let h = `<div class="bd-header">`;
  h += `<div class="bd-header-info">`;
  h += `<div class="bd-header-name">🧾 ${clientName}</div>`;
  h += `<div class="bd-header-sub">${list.length} comprobante${list.length !== 1 ? 's' : ''} · ${fmtARS(total)}</div>`;
  h += `</div>`;
  h += `<button class="cd-dossier-close" onclick="closeBillingDetail()" aria-label="Cerrar">✕</button>`;
  h += `</div>`;
  h += `<div class="bd-body">`;
  if (list.length === 0) {
    h += `<div class="cd-comp-empty">Sin comprobantes</div>`;
  } else {
    list.forEach(c => {
      const tipo = c.tipoCbte ?? 0;
      const label = TIPO_LABEL[tipo] ?? `Cbte ${tipo}`;
      const cls = TIPO_CLASS[tipo] ?? 'fac-x';
      const num = `${String(c.ptoVta ?? 0).padStart(4, '0')}-${String(c.nroCbte ?? 0).padStart(8, '0')}`;
      h += `<div class="bd-comp-row">`;
      h += `<span class="cd-comp-badge ${cls}">${label}</span>`;
      h += `<div class="bd-comp-info">`;
      h += `<div class="bd-comp-num">${num}</div>`;
      if (c.descripcion) h += `<div class="bd-comp-desc">${c.descripcion}</div>`;
      h += `</div>`;
      h += `<div class="bd-comp-right">`;
      h += `<div class="bd-comp-importe">${fmtARS(c.importeTotal)}</div>`;
      h += `<div class="bd-comp-fecha">${fmtFecha(c.fechaCbte)}</div>`;
      if (c.cae) h += `<span class="bd-comp-cae">✓ CAE</span>`;
      h += `</div>`;
      h += `</div>`;
    });
  }
  h += `</div>`;
  return h;
}

export function showBillingDetail() {
  if (!_billingData) return;
  const panel = document.getElementById('billingDetailPanel');
  if (!panel) return;
  panel.innerHTML = buildBillingDetailHTML(_billingData, _billingClientName);
  document.getElementById('billingDetailOverlay').classList.add('active');
}

export function closeBillingDetail() {
  document.getElementById('billingDetailOverlay').classList.remove('active');
}

export async function showClientDetail(clienteId) {
  const c = state.clientes.find(x => x.clienteId === clienteId);
  if (!c) return;
  state.editingClientId = clienteId;

  const clientTasks = state.tasks.filter(t => t.cliente === c.nombre);
  const today = new Date().toISOString().split('T')[0];

  // ── Stats ──
  const total = clientTasks.length;
  const finalizadas = clientTasks.filter(t => t.finalizada).length;
  const vencidas   = clientTasks.filter(t => !t.finalizada && t.vencimiento < today).length;
  const pendientes = clientTasks.filter(t => !t.finalizada).length;
  const pct = total > 0 ? Math.round(finalizadas / total * 100) : 0;
  const nextVto = clientTasks
    .filter(t => !t.finalizada && t.vencimiento >= today)
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))[0];

  // ── IVA labels ──
  const ivaFull  = { RI: 'Resp. Inscripto (RI)', MT: 'Monotributista (MT)', EX: 'Exento (EX)', CF: 'Cons. Final (CF)' };

  // ── Field helpers ──
  const plain = v => (!v || v === '-' || v === '')
    ? '<span class="dv empty">—</span>'
    : `<span class="dv">${v}</span>`;

  // ═══════════════ BUILD HTML ═══════════════
  let h = '';

  // ── HEADER ──
  h += `<div class="cd-dossier-header">`;
  h += `<button class="cd-dossier-close" onclick="closeClientDetail()" aria-label="Cerrar">✕</button>`;
  h += `<div class="cd-dossier-name">👤 ${c.nombre}</div>`;
  h += `<div class="cd-dossier-sub">`;
  h += `<span class="cd-dossier-cuit">CUIT: ${c.cuit || '—'}</span>`;
  if (c.condicionIva) {
    h += `<span class="cd-dossier-iva iva-${c.condicionIva}">${ivaFull[c.condicionIva] || c.condicionIva}</span>`;
  }
  if (c.email && c.email !== '-' && c.email !== '') {
    h += `<span class="cd-dossier-cuit">✉ ${c.email}</span>`;
  }
  h += `</div>`;
  // Stats chips
  h += `<div class="cd-stats-row">`;
  h += `<span class="cd-stat-chip"><span class="sv">${total}</span>&nbsp;tarea${total !== 1 ? 's' : ''}</span>`;
  if (vencidas > 0) h += `<span class="cd-stat-chip chip-danger"><span class="sv">${vencidas}</span>&nbsp;vencida${vencidas !== 1 ? 's' : ''}</span>`;
  h += `<span class="cd-stat-chip"><span class="sv">${pendientes}</span>&nbsp;pendiente${pendientes !== 1 ? 's' : ''}</span>`;
  h += `<span class="cd-stat-chip chip-success"><span class="sv">${pct}%</span>&nbsp;completado</span>`;
  if (nextVto) h += `<span class="cd-stat-chip">📅&nbsp;próx. ${formatDateShort(nextVto.vencimiento)}</span>`;
  h += `</div>`;
  h += `</div>`;

  // ── BODY ──
  h += `<div class="cd-dossier-body">`;

  // ════ LEFT PANEL ════
  h += `<div class="cd-panel-left">`;

  // 1. Datos principales
  h += `<div>`;
  h += `<div class="cd-dsection-title">📋 Datos del cliente</div>`;
  h += `<div class="cd-dcells">`;
  h += `<div class="cd-dcell"><label>CUIT</label>${plain(c.cuit)}</div>`;
  h += `<div class="cd-dcell"><label>Forma de pago</label>${plain(c.formaPago)}</div>`;
  if (c.email && c.email !== '-' && c.email !== '') {
    h += `<div class="cd-dcell span2"><label>Email</label>${plain(c.email)}</div>`;
  }
  h += `</div>`;
  h += `</div>`;

  // 2. Accesos
  const accesos = [
    { label: 'ARCA',  icon: '🏛️', val: c.claveArca },
    { label: 'AGIP',  icon: '🏙️', val: c.claveAgip },
    { label: 'ARBA',  icon: '🏠', val: c.claveArba },
    { label: 'Otra',  icon: '🔑', val: c.otraClave },
  ];
  h += `<div>`;
  h += `<div class="cd-dsection-title">🔐 Accesos</div>`;
  h += `<div class="cd-access-grid">`;
  accesos.forEach(acc => {
    const has = acc.val && acc.val !== '-' && acc.val !== '';
    h += `<div class="cd-access-card ${has ? 'has-key' : ''}">`;
    h += `<span class="cd-access-icon">${acc.icon}</span>`;
    h += `<div class="cd-access-info">`;
    h += `<div class="cd-access-label">${acc.label}</div>`;
    if (has) {
      h += `<div class="cd-access-val masked" title="Click para revelar" onclick="this.classList.toggle('masked')">${acc.val}</div>`;
    } else {
      h += `<div class="cd-access-val empty">Sin clave</div>`;
    }
    h += `</div></div>`;
  });
  h += `</div>`;
  h += `</div>`;

  // 3. ARCA / Facturación
  h += `<div>`;
  h += `<div class="cd-dsection-title">🏛️ ARCA / Facturación</div>`;
  h += `<div class="cd-arca-card">`;
  h += `<div class="cd-arca-iva-row">`;
  h += `<span class="cd-arca-iva-label">Condición IVA</span>`;
  if (c.condicionIva) {
    h += `<span class="iva-badge iva-${c.condicionIva}">${ivaFull[c.condicionIva] || c.condicionIva}</span>`;
  } else {
    h += `<span class="cd-arca-empty">Sin datos</span>`;
  }
  h += `</div>`;
  if (c.arcaNotas && c.arcaNotas.trim()) {
    h += `<div class="cd-arca-notas">${c.arcaNotas.replace(/\n/g, '<br>')}</div>`;
  }
  if (c.condicionIva || (c.arcaNotas && c.arcaNotas.trim())) {
    h += `<div class="cd-arca-sync">🔄 Datos sincronizados vía ARCA MCP</div>`;
  }
  h += `</div>`;
  h += `</div>`;

  // 4. Categorías de tareas
  if (c.categorias && c.categorias.length > 0) {
    h += `<div>`;
    h += `<div class="cd-dsection-title">🏷️ Categorías de tareas</div>`;
    h += `<div class="cd-cats-wrap">`;
    c.categorias.forEach(cat => {
      const co = getTaskColor(catTarea(cat));
      h += `<span class="cc-cat-tag" style="background:${co}20;color:${co};border:1px solid ${co}40">${catLabel(cat)}</span>`;
    });
    h += `</div>`;
    h += `</div>`;
  }

  // 5. Notas generales
  if (c.notas && c.notas.trim()) {
    h += `<div>`;
    h += `<div class="cd-dsection-title">📝 Notas del cliente</div>`;
    h += `<div class="cd-notas-box">${c.notas.replace(/\n/g, '<br>')}</div>`;
    h += `</div>`;
  }

  // 6. Notas por tipo de tarea
  if (c.notasPorTarea && Object.keys(c.notasPorTarea).length > 0) {
    h += `<div>`;
    h += `<div class="cd-dsection-title">📌 Notas por tipo de tarea</div>`;
    Object.entries(c.notasPorTarea).forEach(([cat, nota]) => {
      const co = getTaskColor(cat);
      h += `<div class="cd-nota-task-item" style="border-left-color:${co}">`;
      h += `<div class="cd-nota-task-tag" style="color:${co}">${cat}</div>`;
      h += `<div style="font-size:11px;color:var(--text-secondary);line-height:1.5">${nota.replace(/\n/g, '<br>')}</div>`;
      h += `</div>`;
    });
    h += `</div>`;
  }

  h += `</div>`; // end cd-panel-left

  // ════ RIGHT PANEL ════
  h += `<div class="cd-panel-right">`;

  // ── Tasks FIRST ──
  h += `<div class="cd-section-divider">📅 Tareas</div>`;

  // Task stats bar
  h += `<div class="cd-tasks-stats">`;
  h += `<div class="cd-task-stat"><span class="ts-val">${total}</span><span class="ts-lbl">Total</span></div>`;
  h += `<div class="cd-task-stat ts-pend"><span class="ts-val">${pendientes}</span><span class="ts-lbl">Pendientes</span></div>`;
  h += `<div class="cd-task-stat ts-done"><span class="ts-val">${finalizadas}</span><span class="ts-lbl">Finalizadas</span></div>`;
  h += `<div class="cd-task-stat ts-over"><span class="ts-val">${vencidas}</span><span class="ts-lbl">Vencidas</span></div>`;
  h += `</div>`;

  // Progress bar
  h += `<div class="cd-progress-wrap"><div class="cd-progress-bar" style="width:${pct}%"></div></div>`;

  // Tasks grouped by month
  if (total === 0) {
    h += `<div class="cd-empty-tasks"><div class="cd-empty-icon">📋</div><div class="cd-empty-txt">No tiene tareas asignadas</div></div>`;
  } else {
    const mesOrder = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const byMes = {};
    clientTasks.forEach(t => {
      const m = t.mes || 'Sin mes';
      if (!byMes[m]) byMes[m] = [];
      byMes[m].push(t);
    });
    const orderedMeses = [
      ...mesOrder.filter(m => byMes[m]),
      ...Object.keys(byMes).filter(m => !mesOrder.includes(m)),
    ];
    orderedMeses.forEach(mes => {
      const tasks = [...byMes[mes]].sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
      const mesFin = tasks.filter(t => t.finalizada).length;
      h += `<div class="cd-month-group">`;
      h += `<div class="cd-month-label">${mes}<span class="cd-month-count">${mesFin}/${tasks.length}</span></div>`;
      tasks.forEach(t => {
        const co = getTaskColor(t.tarea);
        const st = getTaskStatus(t);
        const isOverdue = !t.finalizada && st === 'overdue';
        h += `<div class="cd-task-row ${t.finalizada ? 'task-fin' : ''} ${isOverdue ? 'task-overdue' : ''}" style="border-left-color:${co}">`;
        h += `<span class="cdt-tarea">${t.tarea}</span>`;
        h += `<span class="cdt-vto">${formatDateShort(t.vencimiento)}</span>`;
        h += `<span class="cdt-status">${t.finalizada ? '✅' : isOverdue ? '🔴' : st === 'ready' ? '✔️' : '⏳'}</span>`;
        h += `</div>`;
      });
      h += `</div>`;
    });
  }

  // ── Facturación stats AFTER tasks (async-loaded) ──
  if (c.cuit && c.cuit.trim() && c.cuit !== '-') {
    h += `<div class="cd-section-divider">🧾 Facturación</div>`;
    h += `<div id="cd-comprobantes-section"><div class="cd-comp-loading">⏳ Cargando estadísticas...</div></div>`;
  }

  h += `</div>`; // end cd-panel-right
  h += `</div>`; // end cd-dossier-body

  // ── FOOTER ──
  h += `<div class="cd-dossier-footer">`;
  h += `<button class="btn" onclick="closeClientDetail()">Cerrar</button>`;
  h += `<button class="btn btn-primary" onclick="editClientFromDetail()">✏️ Editar cliente</button>`;
  h += `</div>`;

  document.getElementById('clientDetailPanel').innerHTML = h;
  document.getElementById('clientDetailOverlay').classList.add('active');

  // Fetch comprobantes async → inject billing stats
  if (c.cuit && c.cuit.trim() && c.cuit !== '-') {
    try {
      const data = await api('GET', `/api/clientes/${clienteId}/comprobantes`);
      _billingData = data;
      _billingClientName = c.nombre;
      const sec = document.getElementById('cd-comprobantes-section');
      if (sec) sec.innerHTML = buildBillingStatsHTML(data);
    } catch {
      const sec = document.getElementById('cd-comprobantes-section');
      if (sec) sec.innerHTML = `<div class="cd-comp-empty">No se pudieron cargar las estadísticas</div>`;
    }
  }
}

export function closeClientDetail() {
  document.getElementById('clientDetailOverlay').classList.remove('active');
}

export function renderCeCategorias(selected = []) {
  const container = document.getElementById('ceCategorias');
  const activeTypes = getActiveTaskTypes();
  // Normalize selected to TareaConfig objects
  const selectedNorm = selected.map(normCat);
  // Include categories not in active types (historical)
  const extraCats = selectedNorm
    .filter(cfg => !activeTypes.some(tt => tt.name === cfg.tarea))
    .map(cfg => cfg.tarea);
  const allCatNames = [...activeTypes.map(tt => tt.name), ...extraCats];

  let h = '';
  allCatNames.forEach(catName => {
    const cfg = selectedNorm.find(c => c.tarea === catName) || { tarea: catName, frecuencia_tipo: 'mensual', frecuencia_valor: 1 };
    const checked = selectedNorm.some(c => c.tarea === catName);
    const co = getTaskColor(catName);
    const safeId = `cecat_${catName.replace(/\W/g,'_')}`;
    h += `<div class="ce-cat-row ${checked ? 'checked' : ''}" id="${safeId}">`;
    h += `<label class="ce-cat-item">`;
    h += `<input type="checkbox" data-cat="${catName}" ${checked ? 'checked' : ''} onchange="onCeCatChange('${catName.replace(/'/g,"\\'")}');updateCeGenerateSection()">`;
    h += `<span class="ce-cat-dot" style="background:${co}"></span>${catName}`;
    h += `</label>`;
    h += `<div class="ce-cat-recur ${checked ? '' : 'hidden'}">`;
    h += `<select class="ce-recur-tipo" data-cat="${catName}" onchange="onCeRecurChange('${catName.replace(/'/g,"\\'")}')">`;
    ['mensual','quincenal','semanal','diaria'].forEach(t => {
      h += `<option value="${t}" ${cfg.frecuencia_tipo === t ? 'selected' : ''}>${t}</option>`;
    });
    h += `</select>`;
    const showValor = cfg.frecuencia_tipo === 'mensual' || cfg.frecuencia_tipo === 'semanal';
    h += `<input type="number" class="ce-recur-valor" data-cat="${catName}" min="1" max="31" value="${cfg.frecuencia_valor}" ${showValor ? '' : 'style="display:none"'} onchange="onCeRecurChange('${catName.replace(/'/g,"\\'")}')">`;
    h += `<span class="ce-recur-hint" data-cat="${catName}">${_recurHint(cfg)}</span>`;
    h += `</div>`;
    h += `</div>`;
  });
  container.innerHTML = h;
}

function _recurHint(cfg) {
  if (cfg.frecuencia_tipo === 'mensual') {
    if (cfg.frecuencia_valor === 1) return '1×/mes';
    return `${cfg.frecuencia_valor}×/mes`;
  }
  if (cfg.frecuencia_tipo === 'quincenal') return 'días 15 y fin de mes';
  if (cfg.frecuencia_tipo === 'semanal') return `${cfg.frecuencia_valor}×/sem (~${cfg.frecuencia_valor*4}/mes)`;
  if (cfg.frecuencia_tipo === 'diaria') return 'lun–vie c/día';
  return '';
}

export function onCeCatChange(catName) {
  const safeId = `cecat_${catName.replace(/\W/g,'_')}`;
  const row = document.getElementById(safeId);
  if (!row) return;
  const cb = row.querySelector(`input[type="checkbox"]`);
  const recur = row.querySelector('.ce-cat-recur');
  if (cb.checked) {
    row.classList.add('checked');
    recur.classList.remove('hidden');
  } else {
    row.classList.remove('checked');
    recur.classList.add('hidden');
  }
}

export function onCeRecurChange(catName) {
  const safeId = `cecat_${catName.replace(/\W/g,'_')}`;
  const row = document.getElementById(safeId);
  if (!row) return;
  const tipo = row.querySelector('.ce-recur-tipo').value;
  const valorEl = row.querySelector('.ce-recur-valor');
  const hint = row.querySelector('.ce-recur-hint');
  const showValor = tipo === 'mensual' || tipo === 'semanal';
  valorEl.style.display = showValor ? '' : 'none';
  const valor = parseInt(valorEl.value) || 1;
  hint.textContent = _recurHint({ frecuencia_tipo: tipo, frecuencia_valor: valor });
}

export function getSelectedCategorias() {
  const checked = [...document.querySelectorAll('#ceCategorias input[type="checkbox"]:checked')];
  return checked.map(cb => {
    const catName = cb.dataset.cat;
    const safeId = `cecat_${catName.replace(/\W/g,'_')}`;
    const row = document.getElementById(safeId);
    const tipo = row ? (row.querySelector('.ce-recur-tipo')?.value || 'mensual') : 'mensual';
    const valor = row ? (parseInt(row.querySelector('.ce-recur-valor')?.value) || 1) : 1;
    return { tarea: catName, frecuencia_tipo: tipo, frecuencia_valor: valor };
  });
}

function getNotasPorTarea() {
  const result = {};
  document.querySelectorAll('#ceBitacora textarea[data-cat]').forEach(ta => {
    const cat = ta.dataset.cat;
    const val = ta.value.trim();
    if (val) result[cat] = val;
  });
  return result;
}

export function renderCeBitacora(notasPorTarea = {}) {
  const container = document.getElementById('ceBitacora');
  if (!container) return;
  const activeTypes = getActiveTaskTypes();
  // Include any types that have existing notes but are no longer active
  const extraCats = Object.keys(notasPorTarea).filter(c => !activeTypes.some(tt => tt.name === c));
  const allCats = [...activeTypes.map(tt => tt.name), ...extraCats];
  let h = '';
  allCats.forEach(cat => {
    const co = getTaskColor(cat);
    const nota = notasPorTarea[cat] || '';
    const hasNota = !!nota;
    h += `<div class="ce-bit-row${hasNota ? ' expanded' : ''}" id="cebit-${CSS.escape(cat)}">`;
    h += `<button type="button" class="ce-bit-btn" style="--cat-color:${co}" onclick="toggleCeBitacora('${cat.replace(/'/g,"\\'")}')">`;
    h += `<span class="ce-bit-dot" style="background:${co}"></span>${cat}`;
    h += `<span class="ce-bit-indicator">${hasNota ? '✎' : '＋'}</span>`;
    h += `</button>`;
    h += `<textarea class="ce-bit-ta" data-cat="${cat}" rows="2" placeholder="Nota para tareas de ${cat}...">${nota}</textarea>`;
    h += `</div>`;
  });
  container.innerHTML = h;
}

export function toggleCeBitacora(cat) {
  const escaped = CSS.escape(cat);
  const row = document.getElementById(`cebit-${escaped}`);
  if (!row) return;
  row.classList.toggle('expanded');
  if (row.classList.contains('expanded')) {
    const ta = row.querySelector('textarea');
    if (ta) ta.focus();
  }
}

export function updateCeGenerateSection() {
  const cats = getSelectedCategorias();
  document.getElementById('ceGenerateSection').style.display = (cats.length > 0 && state.editingClientId !== null) ? '' : 'none';
}

export function addClient() {
  state.editingClientId = null;
  document.getElementById('clientEditTitle').innerHTML = '➕ Nuevo Cliente <button class="modal-close" onclick="closeClientEdit()" aria-label="Cerrar">✕</button>';
  document.getElementById('ceNombre').value = '';
  document.getElementById('ceCuit').value = '';
  document.getElementById('ceEmail').value = '';
  document.getElementById('ceClaveArca').value = '';
  document.getElementById('ceClaveAgip').value = '';
  document.getElementById('ceClaveArba').value = '';
  document.getElementById('ceOtraClave').value = '';
  document.getElementById('ceNotas').value = '';
  document.getElementById('ceFormaPago').value = '';
  document.getElementById('ceCondicionIva').value = '';
  document.getElementById('ceArcaNotas').value = '';
  document.getElementById('ceDeleteBtn').style.display = 'none';
  renderCeCategorias([]);
  renderCeBitacora({});
  document.getElementById('ceGenerateSection').style.display = 'none';
  document.getElementById('clientEditOverlay').classList.add('active');
}

export function editClientFromDetail() {
  const c = state.clientes.find(x => x.clienteId === state.editingClientId);
  if (!c) return;
  closeClientDetail();

  document.getElementById('clientEditTitle').innerHTML = '✏️ Editar Cliente <button class="modal-close" onclick="closeClientEdit()" aria-label="Cerrar">✕</button>';
  document.getElementById('ceNombre').value = c.nombre;
  document.getElementById('ceCuit').value = c.cuit || '';
  document.getElementById('ceEmail').value = c.email || '';
  document.getElementById('ceClaveArca').value = c.claveArca || '';
  document.getElementById('ceClaveAgip').value = c.claveAgip || '';
  document.getElementById('ceClaveArba').value = c.claveArba || '';
  document.getElementById('ceOtraClave').value = c.otraClave || '';
  document.getElementById('ceNotas').value = c.notas || '';
  document.getElementById('ceFormaPago').value = c.formaPago || '';
  document.getElementById('ceCondicionIva').value = c.condicionIva ?? '';
  document.getElementById('ceArcaNotas').value = c.arcaNotas ?? '';
  document.getElementById('ceDeleteBtn').style.display = '';
  renderCeCategorias((c.categorias || []).map(normCat));
  renderCeBitacora(c.notasPorTarea || {});
  // Default generate range: current month to December
  const now = new Date();
  document.getElementById('ceGenFrom').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('ceGenTo').value = `${now.getFullYear()}-12`;
  updateCeGenerateSection();
  document.getElementById('clientEditOverlay').classList.add('active');
}

export async function generateClientTasks() {
  if (!state.editingClientId) return;
  const cats = getSelectedCategorias();
  if (!cats.length) { showToast('Seleccioná al menos una categoría', 'error'); return; }

  // First save recurrence config
  await api('PUT', `/api/clientes/${state.editingClientId}`, { categorias: cats });
  const idx = state.clientes.findIndex(c => c.clienteId === state.editingClientId);
  if (idx >= 0) state.clientes[idx].categorias = cats;

  const from = document.getElementById('ceGenFrom').value;
  const to = document.getElementById('ceGenTo').value;
  if (!from || !to) { showToast('Seleccioná rango de meses', 'error'); return; }

  try {
    const result = await api('POST', `/api/clientes/${state.editingClientId}/generate-tasks`, {
      fromMonth: from, toMonth: to
    });
    state.tasks = await api('GET', '/api/tasks');
    populateFilters();
    render();
    showToast(`${result.created} tarea${result.created !== 1 ? 's' : ''} creada${result.created !== 1 ? 's' : ''} para ${result.cliente}`, 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function saveClientEdit() {
  const nombre = document.getElementById('ceNombre').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }

  const data = {
    nombre,
    cuit: document.getElementById('ceCuit').value.trim(),
    email: document.getElementById('ceEmail').value.trim(),
    claveArca: document.getElementById('ceClaveArca').value.trim(),
    claveAgip: document.getElementById('ceClaveAgip').value.trim(),
    claveArba: document.getElementById('ceClaveArba').value.trim(),
    otraClave: document.getElementById('ceOtraClave').value.trim(),
    notas: document.getElementById('ceNotas').value.trim(),
    notasPorTarea: getNotasPorTarea(),
    formaPago: document.getElementById('ceFormaPago').value,
    categorias: getSelectedCategorias(),
    condicionIva: document.getElementById('ceCondicionIva').value || null,
    arcaNotas: document.getElementById('ceArcaNotas').value.trim() || null,
  };

  try {
    if (state.editingClientId !== null) {
      const updated = await api('PUT', `/api/clientes/${state.editingClientId}`, data);
      const idx = state.clientes.findIndex(c => c.clienteId === state.editingClientId);
      if (idx >= 0) state.clientes[idx] = updated;
      // Reload tasks in case name changed
      state.tasks = await api('GET', '/api/tasks');
      showToast('Cliente actualizado', 'success');
    } else {
      const created = await api('POST', '/api/clientes', data);
      state.clientes.push(created);
      showToast('Cliente creado', 'success');
    }
    closeClientEdit();
    populateFilters();
    populateFormSelects();
    render();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function deleteClient() {
  if (state.editingClientId === null) return;
  const c = state.clientes.find(x => x.clienteId === state.editingClientId);
  if (!await showConfirm('Eliminar cliente', `¿Eliminar a <strong>"${c?.nombre}"</strong>?<br>Esto NO eliminará sus tareas.`, { icon: '🗑️', confirmText: 'Eliminar', danger: true })) return;
  try {
    await api('DELETE', `/api/clientes/${state.editingClientId}`);
    state.clientes = state.clientes.filter(x => x.clienteId !== state.editingClientId);
    closeClientEdit();
    render();
    showToast('Cliente eliminado', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export function closeClientEdit() {
  document.getElementById('clientEditOverlay').classList.remove('active');
}
