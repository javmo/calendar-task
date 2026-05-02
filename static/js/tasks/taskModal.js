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
import { normCat } from '../views/clientes.js';

// =================== RECURRENCE HELPERS ===================

function _lastDay(year, month) {
  return new Date(year, month, 0); // day 0 of next month = last day of current
}

function calcDueDates(year, month, tipo, valor) {
  const ld = _lastDay(year, month);
  const ldDay = ld.getDate();

  if (tipo === 'quincenal') { tipo = 'mensual'; valor = 2; }

  const iso = (y, m, d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  if (tipo === 'mensual') {
    if (valor <= 1) return [iso(year, month, ldDay)];
    if (valor === 2) return [iso(year, month, 15), iso(year, month, ldDay)];
    if (valor === 3) return [iso(year, month, 10), iso(year, month, 20), iso(year, month, ldDay)];
    const step = Math.max(1, Math.floor(ldDay / valor));
    const dates = [];
    for (let i = 0; i < valor - 1; i++) dates.push(iso(year, month, Math.min(1 + step * i, ldDay)));
    dates.push(iso(year, month, ldDay));
    return dates;
  }

  if (tipo === 'semanal') {
    const weeks = [[1,7],[8,14],[15,21],[22,ldDay]];
    const dates = [];
    for (const [ws, we] of weeks) {
      const wend = Math.min(we, ldDay);
      if (wend < ws) continue;
      const wlen = wend - ws + 1;
      const count = Math.min(valor, wlen);
      const step = wlen / (count + 1);
      for (let i = 1; i <= count; i++) {
        const day = Math.max(ws, Math.min(ws + Math.round(step * i) - 1, wend));
        dates.push(iso(year, month, day));
      }
    }
    // deduplicate
    return [...new Set(dates)];
  }

  if (tipo === 'diaria') {
    const dates = [];
    for (let d = 1; d <= ldDay; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      if (dow >= 1 && dow <= 5) dates.push(iso(year, month, d));
    }
    return dates;
  }

  return [iso(year, month, ldDay)];
}

function getRecurrenceConfig() {
  const clienteNombre = document.getElementById('formCliente').value;
  const tarea = document.getElementById('formTarea').value;
  if (!clienteNombre || !tarea) return null;
  const cliente = state.clientes.find(c => c.nombre === clienteNombre);
  if (!cliente || !cliente.categorias) return null;
  const catEntry = cliente.categorias.find(c => normCat(c).tarea === tarea);
  if (!catEntry) return null;
  const cfg = normCat(catEntry);
  if (cfg.frecuencia_tipo === 'mensual' && cfg.frecuencia_valor === 1) return null; // no special recurrence
  return cfg;
}

export function updateRecurrenceSection() {
  const section = document.getElementById('taskRecurSection');
  if (!section) return;
  if (state.editingId !== null) { section.style.display = 'none'; return; }

  const cfg = getRecurrenceConfig();
  if (!cfg) { section.style.display = 'none'; return; }

  // Determine target month from formVencimiento or current month
  let year, month;
  const vto = document.getElementById('formVencimiento').value;
  if (vto && /^\d{4}-\d{2}/.test(vto)) {
    [year, month] = vto.split('-').slice(0,2).map(Number);
  } else {
    const now = new Date();
    year = now.getFullYear(); month = now.getMonth() + 1;
  }

  const dates = calcDueDates(year, month, cfg.frecuencia_tipo, cfg.frecuencia_valor);
  const semana = document.getElementById('formSemana').value || '1ER SEMANA';
  const semanas = ['1ER SEMANA','2DA SEMANA','3ER SEMANA','4TA SEMANA'];

  const tipoLabel = { mensual: 'x/mes', quincenal: 'quincenal', semanal: 'x/sem', diaria: 'diaria' };
  const suffix = (cfg.frecuencia_tipo === 'mensual' || cfg.frecuencia_tipo === 'semanal')
    ? `${cfg.frecuencia_valor} ${tipoLabel[cfg.frecuencia_tipo]}`
    : tipoLabel[cfg.frecuencia_tipo];

  let h = `<div class="recur-header">`;
  h += `<span class="recur-title">Periodicidad: ${cfg.tarea} (${suffix})</span>`;
  h += `<span class="recur-count">${dates.length} instancia${dates.length!==1?'s':''}</span>`;
  h += `</div>`;
  h += `<div class="recur-instances">`;
  dates.forEach((d, i) => {
    const [dy, dm, dd] = d.split('-');
    const label = `${dd}/${dm}/${dy}`;
    h += `<div class="recur-instance">`;
    h += `<span class="recur-date">${label}</span>`;
    h += `<select class="recur-semana" data-idx="${i}">`;
    semanas.forEach(s => h += `<option value="${s}" ${s === semana ? 'selected' : ''}>${s}</option>`);
    h += `</select>`;
    h += `</div>`;
  });
  h += `</div>`;
  h += `<button type="button" class="btn btn-primary recur-bulk-btn" onclick="saveTaskBulk()">＋ Crear todas (${dates.length})</button>`;

  // Store dates for saveTaskBulk
  section._dates = dates;
  section.innerHTML = h;
  section.style.display = '';
}

export async function saveTaskBulk() {
  const section = document.getElementById('taskRecurSection');
  if (!section || !section._dates) return;

  const clienteNombre = document.getElementById('formCliente').value;
  const tarea = document.getElementById('formTarea').value;
  const responsable = document.getElementById('formResponsable').value;
  if (!clienteNombre || !tarea) { showToast('Seleccioná cliente y tarea', 'error'); return; }

  const matchUser = state.users.find(u => u.responsableName === responsable);
  const assignedTo = matchUser ? matchUser.email : null;

  const semanas = [...section.querySelectorAll('.recur-semana')];
  const instances = section._dates.map((d, i) => ({
    vencimiento: d,
    semana: semanas[i]?.value || document.getElementById('formSemana').value || '1ER SEMANA',
  }));

  const btn = section.querySelector('.recur-bulk-btn');
  setLoading(btn, true, 'Creando…');
  try {
    const result = await api('POST', '/api/tasks/bulk', {
      cliente: clienteNombre,
      tarea,
      responsable,
      assignedTo,
      instances,
    });
    // Reload tasks
    state.tasks = await api('GET', '/api/tasks');
    populateFilters();
    populateFormSelects();
    clearFormTracking();
    closeModal();
    render();
    showToast(`${result.created} tarea${result.created!==1?'s':''} creada${result.created!==1?'s':''}${result.skipped?' ('+result.skipped+' ya existían)':''}`, 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

// =================== INLINE FORM VALIDATION ===================
function setFieldError(fieldEl, message) {
  const group = fieldEl.closest('.form-group');
  if (!group) return;
  fieldEl.classList.add('field-error');
  let errEl = group.querySelector('.field-error-msg');
  if (!errEl) {
    errEl = document.createElement('span');
    errEl.className = 'field-error-msg';
    group.appendChild(errEl);
  }
  errEl.textContent = message;

  // Clear error when user changes the field
  const clearErr = () => {
    fieldEl.classList.remove('field-error');
    const msg = group.querySelector('.field-error-msg');
    if (msg) msg.remove();
    fieldEl.removeEventListener('change', clearErr);
    fieldEl.removeEventListener('input', clearErr);
  };
  fieldEl.addEventListener('change', clearErr);
  fieldEl.addEventListener('input', clearErr);
}

function clearAllFieldErrors() {
  document.querySelectorAll('#modalOverlay .field-error').forEach(el => el.classList.remove('field-error'));
  document.querySelectorAll('#modalOverlay .field-error-msg').forEach(el => el.remove());
}

function validateTaskForm(tarea, vencimiento) {
  let valid = true;
  if (!tarea) {
    setFieldError(document.getElementById('formTarea'), 'El tipo de tarea es obligatorio.');
    valid = false;
  }
  if (!vencimiento) {
    setFieldError(document.getElementById('formVencimiento'), 'La fecha de vencimiento es obligatoria.');
    valid = false;
  }
  return valid;
}

// =================== UNSAVED CHANGES TRACKING ===================
let _originalFormValues = null;

function captureFormValues() {
  _originalFormValues = {
    cliente: document.getElementById('formCliente').value,
    tarea: document.getElementById('formTarea').value,
    responsable: document.getElementById('formResponsable').value,
    vencimiento: document.getElementById('formVencimiento').value,
    semana: document.getElementById('formSemana').value,
  };
}

function isFormDirty() {
  if (!_originalFormValues) return false;
  return (
    document.getElementById('formCliente').value !== _originalFormValues.cliente ||
    document.getElementById('formTarea').value !== _originalFormValues.tarea ||
    document.getElementById('formResponsable').value !== _originalFormValues.responsable ||
    document.getElementById('formVencimiento').value !== _originalFormValues.vencimiento ||
    document.getElementById('formSemana').value !== _originalFormValues.semana
  );
}

function clearFormTracking() {
  _originalFormValues = null;
}

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

// =================== TASK CRUD ===================
export function addTask() {
  if (!isAdmin()) { showToast('Solo admin puede crear tareas', 'error'); return; }
  state.editingId = null;
  document.getElementById('modalTitle').innerHTML = '📝 Nueva Tarea <button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button>';
  document.getElementById('formCliente').value = '';
  document.getElementById('formTarea').value = state.tasks.length > 0 ? [...new Set(state.tasks.map(t => t.tarea))].sort()[0] : '';
  document.getElementById('formResponsable').value = state.currentUser?.responsableName || 'PERSONA';
  document.getElementById('formVencimiento').value = '';
  document.getElementById('formSemana').value = '1ER SEMANA';
  document.getElementById('btnDelete').style.display = 'none';
  document.getElementById('btnSave').style.display = '';
  // Reset any stuck loading state from a previous save
  setLoading(document.getElementById('btnSave'), false);
  setLoading(document.getElementById('btnDelete'), false);
  // Reset: show form, hide detail panel, remove readonly
  clearAllFieldErrors();
  document.getElementById('taskDetailPanel').style.display = 'none';
  document.querySelector('#modalOverlay .modal').classList.remove('with-detail');
  document.querySelectorAll('#modalOverlay .form-group').forEach(fg => fg.classList.remove('readonly'));
  // Wire change events for recurrence detection (only once per open)
  _wireRecurrenceListeners();
  document.getElementById('modalOverlay').classList.add('active');
  updateRecurrenceSection();
  captureFormValues();
}

let _recurListenersWired = false;
function _wireRecurrenceListeners() {
  if (_recurListenersWired) return;
  _recurListenersWired = true;
  ['formCliente','formTarea','formVencimiento','formSemana'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => updateRecurrenceSection());
  });
  // Also on input for vencimiento (text field)
  const vtoEl = document.getElementById('formVencimiento');
  if (vtoEl) vtoEl.addEventListener('input', () => updateRecurrenceSection());
}

export function editTask(id) {
  const t = state.tasks.find(x => x.taskId === id);
  if (!t) return;

  // Reset any stuck loading state from a previous operation
  setLoading(document.getElementById('btnSave'), false);
  setLoading(document.getElementById('btnDelete'), false);

  state.editingId = id;
  const admin = isAdmin();
  const isFin = t.finalizada;
  const estado = t.estado || 'pendiente';

  // Title
  document.getElementById('modalTitle').innerHTML = `${admin ? '✏️ Editar' : '📋'} Tarea <button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button>`;

  // Populate form
  document.getElementById('formCliente').value = t.cliente;
  document.getElementById('formTarea').value = t.tarea;
  document.getElementById('formResponsable').value = t.responsable;
  document.getElementById('formVencimiento').value = t.vencimiento;
  document.getElementById('formSemana').value = t.semana;

  clearAllFieldErrors();
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

  // Show client info (ficha) in task detail panel
  const clienteInfo = document.getElementById('tdpClientInfo');
  const clienteData = state.clientes.find(c => c.nombre === t.cliente);
  if (clienteData) {
    const notaEspecifica = clienteData.notasPorTarea && clienteData.notasPorTarea[t.tarea];
    const notaGeneral = clienteData.notas && clienteData.notas.trim() ? clienteData.notas : null;
    if (notaEspecifica || notaGeneral) {
      let infoHtml = '<div class="tdp-client-info-box">';
      if (notaEspecifica) {
        infoHtml += `<div class="tdp-client-nota-especifica"><div class="tdp-client-nota-tag">${t.tarea}</div><div class="tdp-client-info-text">${notaEspecifica.replace(/\n/g, '<br>')}</div></div>`;
      }
      if (notaGeneral) {
        infoHtml += `<div class="${notaEspecifica ? 'tdp-client-nota-general' : ''}"><div class="tdp-client-info-label">Ficha del cliente</div><div class="tdp-client-info-text">${notaGeneral.replace(/\n/g, '<br>')}</div></div>`;
      }
      infoHtml += '</div>';
      clienteInfo.innerHTML = infoHtml;
      clienteInfo.style.display = '';
    } else {
      clienteInfo.innerHTML = '';
      clienteInfo.style.display = 'none';
    }
  }

  loadTdpHistory(id);

  // Hide recurrence section when editing
  const recurSec = document.getElementById('taskRecurSection');
  if (recurSec) recurSec.style.display = 'none';

  document.getElementById('modalOverlay').classList.add('active');
  captureFormValues();
}

export async function finalizeFromModal() {
  if (state.editingId === null) return;
  const btn = document.activeElement;
  setLoading(btn, true, 'Finalizando…');
  try {
    const updated = await api('PUT', `/api/tasks/${state.editingId}/finalize`);
    const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
    if (idx >= 0) state.tasks[idx] = updated;
    editTask(state.editingId);
    render();
    showToast(`Tarea finalizada`, 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

// Modal action helpers that refresh the detail panel
export async function toggleStatusFromModal(field) {
  if (!state.editingId) return;
  const btn = document.activeElement;
  setLoading(btn, true, 'Guardando…');
  try {
    const updated = await api('PUT', `/api/tasks/${state.editingId}/status`, { field });
    const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
    if (idx >= 0) state.tasks[idx] = updated;
    // Re-open to refresh UI
    editTask(state.editingId);
    render();
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

export async function submitForReviewFromModal() {
  if (!state.editingId) return;
  const comment = await showPromptDialog('Enviar a revisión', '¿Querés agregar un comentario? (opcional)', {
    icon: '📤', placeholder: 'Comentario opcional...', confirmText: 'Enviar', cancelText: 'Cancelar'
  });
  if (comment === null) return;
  const btn = document.querySelector('#tdpActions .btn-submit-review');
  setLoading(btn, true, 'Enviando…');
  try {
    const updated = await api('PUT', `/api/tasks/${state.editingId}/submit-review`, { comment: comment || '' });
    const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
    if (idx >= 0) state.tasks[idx] = updated;
    editTask(state.editingId);
    render();
    showToast('Tarea enviada a revisión', 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

export async function undoSubmitFromModal() {
  if (!state.editingId) return;
  const btn = document.activeElement;
  setLoading(btn, true, 'Deshaciendo…');
  try {
    const updated = await api('PUT', `/api/tasks/${state.editingId}/undo-submit`);
    const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
    if (idx >= 0) state.tasks[idx] = updated;
    editTask(state.editingId);
    render();
    showToast('Envío deshecho', 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

export async function restoreFromModal() {
  if (!state.editingId) return;
  const btn = document.activeElement;
  setLoading(btn, true, 'Restaurando…');
  try {
    const updated = await api('PUT', `/api/tasks/${state.editingId}/restore`);
    const idx = state.tasks.findIndex(t => t.taskId === state.editingId);
    if (idx >= 0) state.tasks[idx] = updated;
    editTask(state.editingId);
    render();
    showToast('Tarea restaurada', 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

export async function saveTask() {
  clearAllFieldErrors();

  const sel = document.getElementById('formCliente');
  let cliente = sel.value;
  const tarea = document.getElementById('formTarea').value;
  const responsable = document.getElementById('formResponsable').value;
  const vencimiento = document.getElementById('formVencimiento').value;
  const semana = document.getElementById('formSemana').value;

  // Inline validation — validate tarea and vencimiento before the async new-client prompt
  if (!validateTaskForm(tarea, vencimiento)) return;

  // If "new client" placeholder selected, prompt for name
  if (!cliente) {
    cliente = await showPromptDialog('Nuevo cliente', 'Ingresa el nombre del cliente', { icon: '👤', placeholder: 'Nombre del cliente...' });
    if (!cliente || !cliente.trim()) {
      setFieldError(document.getElementById('formCliente'), 'Seleccioná un cliente o ingresá uno nuevo.');
      return;
    }
    cliente = cliente.trim();
  }

  // Find assignedTo email based on responsable name
  const matchUser = state.users.find(u => u.responsableName === responsable);
  const assignedTo = matchUser ? matchUser.email : null;

  const btn = document.getElementById('btnSave');
  setLoading(btn, true, state.editingId !== null ? 'Guardando…' : 'Creando…');
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
    clearFormTracking(); // mark as clean so closeModal skips dirty check
    closeModal();
    render();
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

export async function deleteFromModal() {
  if (state.editingId === null) return;
  if (!await showConfirm('Eliminar tarea', 'Esta accion no se puede deshacer.', { icon: '🗑️', confirmText: 'Eliminar', danger: true })) return;
  const btn = document.getElementById('btnDelete');
  setLoading(btn, true, 'Eliminando…');
  try {
    await api('DELETE', `/api/tasks/${state.editingId}`);
    state.tasks = state.tasks.filter(t => t.taskId !== state.editingId);
    state.selectedTasks.delete(state.editingId);
    populateFilters();
    clearFormTracking();
    closeModal();
    render();
    showToast('Tarea eliminada', 'success');
  } catch (e) {
    setLoading(btn, false);
    showToast('Error: ' + e.message, 'error');
  }
}

function _doCloseModal() {
  // Reset loading state on save/delete buttons so they don't stay stuck as spinners
  const btnSave = document.getElementById('btnSave');
  const btnDelete = document.getElementById('btnDelete');
  setLoading(btnSave, false);
  setLoading(btnDelete, false);

  document.getElementById('modalOverlay').classList.remove('active');
  document.getElementById('taskDetailPanel').style.display = 'none';
  document.querySelector('#modalOverlay .modal').classList.remove('with-detail');
  document.querySelectorAll('#modalOverlay .form-group').forEach(fg => fg.classList.remove('readonly'));
  // Dynamic lookup to avoid circular with ui/mentions.js (which imports taskDetail.js).
  window.closeTdpMentionDropdown && window.closeTdpMentionDropdown();
  clearFormTracking();
  state.editingId = null;
}

export async function closeModal() {
  // Only warn if admin form is visible and has been edited
  const btnSave = document.getElementById('btnSave');
  const formVisible = btnSave && btnSave.style.display !== 'none';
  if (formVisible && isFormDirty()) {
    const ok = await showConfirm(
      'Descartar cambios',
      '¿Seguro que querés cerrar? Los cambios no guardados se perderán.',
      { icon: '⚠️', confirmText: 'Descartar', cancelText: 'Seguir editando' }
    );
    if (!ok) return;
  }
  _doCloseModal();
}
