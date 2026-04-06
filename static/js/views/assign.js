// Admin bulk assignment view.
// Extracted literally from legacy-inline.js.

import { TASK_COLORS } from '../constants.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { formatDateShort } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';
import { showConfirm } from '../ui/dialogs.js';

// =================== RENDER: ADMIN ASSIGNMENT ===================
state.assignMode = 'user'; // 'user', 'client', 'category', 'manual'
state.assignSelectedUser = '';
state.assignReassignTo = '';
state.assignSelectedTasks = new Set();
state.assignFilterClient = '';
state.assignFilterCategory = '';
state.assignSearch = '';

export function renderAssign() {
  document.getElementById('monthLabel').textContent = 'Asignar Tareas';

  let h = `<div class="assign-layout">`;

  // === SIDEBAR: Users ===
  h += `<div class="assign-sidebar">`;
  h += `<div class="assign-sidebar-header">`;
  h += `<h3>${state.assignMode === 'user' ? 'Tareas del usuario' : 'Asignar a'}</h3>`;
  h += `</div>`;
  h += `<div class="assign-sidebar-body">`;

  // "Sin asignar" card
  const unassignedCount = state.tasks.filter(t => !t.finalizada && !t.assignedTo && !t.responsable).length;
  const selUnassigned = state.assignSelectedUser === '__unassigned__';
  h += `<div class="assign-user-card ${selUnassigned?'selected':''}" onclick="selectAssignUser('__unassigned__')">`;
  h += `<div style="width:32px;height:32px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text-muted)">?</div>`;
  h += `<div class="auc-info"><div class="auc-name">Sin asignar</div>`;
  h += `<div class="auc-email">Tareas sin responsable</div></div>`;
  h += `<span class="auc-badge">${unassignedCount}</span>`;
  h += `</div>`;

  state.users.forEach(u => {
    const taskCount = state.tasks.filter(t => !t.finalizada && (t.assignedTo === u.email || (u.responsableName && t.responsable === u.responsableName))).length;
    const sel = state.assignSelectedUser === u.email;
    h += `<div class="assign-user-card ${sel?'selected':''}" onclick="selectAssignUser('${u.email}')">`;
    h += `<img class="auc-avatar" src="${u.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='8' r='4' fill='%23ccc'/%3E%3Cpath d='M4 20c0-4 4-7 8-7s8 3 8 7' fill='%23ccc'/%3E%3C/svg%3E"}">`;
    h += `<div class="auc-info"><div class="auc-name">${u.displayName || u.email.split('@')[0]}</div>`;
    h += `<div class="auc-email">${u.responsableName || u.email}</div></div>`;
    h += `<span class="auc-badge">${taskCount}</span>`;
    h += `</div>`;
  });
  h += `</div></div>`;

  // === MAIN PANEL ===
  h += `<div class="assign-main">`;

  // Mode tabs at the top of main panel
  h += `<div class="assign-main-header">`;
  h += `<div class="assign-mode-tabs" style="margin-right:12px">`;
  h += `<button class="assign-mode-tab ${state.assignMode==='user'?'active':''}" onclick="setAssignMode('user')">Por Usuario</button>`;
  h += `<button class="assign-mode-tab ${state.assignMode==='client'?'active':''}" onclick="setAssignMode('client')">Por Cliente</button>`;
  h += `<button class="assign-mode-tab ${state.assignMode==='category'?'active':''}" onclick="setAssignMode('category')">Por Categoria</button>`;
  h += `<button class="assign-mode-tab ${state.assignMode==='manual'?'active':''}" onclick="setAssignMode('manual')">Manual</button>`;
  h += `</div>`;

  // Filters per mode
  h += `<div class="assign-filter-row">`;
  if (state.assignMode === 'user') {
    if (!state.assignSelectedUser) {
      h += `<span style="color:var(--text-muted);font-size:13px">Selecciona un usuario para ver sus tareas</span>`;
    } else {
      const selU = state.assignSelectedUser === '__unassigned__' ? {displayName:'Sin asignar'} : state.users.find(u=>u.email===state.assignSelectedUser);
      h += `<span style="font-size:13px;font-weight:600">Tareas de: ${selU ? (selU.responsableName || selU.displayName) : state.assignSelectedUser}</span>`;
    }
  } else if (state.assignMode === 'client') {
    h += `<select onchange="state.assignFilterClient=this.value;state.assignSelectedTasks.clear();renderAssign()">`;
    h += `<option value="">-- Elegir cliente --</option>`;
    [...new Set(state.tasks.map(t => t.cliente))].sort().forEach(c => {
      h += `<option value="${c}" ${state.assignFilterClient===c?'selected':''}>${c}</option>`;
    });
    h += `</select>`;
  } else if (state.assignMode === 'category') {
    h += `<select onchange="state.assignFilterCategory=this.value;state.assignSelectedTasks.clear();renderAssign()">`;
    h += `<option value="">-- Elegir categoria --</option>`;
    [...new Set(state.tasks.map(t => t.tarea))].sort().forEach(c => {
      h += `<option value="${c}" ${state.assignFilterCategory===c?'selected':''}>${c}</option>`;
    });
    h += `</select>`;
  } else {
    h += `<select onchange="state.assignFilterClient=this.value;state.assignSelectedTasks.clear();renderAssign()">`;
    h += `<option value="">Todos los clientes</option>`;
    [...new Set(state.tasks.map(t => t.cliente))].sort().forEach(c => {
      h += `<option value="${c}" ${state.assignFilterClient===c?'selected':''}>${c}</option>`;
    });
    h += `</select>`;
    h += `<select onchange="state.assignFilterCategory=this.value;state.assignSelectedTasks.clear();renderAssign()">`;
    h += `<option value="">Todas las categorias</option>`;
    [...new Set(state.tasks.map(t => t.tarea))].sort().forEach(c => {
      h += `<option value="${c}" ${state.assignFilterCategory===c?'selected':''}>${c}</option>`;
    });
    h += `</select>`;
    h += `<input type="text" placeholder="Buscar..." value="${state.assignSearch}" oninput="state.assignSearch=this.value;renderAssign()">`;
  }
  h += `</div>`;
  h += `</div>`; // main-header

  // Action bar (when tasks selected)
  const selCount = state.assignSelectedTasks.size;
  if (selCount > 0) {
    h += `<div class="assign-actions-bar">`;
    h += `<span class="selected-count">${selCount} tarea${selCount!==1?'s':''} seleccionada${selCount!==1?'s':''}</span>`;

    // Reassign dropdown + button
    h += `<select id="reassignSelect" onchange="state.assignReassignTo=this.value" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:inherit;min-width:150px">`;
    h += `<option value="">-- Reasignar a --</option>`;
    state.users.filter(u => u.email !== state.assignSelectedUser).forEach(u => {
      h += `<option value="${u.email}" ${state.assignReassignTo===u.email?'selected':''}>${u.responsableName || u.displayName || u.email}</option>`;
    });
    h += `</select>`;
    h += `<button class="btn btn-success" onclick="executeBulkReassign()">Reasignar</button>`;

    // Unassign button
    h += `<button class="btn btn-danger" onclick="executeBulkUnassign()">Quitar asignacion</button>`;

    h += `<button class="btn" onclick="state.assignSelectedTasks.clear();renderAssign()">Deseleccionar</button>`;
    h += `</div>`;
  }

  // Task list
  let filteredTasks = getAssignFilteredTasks();

  h += `<div class="assign-task-list">`;
  if (filteredTasks.length === 0) {
    if (state.assignMode === 'user' && !state.assignSelectedUser) {
      h += `<div class="assign-empty">Selecciona un usuario en la barra lateral para ver sus tareas</div>`;
    } else if (state.assignMode === 'client' && !state.assignFilterClient) {
      h += `<div class="assign-empty">Selecciona un cliente para ver sus tareas</div>`;
    } else if (state.assignMode === 'category' && !state.assignFilterCategory) {
      h += `<div class="assign-empty">Selecciona una categoria para ver las tareas</div>`;
    } else {
      h += `<div class="assign-empty">No se encontraron tareas</div>`;
    }
  } else {
    const allChecked = filteredTasks.every(t => state.assignSelectedTasks.has(t.taskId));
    h += `<table class="assign-task-table"><thead><tr>`;
    h += `<th class="cb-cell"><input type="checkbox" ${allChecked?'checked':''} onchange="toggleAllAssign(this.checked)"></th>`;
    h += `<th>Cliente</th><th>Tarea</th><th>Vto</th><th>Asignado a</th>`;
    h += `</tr></thead><tbody>`;

    // Group by client for category and user modes
    if (state.assignMode === 'category' || state.assignMode === 'user') {
      const byClient = {};
      filteredTasks.forEach(t => {
        if (!byClient[t.cliente]) byClient[t.cliente] = [];
        byClient[t.cliente].push(t);
      });
      Object.keys(byClient).sort().forEach(clientName => {
        const tasks = byClient[clientName];
        const allGroupChecked = tasks.every(t => state.assignSelectedTasks.has(t.taskId));
        h += `<tr><td class="cb-cell"><input type="checkbox" ${allGroupChecked?'checked':''} onchange="toggleGroupAssignCb('${clientName.replace(/'/g,"\\'")}', this.checked)"></td>`;
        h += `<td colspan="4" style="background:var(--bg);font-weight:700;font-size:12px;color:var(--text-secondary)">${clientName} <span class="group-count">${tasks.length}</span></td></tr>`;
        tasks.forEach(t => { h += buildAssignRow(t); });
      });
    } else {
      filteredTasks.forEach(t => { h += buildAssignRow(t); });
    }

    h += `</tbody></table>`;
  }
  h += `</div>`;

  h += `</div>`; // assign-main
  h += `</div>`; // assign-layout

  document.getElementById('viewAssign').innerHTML = h;
}

export function buildAssignRow(t) {
  const co = TASK_COLORS[t.tarea] || '#64748b';
  const checked = state.assignSelectedTasks.has(t.taskId);
  const assignedUser = state.users.find(u => u.email === t.assignedTo);
  const assignedName = assignedUser ? (assignedUser.responsableName || assignedUser.displayName) : (t.responsable || '');
  const hasAssigned = !!(t.assignedTo || t.responsable);
  let r = `<tr>`;
  r += `<td class="cb-cell"><input type="checkbox" ${checked?'checked':''} onchange="toggleAssignTask(${t.taskId}, this.checked)"></td>`;
  r += `<td class="at-client">${t.cliente}</td>`;
  r += `<td><span class="at-type" style="background:${co}15;color:${co}">${t.tarea}</span></td>`;
  r += `<td style="font-size:11px;color:var(--text-muted)">${formatDateShort(t.vencimiento)}</td>`;
  r += `<td class="at-assigned ${hasAssigned?'has-user':''}">${assignedName || '<span style="color:var(--text-muted);font-style:italic">Sin asignar</span>'}</td>`;
  r += `</tr>`;
  return r;
}

export function getAssignFilteredTasks() {
  let tasks = state.tasks.filter(t => !t.finalizada);

  if (state.assignMode === 'user') {
    if (!state.assignSelectedUser) return [];
    if (state.assignSelectedUser === '__unassigned__') {
      tasks = tasks.filter(t => !t.assignedTo && !t.responsable);
    } else {
      const u = state.users.find(x => x.email === state.assignSelectedUser);
      tasks = tasks.filter(t =>
        t.assignedTo === state.assignSelectedUser ||
        (u && u.responsableName && t.responsable === u.responsableName && !t.assignedTo)
      );
    }
  } else if (state.assignMode === 'client') {
    if (!state.assignFilterClient) return [];
    tasks = tasks.filter(t => t.cliente === state.assignFilterClient);
  } else if (state.assignMode === 'category') {
    if (!state.assignFilterCategory) return [];
    tasks = tasks.filter(t => t.tarea === state.assignFilterCategory);
  } else {
    if (state.assignFilterClient) tasks = tasks.filter(t => t.cliente === state.assignFilterClient);
    if (state.assignFilterCategory) tasks = tasks.filter(t => t.tarea === state.assignFilterCategory);
    if (state.assignSearch) {
      const s = state.assignSearch.toLowerCase();
      tasks = tasks.filter(t => t.cliente.toLowerCase().includes(s) || t.tarea.toLowerCase().includes(s));
    }
  }

  tasks.sort((a, b) => (a.cliente + a.tarea).localeCompare(b.cliente + b.tarea));
  return tasks;
}

export function setAssignMode(mode) {
  state.assignMode = mode;
  state.assignSelectedTasks.clear();
  state.assignFilterClient = '';
  state.assignFilterCategory = '';
  state.assignSearch = '';
  state.assignReassignTo = '';
  renderAssign();
}

export function selectAssignUser(email) {
  state.assignSelectedUser = state.assignSelectedUser === email ? '' : email;
  state.assignSelectedTasks.clear();
  state.assignReassignTo = '';
  renderAssign();
}

export function toggleAssignTask(taskId, checked) {
  if (checked) state.assignSelectedTasks.add(taskId);
  else state.assignSelectedTasks.delete(taskId);
  renderAssign();
}

export function toggleAllAssign(checked) {
  const tasks = getAssignFilteredTasks();
  if (checked) tasks.forEach(t => state.assignSelectedTasks.add(t.taskId));
  else tasks.forEach(t => state.assignSelectedTasks.delete(t.taskId));
  renderAssign();
}

export function toggleGroupAssignCb(clientName, checked) {
  const tasks = getAssignFilteredTasks().filter(t => t.cliente === clientName);
  if (checked) tasks.forEach(t => state.assignSelectedTasks.add(t.taskId));
  else tasks.forEach(t => state.assignSelectedTasks.delete(t.taskId));
  renderAssign();
}

export async function executeBulkReassign() {
  const targetEmail = state.assignReassignTo;
  const targetUser = state.users.find(u => u.email === targetEmail);
  if (!targetUser) { showToast('Selecciona un usuario destino en el dropdown', 'error'); return; }

  const taskIds = [...state.assignSelectedTasks];
  if (taskIds.length === 0) { showToast('Selecciona al menos una tarea', 'error'); return; }

  try {
    const result = await api('PUT', '/api/tasks/bulk-assign', {
      taskIds,
      assignedTo: targetUser.email,
      responsable: targetUser.responsableName || null,
    });

    taskIds.forEach(id => {
      const t = state.tasks.find(x => x.taskId === id);
      if (t) {
        t.assignedTo = targetUser.email;
        if (targetUser.responsableName) t.responsable = targetUser.responsableName;
      }
    });

    state.assignSelectedTasks.clear();
    state.assignReassignTo = '';
    showToast(`${result.modified} tarea${result.modified!==1?'s':''} reasignada${result.modified!==1?'s':''} a ${targetUser.responsableName || targetUser.displayName}`, 'success');
    renderAssign();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

export async function executeBulkUnassign() {
  const taskIds = [...state.assignSelectedTasks];
  if (taskIds.length === 0) { showToast('Selecciona al menos una tarea', 'error'); return; }

  if (!await showConfirm('Quitar asignacion', `Se desasignaran <strong>${taskIds.length} tarea${taskIds.length!==1?'s':''}</strong>.<br>Quedaran sin responsable.`, { icon: '👤', confirmText: 'Desasignar', danger: true })) return;

  try {
    const result = await api('PUT', '/api/tasks/bulk-assign', {
      taskIds,
      assignedTo: '',
      responsable: '',
    });

    taskIds.forEach(id => {
      const t = state.tasks.find(x => x.taskId === id);
      if (t) { t.assignedTo = ''; t.responsable = ''; }
    });

    state.assignSelectedTasks.clear();
    showToast(`${result.modified} tarea${result.modified!==1?'s':''} desasignada${result.modified!==1?'s':''}`, 'success');
    renderAssign();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
