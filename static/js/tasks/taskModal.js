// Task CRUD modal: addTask, editTask, saveTask, closeModal + *FromModal variants.
// Extracted literally from legacy-inline.js.

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { showConfirm, showPromptDialog } from '../ui/dialogs.js';
import { getEstadoLabel, getEstadoIcon } from '../utils/format.js';
import { render } from '../router.js';
import { populateFilters, populateFormSelects } from '../views/list.js';
import { isMyTask } from '../views/summary.js';
import { isAdmin } from './taskActions.js';
import { getUnreadCount } from './history.js';
import { loadTdpHistory } from './taskDetail.js';

// =================== TASK CRUD ===================
export function addTask() {
  if (!isAdmin()) { showToast('Solo admin puede crear tareas', 'error'); return; }
  state.editingId = null;
  document.getElementById('modalTitle').innerHTML = '📝 Nueva Tarea <button class="modal-close" onclick="closeModal()">✕</button>';
  document.getElementById('formCliente').value = '';
  document.getElementById('formTarea').value = state.tasks.length > 0 ? [...new Set(state.tasks.map(t => t.tarea))].sort()[0] : '';
  document.getElementById('formResponsable').value = state.currentUser?.responsableName || 'PERSONA';
  document.getElementById('formVencimiento').value = '';
  document.getElementById('formSemana').value = '1ER SEMANA';
  document.getElementById('btnDelete').style.display = 'none';
  document.getElementById('btnSave').style.display = '';
  // Reset: show form, hide detail panel, remove readonly
  document.getElementById('taskDetailPanel').style.display = 'none';
  document.querySelector('#modalOverlay .modal').classList.remove('with-detail');
  document.querySelectorAll('#modalOverlay .form-group').forEach(fg => fg.classList.remove('readonly'));
  document.getElementById('modalOverlay').classList.add('active');
}

export function editTask(id) {
  const t = state.tasks.find(x => x.taskId === id);
  if (!t) return;

  state.editingId = id;
  const admin = isAdmin();
  const isFin = t.finalizada;
  const estado = t.estado || 'pendiente';

  // Title
  document.getElementById('modalTitle').innerHTML = `${admin ? '✏️ Editar' : '📋'} Tarea <button class="modal-close" onclick="closeModal()">✕</button>`;

  // Populate form
  document.getElementById('formCliente').value = t.cliente;
  document.getElementById('formTarea').value = t.tarea;
  document.getElementById('formResponsable').value = t.responsable;
  document.getElementById('formVencimiento').value = t.vencimiento;
  document.getElementById('formSemana').value = t.semana;

  // Form editability
  const formGroups = document.querySelectorAll('#modalOverlay .form-group');
  formGroups.forEach(fg => fg.classList.toggle('readonly', !admin));
  document.getElementById('btnSave').style.display = admin ? '' : 'none';
  document.getElementById('btnDelete').style.display = admin ? '' : 'none';

  // Widen modal for detail panel
  document.querySelector('#modalOverlay .modal').classList.add('with-detail');

  // ---- Status section ----
  let statusH = '';
  statusH += `<span class="tdp-status-item ${t.completado ? 'active' : 'inactive'}">✔ Completado</span>`;
  statusH += `<span class="tdp-status-item ${t.enviado ? 'active' : 'inactive'}">📩 Enviado</span>`;
  statusH += `<span class="tdp-status-item ${isFin ? 'active' : 'inactive'}">✅ Finalizada</span>`;
  statusH += `<span class="estado-badge estado-${estado}" style="font-size:11px;padding:4px 10px">${getEstadoIcon(estado)} ${getEstadoLabel(estado)}</span>`;
  document.getElementById('tdpStatus').innerHTML = statusH;

  // ---- Actions section ----
  let actH = '';
  if (!isFin) {
    if (admin) {
      actH += `<button class="btn ${t.completado?'btn-primary':''}" onclick="toggleStatusFromModal('completado')" style="font-size:12px">${t.completado?'✔ Completado':'Marcar completado'}</button>`;
      actH += `<button class="btn ${t.enviado?'btn-primary':''}" onclick="toggleStatusFromModal('enviado')" style="font-size:12px">${t.enviado?'📩 Enviado':'Marcar enviado'}</button>`;
      actH += `<button class="btn btn-primary" onclick="finalizeFromModal()" style="font-size:12px">✅ Finalizar</button>`;
    } else if (isMyTask(t)) {
      if (estado === 'pendiente' || estado === 'devuelta') {
        actH += `<button class="btn-workflow btn-submit-review" onclick="submitForReviewFromModal()" style="font-size:12px">📤 Enviar a revisión</button>`;
      } else if (estado === 'en_revision') {
        actH += `<button class="btn-workflow btn-undo-submit" onclick="undoSubmitFromModal()" style="font-size:12px">↩ Deshacer envío</button>`;
      }
    }
  } else {
    if (admin) {
      actH += `<button class="btn" onclick="restoreFromModal()" style="font-size:12px">↩ Restaurar tarea</button>`;
    }
  }
  document.getElementById('tdpActions').innerHTML = actH;

  // Show detail panel
  document.getElementById('taskDetailPanel').style.display = '';

  // ---- History section ----
  const uc = getUnreadCount(id);
  document.getElementById('tdpUnread').innerHTML = uc > 0 ? `<span class="unread-badge">${uc}</span>` : '';
  document.getElementById('tdpHistoryBody').innerHTML = '<div class="history-empty">Cargando...</div>';
  document.getElementById('tdpCommentInput').value = '';

  loadTdpHistory(id);

  document.getElementById('modalOverlay').classList.add('active');
}

export async function finalizeFromModal() {
  if (state.editingId === null) return;
  try {
    const updated = await api('PUT', `/api/tasks/${state.editingId}/finalize`);
    const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
    if (idx >= 0) state.tasks[idx] = updated;
    editTask(state.editingId);
    render();
    showToast(`Tarea finalizada`, 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// Modal action helpers that refresh the detail panel
export async function toggleStatusFromModal(field) {
  if (!state.editingId) return;
  try {
    const updated = await api('PUT', `/api/tasks/${state.editingId}/status`, { field });
    const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
    if (idx >= 0) state.tasks[idx] = updated;
    // Re-open to refresh UI
    editTask(state.editingId);
    render();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function submitForReviewFromModal() {
  if (!state.editingId) return;
  const comment = await showPromptDialog('Enviar a revisión', '¿Querés agregar un comentario? (opcional)', {
    icon: '📤', placeholder: 'Comentario opcional...', confirmText: 'Enviar', cancelText: 'Cancelar'
  });
  if (comment === null) return;
  try {
    const updated = await api('PUT', `/api/tasks/${state.editingId}/submit-review`, { comment: comment || '' });
    const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
    if (idx >= 0) state.tasks[idx] = updated;
    editTask(state.editingId);
    render();
    showToast('Tarea enviada a revisión', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function undoSubmitFromModal() {
  if (!state.editingId) return;
  try {
    const updated = await api('PUT', `/api/tasks/${state.editingId}/undo-submit`);
    const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
    if (idx >= 0) state.tasks[idx] = updated;
    editTask(state.editingId);
    render();
    showToast('Envío deshecho', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function restoreFromModal() {
  if (!state.editingId) return;
  try {
    const updated = await api('PUT', `/api/tasks/${state.editingId}/restore`);
    const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
    if (idx >= 0) state.tasks[idx] = updated;
    editTask(state.editingId);
    render();
    showToast('Tarea restaurada', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function saveTask() {
  const sel = document.getElementById('formCliente');
  let cliente = sel.value;
  if (!cliente) {
    cliente = await showPromptDialog('Nuevo cliente', 'Ingresa el nombre del cliente', { icon: '👤', placeholder: 'Nombre del cliente...' });
    if (!cliente || !cliente.trim()) return;
    cliente = cliente.trim();
  }
  const tarea = document.getElementById('formTarea').value;
  const responsable = document.getElementById('formResponsable').value;
  const vencimiento = document.getElementById('formVencimiento').value;
  const semana = document.getElementById('formSemana').value;

  if (!tarea || !vencimiento) { showToast('Completá todos los campos obligatorios', 'error'); return; }

  // Find assignedTo email based on responsable name
  const matchUser = state.users.find(u => u.responsableName === responsable);
  const assignedTo = matchUser ? matchUser.email : null;

  try {
    if (state.editingId !== null) {
      const updated = await api('PUT', `/api/tasks/${state.editingId}`, { cliente, tarea, responsable, assignedTo, vencimiento, semana });
      const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
      if (idx >= 0) state.tasks[idx] = updated;
      showToast('Tarea actualizada', 'success');
    } else {
      const created = await api('POST', '/api/tasks', { cliente, tarea, responsable, assignedTo, vencimiento, semana });
      state.tasks.push(created);
      showToast('Tarea creada', 'success');
    }
    populateFilters();
    populateFormSelects();
    closeModal();
    render();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function deleteFromModal() {
  if (state.editingId === null) return;
  if (!await showConfirm('Eliminar tarea', 'Esta accion no se puede deshacer.', { icon: '🗑️', confirmText: 'Eliminar', danger: true })) return;
  try {
    await api('DELETE', `/api/tasks/${state.editingId}`);
    state.tasks = state.tasks.filter(t => t.taskId !== state.editingId);
    state.selectedTasks.delete(state.editingId);
    populateFilters();
    closeModal();
    render();
    showToast('Tarea eliminada', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.getElementById('taskDetailPanel').style.display = 'none';
  document.querySelector('#modalOverlay .modal').classList.remove('with-detail');
  document.querySelectorAll('#modalOverlay .form-group').forEach(fg => fg.classList.remove('readonly'));
  // Dynamic lookup to avoid circular with ui/mentions.js (which imports taskDetail.js).
  window.closeTdpMentionDropdown && window.closeTdpMentionDropdown();
  state.editingId = null;
}
