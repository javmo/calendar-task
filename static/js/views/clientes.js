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
    h += `<div><div class="cc-name">${c.nombre}</div><div class="cc-cuit">CUIT: ${c.cuit || '-'}</div></div>`;
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

export function showClientDetail(clienteId) {
  const c = state.clientes.find(x => x.clienteId === clienteId);
  if (!c) return;
  state.editingClientId = clienteId;

  document.getElementById('cdTitle').textContent = '👤 ' + c.nombre;

  const clientTasks = state.tasks.filter(t => t.cliente === c.nombre);

  // Group tasks by mes
  const byMes = {};
  clientTasks.forEach(t => {
    const m = t.mes || 'Sin mes';
    if (!byMes[m]) byMes[m] = [];
    byMes[m].push(t);
  });

  const maskVal = (v) => {
    if (!v || v === '-' || v === '') return '<span class="cd-val empty">—</span>';
    return `<span class="cd-val masked" title="Click para ver" onclick="this.classList.toggle('masked')">${v}</span>`;
  };
  const plainVal = (v) => {
    if (!v || v === '-' || v === '') return '<span class="cd-val empty">—</span>';
    return `<span class="cd-val">${v}</span>`;
  };

  let h = `<div class="cd-info-grid">`;
  h += `<div class="cd-info-item"><label>CUIT</label>${plainVal(c.cuit)}</div>`;
  h += `<div class="cd-info-item"><label>Forma de Pago</label>${plainVal(c.formaPago)}</div>`;
  h += `<div class="cd-info-item"><label>Clave ARCA</label>${maskVal(c.claveArca)}</div>`;
  h += `<div class="cd-info-item"><label>Clave AGIP</label>${maskVal(c.claveAgip)}</div>`;
  h += `<div class="cd-info-item"><label>Clave ARBA</label>${maskVal(c.claveArba)}</div>`;
  h += `<div class="cd-info-item"><label>Otra Clave</label>${maskVal(c.otraClave)}</div>`;
  h += `</div>`;

  if (c.notas && c.notas.trim()) {
    h += `<div class="cd-notas-section"><div class="cd-notas-label">Notas generales del Cliente</div><div class="cd-notas-text">${c.notas.replace(/\n/g, '<br>')}</div></div>`;
  }

  if (c.notasPorTarea && Object.keys(c.notasPorTarea).length > 0) {
    h += `<div class="cd-notas-section cd-notas-por-tarea-section"><div class="cd-notas-label">Notas por Tipo de Tarea</div>`;
    Object.entries(c.notasPorTarea).forEach(([cat, nota]) => {
      const co = getTaskColor(cat);
      h += `<div class="cd-nota-tarea-item" style="border-left:3px solid ${co};padding-left:10px;margin-bottom:8px">`;
      h += `<div style="font-size:11px;font-weight:700;color:${co};margin-bottom:3px">${cat}</div>`;
      h += `<div class="cd-notas-text">${nota.replace(/\n/g, '<br>')}</div>`;
      h += `</div>`;
    });
    h += `</div>`;
  }

  if (c.categorias && c.categorias.length > 0) {
    h += `<div style="margin-bottom:16px"><label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">Categorías de tareas</label>`;
    h += `<div class="ce-categorias">`;
    c.categorias.forEach(cat => {
      const co = getTaskColor(catTarea(cat));
      h += `<span class="cc-cat-tag" style="background:${co}20;color:${co};border:1px solid ${co}40">${catLabel(cat)}</span>`;
    });
    h += `</div></div>`;
  }

  h += `<div class="cd-tasks-section">`;
  h += `<h3>📋 Tareas asignadas <span style="font-size:12px;color:var(--text-muted);font-weight:400">(${clientTasks.length})</span></h3>`;
  h += `<div class="cd-tasks-list">`;

  if (clientTasks.length === 0) {
    h += `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No tiene tareas asignadas</div>`;
  } else {
    const mesOrder = ['Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    mesOrder.forEach(mes => {
      const tasks = byMes[mes];
      if (!tasks) return;
      h += `<div style="font-size:11px;font-weight:700;color:var(--accent);margin:8px 0 4px;text-transform:uppercase;letter-spacing:.5px">${mes}</div>`;
      tasks.forEach(t => {
        const co = getTaskColor(t.tarea);
        const st = getTaskStatus(t);
        const isFin = t.finalizada;
        h += `<div class="cd-task-row" style="border-color:${co}">`;
        h += `<span class="cdt-tarea">${t.tarea}</span>`;
        h += `<span class="cdt-vto">${formatDateShort(t.vencimiento)}</span>`;
        h += `<span style="font-size:10px;color:var(--text-muted)">${t.semana}</span>`;
        h += `<span class="cdt-status">${isFin?'✅':''}${st==='overdue'?'🔴':''}${st==='ready'?'✔️':''}${st==='pending'&&!isFin?'⏳':''}</span>`;
        h += `</div>`;
      });
    });
  }
  h += `</div></div>`;

  document.getElementById('cdBody').innerHTML = h;
  document.getElementById('clientDetailOverlay').classList.add('active');
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
