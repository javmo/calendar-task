// List view + filters + stats + finalized panel + legend.
// Extracted literally from legacy-inline.js.

import { MONTHS_ES, TASK_COLORS } from '../constants.js';
import { state } from '../state.js';
import { formatDateShort, formatDateFull } from '../utils/dates.js';
import { getTaskStatus, getEstadoLabel, getEstadoIcon } from '../utils/format.js';
import { render } from '../router.js';
import { isAdmin } from '../tasks/taskActions.js';
import { isMyTask } from './summary.js';
import { historyBtnHtml, unreadDotHtml } from '../tasks/history.js';

// =================== FILTERS ===================
export function getFilteredTasks() {
  const fM = document.getElementById('filterMes').value;
  const fC = document.getElementById('filterCliente').value;
  const fT = document.getElementById('filterTarea').value;
  const fR = document.getElementById('filterResponsable').value;
  const fE = document.getElementById('filterEstado').value;
  const search = document.getElementById('searchInput').value.toLowerCase();

  return state.tasks.filter(t => {
    if (fM && !(t.vencimiento || '').startsWith(fM)) return false;
    if (fC && t.cliente !== fC) return false;
    if (fT && t.tarea !== fT) return false;
    if (fR && t.responsable !== fR) return false;
    if (fE) {
      if (fE === 'finalized' && !t.finalizada) return false;
      if (fE === 'en_revision' && t.estado !== 'en_revision') return false;
      if (fE === 'devuelta' && t.estado !== 'devuelta') return false;
      if (fE === 'pending') {
        if (t.finalizada) return false;
        if (t.estado === 'en_revision' || t.estado === 'devuelta') return false;
        const st = getTaskStatus(t);
        if (st === 'overdue') return false;
      }
      if (fE === 'overdue') {
        if (t.finalizada) return false;
        if (getTaskStatus(t) !== 'overdue') return false;
      }
    }
    if (search && !t.cliente.toLowerCase().includes(search) && !t.tarea.toLowerCase().includes(search)) return false;
    return true;
  });
}

export function populateFilters() {
  const all = state.tasks;
  const sel = (id, items, label) => {
    const el = document.getElementById(id);
    const v = el.value;
    el.innerHTML = `<option value="">${label}</option>` + items.map(i => `<option value="${i}">${i}</option>`).join('');
    el.value = v;
  };
  const mesEl = document.getElementById('filterMes');
  const mesVal = mesEl.value;
  const meses = [...new Set(all.map(t => (t.vencimiento||'').slice(0,7)).filter(Boolean))].sort();
  mesEl.innerHTML = `<option value="">Todos los meses</option>` + meses.map(m => {
    const [y, mo] = m.split('-');
    const label = `${MONTHS_ES[parseInt(mo,10)-1]} ${y}`;
    return `<option value="${m}">${label}</option>`;
  }).join('');
  mesEl.value = mesVal;

  const fM = mesEl.value;
  const monthTasks = fM ? all.filter(t => (t.vencimiento||'').startsWith(fM)) : all;

  sel('filterCliente', [...new Set(monthTasks.map(t => t.cliente))].sort(), 'Todos los clientes');
  sel('filterTarea', [...new Set(monthTasks.map(t => t.tarea))].sort(), 'Todas las tareas');
  sel('filterResponsable', [...new Set(monthTasks.map(t => t.responsable))].sort(), 'Todos');
}

export function populateFormSelects() {
  // Clients: merge from state.clientes + any in tasks (covers all)
  const clienteNames = new Set(state.clientes.map(c => c.nombre));
  state.tasks.forEach(t => clienteNames.add(t.cliente));
  document.getElementById('formCliente').innerHTML =
    `<option value="">-- Nuevo cliente --</option>` +
    [...clienteNames].sort().map(c => `<option value="${c}">${c}</option>`).join('');

  // Task types: all from TASK_COLORS + any in existing tasks
  const allTypes = new Set(Object.keys(TASK_COLORS));
  state.tasks.forEach(t => allTypes.add(t.tarea));
  document.getElementById('formTarea').innerHTML =
    [...allTypes].sort().map(t => `<option value="${t}">${t}</option>`).join('');

  // Responsable: show registered users + legacy names
  const userNames = state.users.filter(u => u.responsableName).map(u => u.responsableName);
  const taskNames = [...new Set(state.tasks.map(t => t.responsable))];
  const allNames = [...new Set([...userNames, ...taskNames])].filter(Boolean).sort();
  document.getElementById('formResponsable').innerHTML =
    allNames.map(n => `<option value="${n}">${n}</option>`).join('');
}

export function renderLegend() {
  const fM = document.getElementById('filterMes').value;
  const tasks = fM ? state.tasks.filter(t => (t.vencimiento||'').startsWith(fM)) : state.tasks;
  const activeTipos = [...new Set(tasks.map(t => t.tarea))];
  document.getElementById('legend').innerHTML =
    activeTipos
      .filter(n => TASK_COLORS[n])
      .map(n => `<div class="legend-item"><div class="legend-dot" style="background:${TASK_COLORS[n]}"></div>${n}</div>`)
      .join('');
}

// =================== STATS ===================
export function updateStats() {
  const year = state.currentDate.getFullYear();
  const month = String(state.currentDate.getMonth() + 1).padStart(2, '0');
  const currentMonth = `${year}-${month}`;
  let pending = 0, overdue = 0, ready = 0, finalized = 0, review = 0;
  state.tasks.filter(t => (t.vencimiento || '').startsWith(currentMonth)).forEach(t => {
    const s = getTaskStatus(t);
    if (s === 'finalized') finalized++;
    else if (s === 'en_revision') review++;
    else if (s === 'overdue') overdue++;
    else if (s === 'ready') ready++;
    else pending++;
  });
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statOverdue').textContent = overdue;
  document.getElementById('statDone').textContent = ready;
  document.getElementById('statReview').textContent = review;
  document.getElementById('statFinalized').textContent = finalized;
}

// =================== RENDER: LIST ===================
export function renderList() {
  const fC = document.getElementById('filterCliente').value;
  const fT = document.getElementById('filterTarea').value;
  const fR = document.getElementById('filterResponsable').value;
  const fE = document.getElementById('filterEstado').value;
  const search = document.getElementById('searchInput').value.toLowerCase();

  const mesEl = document.getElementById('filterMes');
  const fMes = mesEl.value;

  let currentMonth;
  if (fMes) {
    // Specific month selected from dropdown
    currentMonth = fMes;
    const [y, m] = fMes.split('-').map(Number);
    state.currentDate = new Date(y, m - 1, 1);
    document.getElementById('monthLabel').textContent = `${MONTHS_ES[m-1]} ${y}`;
  } else if (fC) {
    // Client selected but no month — show all months for this client
    currentMonth = null;
    document.getElementById('monthLabel').textContent = `${fC} — Todos los meses`;
  } else {
    // Default: use current navigation date
    const year = state.currentDate.getFullYear(), month = state.currentDate.getMonth();
    currentMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
    document.getElementById('monthLabel').textContent = `${MONTHS_ES[month]} ${year}`;
    if ([...mesEl.options].some(o => o.value === currentMonth)) mesEl.value = currentMonth;
  }

  let tasks = state.tasks.filter(t => {
    if (currentMonth && !(t.vencimiento || '').startsWith(currentMonth)) return false;
    if (fC && t.cliente !== fC) return false;
    if (fT && t.tarea !== fT) return false;
    if (fR && t.responsable !== fR) return false;
    if (fE) {
      if (fE === 'finalized' && !t.finalizada) return false;
      if (fE === 'en_revision' && t.estado !== 'en_revision') return false;
      if (fE === 'devuelta' && t.estado !== 'devuelta') return false;
      if (fE === 'pending') { if (t.finalizada || t.estado === 'en_revision' || t.estado === 'devuelta' || getTaskStatus(t) === 'overdue') return false; }
      if (fE === 'overdue') { if (t.finalizada || getTaskStatus(t) !== 'overdue') return false; }
    }
    if (search && !t.cliente.toLowerCase().includes(search) && !t.tarea.toLowerCase().includes(search)) return false;
    return true;
  });
  tasks.sort((a, b) => {
    let va = a[state.sortCol] || '', vb = b[state.sortCol] || '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return va < vb ? -state.sortDir : va > vb ? state.sortDir : 0;
  });

  const si = c => c === state.sortCol ? (state.sortDir === 1 ? '▲' : '▼') : '';

  // Bulk-delete toolbar (admin only, shown when tasks are selected)
  const selCount = state.selectedTasks.size;
  let h = '';
  if (isAdmin()) {
    h += `<div class="list-bulk-toolbar" id="bulkToolbar" style="${selCount>0?'':'display:none'}">`;
    h += `<span class="bulk-count">${selCount} tarea${selCount!==1?'s':''} seleccionada${selCount!==1?'s':''}</span>`;
    h += `<button class="btn btn-danger" onclick="deleteSelectedTasks()">🗑 Eliminar seleccionadas</button>`;
    h += `<button class="btn" onclick="clearListSelection()">✕ Deseleccionar</button>`;
    h += `</div>`;
  }

  h += `<table class="list-table"><thead><tr>`;
  if (isAdmin()) h += `<th style="width:32px;text-align:center"><input type="checkbox" id="selectAllChk" onclick="toggleSelectAll(this.checked)" title="Seleccionar todo"></th>`;
  h += `<th onclick="sortBy('cliente')">Cliente <span class="sort-icon">${si('cliente')}</span></th>`;
  h += `<th onclick="sortBy('tarea')">Tarea <span class="sort-icon">${si('tarea')}</span></th>`;
  h += `<th onclick="sortBy('responsable')">Quién <span class="sort-icon">${si('responsable')}</span></th>`;
  h += `<th onclick="sortBy('vencimiento')">Vto <span class="sort-icon">${si('vencimiento')}</span></th>`;
  h += `<th onclick="sortBy('semana')">Sem <span class="sort-icon">${si('semana')}</span></th>`;
  h += `<th>Estado</th><th>Acciones</th>`;
  h += `</tr></thead><tbody>`;

  tasks.forEach(t => {
    const st = getTaskStatus(t);
    const co = TASK_COLORS[t.tarea] || '#64748b';
    const vb = st === 'overdue' ? 'overdue' : 'upcoming';
    const isFin = t.finalizada;
    const estado = t.estado || 'pendiente';
    const isSel = state.selectedTasks.has(t.taskId);

    h += `<tr class="${isFin?'finalized':''}${isSel?' selected-row':''}" ${isFin?'':`ondblclick="editTask(${t.taskId})"`}>`;
    if (isAdmin()) h += `<td onclick="event.stopPropagation()" style="text-align:center"><input type="checkbox" class="task-select-chk" data-id="${t.taskId}" ${isSel?'checked':''} onchange="toggleTaskSelect(${t.taskId},this.checked)"></td>`;
    h += `<td><strong>${t.cliente}</strong></td>`;
    h += `<td><span class="type-badge" style="background:${co}15;color:${co}">${t.tarea}</span></td>`;
    h += `<td><span class="card-badge badge-${(t.responsable||'').toLowerCase()}">${t.responsable}</span></td>`;
    h += `<td><span class="vto-badge ${vb}">${formatDateShort(t.vencimiento)}</span></td>`;
    h += `<td style="font-size:11px;color:var(--text-muted)">${t.semana}</td>`;

    if (isFin) {
      h += `<td><span class="fin-tag">✅ Finalizada ${formatDateFull(t.fechaFinalizacion)}</span></td>`;
      h += `<td><div class="status-checks">`;
      if (isAdmin()) h += `<button class="restore-btn" onclick="restoreTask(${t.taskId})" title="Restaurar">↩</button>`;
      h += historyBtnHtml(t.taskId);
      if (isAdmin()) h += `<button class="check-btn" onclick="deleteTask(${t.taskId})" title="Eliminar tarea" style="color:var(--danger);border-color:var(--danger-border)">🗑</button>`;
      h += `</div></td>`;
    } else {
      h += `<td><span class="estado-badge estado-${estado}">${getEstadoIcon(estado)} ${getEstadoLabel(estado)}</span></td>`;
      h += `<td><div class="status-checks">`;
      if (isAdmin()) {
        h += `<button class="check-btn ${t.completado?'active':''}" onclick="toggleStatus(${t.taskId},'completado')" title="Completado">✔</button>`;
        h += `<button class="check-btn ${t.enviado?'active':''}" onclick="toggleStatus(${t.taskId},'enviado')" title="Enviado">📩</button>`;
        h += `<button class="check-btn finalize-btn" onclick="finalizeTask(${t.taskId})" title="Finalizar tarea">✅</button>`;
      } else {
        // Non-admin workflow buttons — only for tasks assigned to current user
        if (isMyTask(t)) {
          if (estado === 'pendiente' || estado === 'devuelta') {
            h += `<button class="btn-workflow btn-submit-review" onclick="submitForReview(${t.taskId})" title="Enviar a revisión">📤 Enviar</button>`;
          } else if (estado === 'en_revision') {
            h += `<button class="btn-workflow btn-undo-submit" onclick="undoSubmitReview(${t.taskId})" title="Deshacer envío">↩ Deshacer</button>`;
          }
        }
      }
      h += historyBtnHtml(t.taskId);
      if (isAdmin()) h += `<button class="check-btn" onclick="deleteTask(${t.taskId})" title="Eliminar tarea" style="color:var(--danger);border-color:var(--danger-border)">🗑</button>`;
      h += `</div></td>`;
    }
    h += `</tr>`;
  });

  h += `</tbody></table>`;
  document.getElementById('viewList').innerHTML = h;
}

export function onFilterMesChange() {
  const val = document.getElementById('filterMes').value;
  if (val) {
    const [y, m] = val.split('-').map(Number);
    state.currentDate = new Date(y, m - 1, 1);
  }
  populateFilters();
  render();
}

export function sortBy(c) {
  if (state.sortCol === c) state.sortDir *= -1;
  else { state.sortCol = c; state.sortDir = 1; }
  render();
}

export function toggleTaskSelect(id, checked) {
  if (checked) state.selectedTasks.add(id);
  else state.selectedTasks.delete(id);
  // Update bulk toolbar without full re-render
  const toolbar = document.getElementById('bulkToolbar');
  if (toolbar) {
    const count = state.selectedTasks.size;
    toolbar.style.display = count > 0 ? '' : 'none';
    const span = toolbar.querySelector('.bulk-count');
    if (span) span.textContent = `${count} tarea${count!==1?'s':''} seleccionada${count!==1?'s':''}`;
  }
  const allChk = document.getElementById('selectAllChk');
  if (allChk) allChk.indeterminate = state.selectedTasks.size > 0;
}

export function toggleSelectAll(checked) {
  const checkboxes = document.querySelectorAll('#viewList input[type=checkbox].task-select-chk');
  checkboxes.forEach(cb => {
    const id = parseInt(cb.dataset.id);
    cb.checked = checked;
    if (checked) state.selectedTasks.add(id);
    else state.selectedTasks.delete(id);
  });
  const toolbar = document.getElementById('bulkToolbar');
  if (toolbar) {
    const count = state.selectedTasks.size;
    toolbar.style.display = count > 0 ? '' : 'none';
    const span = toolbar.querySelector('.bulk-count');
    if (span) span.textContent = `${count} tarea${count!==1?'s':''} seleccionada${count!==1?'s':''}`;
  }
}

export function clearListSelection() {
  state.selectedTasks.clear();
  render();
}

// =================== RENDER: FINALIZED PANEL ===================
export function renderFinalized() {
  const finalized = state.tasks.filter(t => t.finalizada);
  const panel = document.getElementById('finalizedPanel');
  const body = document.getElementById('finalizedBody');
  const count = document.getElementById('finCount');

  if (finalized.length === 0) { panel.style.display = 'none'; return; }
  if (state.currentView === 'users' || state.currentView === 'mycal' || state.currentView === 'clientes' || state.currentView === 'vtos' || state.currentView === 'assign' || state.currentView === 'review') { panel.style.display = 'none'; return; }

  panel.style.display = '';
  count.textContent = finalized.length;

  const sorted = [...finalized].sort((a, b) => (b.fechaFinalizacion || '').localeCompare(a.fechaFinalizacion || ''));
  let h = `<table class="finalized-table"><thead><tr><th>Cliente</th><th>Tarea</th><th>Quién</th><th>Vencía</th><th>Finalizada</th><th></th></tr></thead><tbody>`;
  sorted.forEach(t => {
    const co = TASK_COLORS[t.tarea] || '#64748b';
    h += `<tr>`;
    h += `<td>${t.cliente}</td>`;
    h += `<td><span class="type-badge" style="background:${co}15;color:${co}">${t.tarea}</span></td>`;
    h += `<td><span class="card-badge badge-${(t.responsable||'').toLowerCase()}">${t.responsable}</span></td>`;
    h += `<td style="font-size:11px;color:var(--text-muted)">${formatDateShort(t.vencimiento)}</td>`;
    h += `<td><span class="fin-date">${formatDateFull(t.fechaFinalizacion)}</span></td>`;
    h += `<td style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">`;
    if (isAdmin()) h += `<button class="restore-btn" onclick="restoreTask(${t.taskId})" title="Restaurar">↩ Restaurar</button>`;
    h += `<button class="restore-btn" onclick="openHistory(${t.taskId})" title="Ver historial">📋 Historial ${unreadDotHtml(t.taskId)}</button>`;
    h += `</td>`;
    h += `</tr>`;
  });
  h += `</tbody></table>`;
  body.innerHTML = h;
  body.classList.toggle('collapsed', state.finalizedCollapsed);
  document.getElementById('finalizedHeader').classList.toggle('collapsed', state.finalizedCollapsed);
}

export function toggleFinalized() {
  state.finalizedCollapsed = !state.finalizedCollapsed;
  document.getElementById('finalizedBody').classList.toggle('collapsed', state.finalizedCollapsed);
  document.getElementById('finalizedHeader').classList.toggle('collapsed', state.finalizedCollapsed);
}
