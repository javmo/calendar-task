// Task actions: toggleStatus, finalize, delete, restore, submit/undo/approve/return.
// Extracted literally from legacy-inline.js.

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { showConfirm, showPromptDialog } from '../ui/dialogs.js';
import { render } from '../router.js';
import { populateFilters } from '../views/list.js';

// =================== BUTTON LOADING HELPER ===================
function setLoading(btn, loading, loadingText) {
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn._origText = btn.innerHTML;
    btn.innerHTML = `<span class="btn-spinner"></span>${loadingText || 'Cargando…'}`;
  } else {
    btn.disabled = false;
    if (btn._origText !== undefined) btn.innerHTML = btn._origText;
  }
}

// =================== TASK ACTIONS ===================
export function isAdmin() { return state.currentUser && state.currentUser.role === 'admin'; }

export async function toggleStatus(id, field) {
  if (!isAdmin() && field !== 'completado') { showToast('Solo admin puede modificar ese campo', 'error'); return; }
  const btn = document.activeElement;
  setLoading(btn, true, '…');
  try {
    const updated = await api('PUT', `/api/tasks/${id}/status`, { field });
    const idx = state.tasks.findIndex(t => t.taskId === id);
    if (idx >= 0) state.tasks[idx] = updated;
    render();
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

export async function finalizeTask(id) {
  const btn = document.activeElement;
  setLoading(btn, true, 'Finalizando…');
  try {
    const updated = await api('PUT', `/api/tasks/${id}/finalize`);
    const idx = state.tasks.findIndex(t => t.taskId === id);
    if (idx >= 0) state.tasks[idx] = updated;
    const task = state.tasks[idx];
    render();
    showToast(`"${task.cliente} — ${task.tarea}" finalizada`, 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

export async function deleteTask(id) {
  const t = state.tasks.find(x => x.taskId === id);
  if (!t) return;
  const ok = await showConfirm('Eliminar tarea', `¿Eliminar "<strong>${t.cliente} — ${t.tarea}</strong>"?<br>Esta acción no se puede deshacer.`, { icon: '🗑', confirmText: 'Eliminar', danger: true });
  if (!ok) return;
  try {
    await api('DELETE', `/api/tasks/${id}`);
    state.tasks = state.tasks.filter(x => x.taskId !== id);
    state.selectedTasks.delete(id);
    delete state.unreadCounts[String(id)];
    populateFilters();
    render();
    showToast('Tarea eliminada', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function deleteSelectedTasks() {
  if (state.selectedTasks.size === 0) return;
  const count = state.selectedTasks.size;
  const ok = await showConfirm('Eliminar tareas seleccionadas', `¿Eliminar <strong>${count} tarea${count>1?'s':''}</strong>?<br>Esta acción no se puede deshacer.`, { icon: '🗑', confirmText: `Eliminar ${count}`, danger: true });
  if (!ok) return;
  try {
    for (const id of [...state.selectedTasks]) {
      await api('DELETE', `/api/tasks/${id}`);
      delete state.unreadCounts[String(id)];
    }
    state.tasks = state.tasks.filter(t => !state.selectedTasks.has(t.taskId));
    state.selectedTasks.clear();
    populateFilters();
    render();
    showToast(`${count} tarea${count>1?'s':''} eliminada${count>1?'s':''}`, 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function restoreTask(id) {
  try {
    const updated = await api('PUT', `/api/tasks/${id}/restore`);
    const idx = state.tasks.findIndex(t => t.taskId === id);
    if (idx >= 0) state.tasks[idx] = updated;
    render();
    showToast('Tarea restaurada', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// =================== WORKFLOW ACTIONS ===================
export async function submitForReview(id) {
  const comment = await showPromptDialog('Enviar a revisión', '¿Querés agregar un comentario? (opcional)', {
    icon: '📤', placeholder: 'Comentario opcional...', confirmText: 'Enviar', cancelText: 'Cancelar'
  });
  if (comment === null) return;
  // Find the submit button for this task in the rendered list
  const btn = document.querySelector(`.btn-submit-review[onclick*="${id}"]`) || document.activeElement;
  setLoading(btn, true, 'Enviando…');
  try {
    const updated = await api('PUT', `/api/tasks/${id}/submit-review`, { comment: comment || '' });
    const idx = state.tasks.findIndex(t => t.taskId === id);
    if (idx >= 0) state.tasks[idx] = updated;
    render();
    showToast('Tarea enviada a revisión', 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

export async function undoSubmitReview(id) {
  if (!await showConfirm('Deshacer envío', '¿Querés retirar la tarea de revisión?', { icon: '↩️', confirmText: 'Deshacer' })) return;
  const btn = document.querySelector(`.btn-undo-submit[onclick*="${id}"]`) || document.activeElement;
  setLoading(btn, true, 'Deshaciendo…');
  try {
    const updated = await api('PUT', `/api/tasks/${id}/undo-submit`);
    const idx = state.tasks.findIndex(t => t.taskId === id);
    if (idx >= 0) state.tasks[idx] = updated;
    render();
    showToast('Revisión deshecha', 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

export async function approveTask(id) {
  const comment = await showPromptDialog('Aprobar tarea', '¿Querés agregar un comentario? (opcional)', {
    icon: '✅', placeholder: 'Comentario opcional...', confirmText: 'Aprobar', cancelText: 'Cancelar'
  });
  if (comment === null) return;
  const btn = document.querySelector(`[onclick*="approveTask(${id})"]`) || document.activeElement;
  setLoading(btn, true, 'Aprobando…');
  try {
    const result = await api('PUT', `/api/tasks/${id}/approve`, { comment: comment || '' });
    const idx = state.tasks.findIndex(t => t.taskId === id);
    if (idx >= 0) state.tasks[idx] = result;
    render();
    const emailMsg = result.emailSent ? ' (email enviado)' : '';
    showToast(`Tarea aprobada y finalizada${emailMsg}`, 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

export async function returnTask(id) {
  const comment = await showPromptDialog('Devolver tarea', 'Indicá las correcciones o ajustes necesarios:', {
    icon: '↩️', placeholder: 'Detalle de correcciones...', confirmText: 'Devolver', cancelText: 'Cancelar'
  });
  if (comment === null || !comment.trim()) {
    if (comment !== null) showToast('Debés indicar el motivo de devolución', 'error');
    return;
  }
  const btn = document.querySelector(`[onclick*="returnTask(${id})"]`) || document.activeElement;
  setLoading(btn, true, 'Devolviendo…');
  try {
    const updated = await api('PUT', `/api/tasks/${id}/return`, { comment: comment.trim() });
    const idx = state.tasks.findIndex(t => t.taskId === id);
    if (idx >= 0) state.tasks[idx] = updated;
    render();
    showToast('Tarea devuelta con observaciones', 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}
