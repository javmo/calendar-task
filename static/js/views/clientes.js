// Clientes view + client detail/edit modals.
// Extracted literally from legacy-inline.js.

import { TASK_COLORS } from '../constants.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { formatDateShort } from '../utils/dates.js';
import { getTaskStatus } from '../utils/format.js';
import { showToast } from '../ui/toast.js';
import { showConfirm } from '../ui/dialogs.js';
import { render } from '../router.js';
import { populateFilters, populateFormSelects } from './list.js';

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
        const co = TASK_COLORS[cat] || '#64748b';
        h += `<span class="cc-cat-tag" style="background:${co}20;color:${co};border:1px solid ${co}40">${cat}</span>`;
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
      const co = TASK_COLORS[cat] || '#64748b';
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
      const co = TASK_COLORS[cat] || '#64748b';
      h += `<span class="cc-cat-tag" style="background:${co}20;color:${co};border:1px solid ${co}40">${cat}</span>`;
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
        const co = TASK_COLORS[t.tarea] || '#64748b';
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

const ALL_TASK_CATEGORIES = Object.keys(TASK_COLORS);

export function renderCeCategorias(selected = []) {
  const container = document.getElementById('ceCategorias');
  let h = '';
  ALL_TASK_CATEGORIES.forEach(cat => {
    const checked = selected.includes(cat);
    const co = TASK_COLORS[cat] || '#64748b';
    h += `<label class="ce-cat-item ${checked ? 'checked' : ''}" onclick="this.classList.toggle('checked')">`;
    h += `<input type="checkbox" value="${cat}" ${checked ? 'checked' : ''} onchange="this.parentElement.classList.toggle('checked',this.checked);updateCeGenerateSection()">`;
    h += `<span class="ce-cat-dot" style="background:${co}"></span>${cat}</label>`;
  });
  container.innerHTML = h;
}

export function getSelectedCategorias() {
  return [...document.querySelectorAll('#ceCategorias input:checked')].map(cb => cb.value);
}

function renderCeNotasPorTarea(selected = [], notasPorTarea = {}) {
  const section = document.getElementById('ceNotasPorTareaSection');
  const container = document.getElementById('ceNotasPorTarea');
  if (!section || !container) return;
  if (!selected || selected.length === 0) {
    section.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  section.style.display = '';
  let h = '';
  selected.forEach(cat => {
    const co = TASK_COLORS[cat] || '#64748b';
    const nota = notasPorTarea[cat] || '';
    h += `<div style="margin-bottom:10px">`;
    h += `<label style="font-size:11px;font-weight:700;color:${co};display:flex;align-items:center;gap:5px;margin-bottom:4px">`;
    h += `<span style="width:8px;height:8px;border-radius:50%;background:${co};display:inline-block;flex-shrink:0"></span>${cat}</label>`;
    h += `<textarea data-cat="${cat}" rows="2" placeholder="Nota para tareas de ${cat}..." style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font-size:12px;font-family:inherit;resize:vertical;line-height:1.4;box-sizing:border-box">${nota}</textarea>`;
    h += `</div>`;
  });
  container.innerHTML = h;
}

function getNotasPorTarea() {
  const result = {};
  document.querySelectorAll('#ceNotasPorTarea textarea[data-cat]').forEach(ta => {
    const cat = ta.dataset.cat;
    const val = ta.value.trim();
    if (val) result[cat] = val;
  });
  return result;
}

export function updateCeGenerateSection() {
  const cats = getSelectedCategorias();
  document.getElementById('ceGenerateSection').style.display = (cats.length > 0 && state.editingClientId !== null) ? '' : 'none';
  // Preserve existing nota values when re-rendering after category toggle
  const existing = getNotasPorTarea();
  renderCeNotasPorTarea(cats, existing);
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
  renderCeNotasPorTarea([], {});
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
  renderCeCategorias(c.categorias || []);
  renderCeNotasPorTarea(c.categorias || [], c.notasPorTarea || {});
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

  // First save categories
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
