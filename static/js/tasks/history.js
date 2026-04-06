// Task history modal + comments + unread helpers.
// Extracted literally from legacy-inline.js.

import { state } from '../state.js';
import { api } from '../api.js';
import { formatCommentWithMentions, formatTimeAgo } from '../utils/format.js';
import { showToast } from '../ui/toast.js';
import { render } from '../router.js';

// ========== TASK HISTORY / COMMENTS ==========
let historyTaskId = null;

export async function openHistory(taskId) {
  historyTaskId = taskId;
  const task = state.tasks.find(t => t.taskId === taskId);
  if (!task) { showToast('Tarea no encontrada', 'error'); return; }

  document.getElementById('historyTitle').innerHTML = `📋 ${task.cliente} — ${task.tarea}`;
  document.getElementById('historyBody').innerHTML = '<div class="history-empty">Cargando...</div>';
  document.getElementById('historyOverlay').classList.add('active');
  document.getElementById('historyCommentInput').value = '';
  // Close mention dropdown via global to avoid circular import.
  window.closeMentionDropdown && window.closeMentionDropdown();

  try {
    const entries = await api('GET', `/api/tasks/${taskId}/history`);
    renderHistoryEntries(entries);
    // Mark as read
    await api('PUT', `/api/tasks/${taskId}/mark-read`);
    delete state.unreadCounts[String(taskId)];
    // Remove this task from unread mentions
    state.mentions = state.mentions.map(m => m.taskId === taskId ? {...m, isUnread: false} : m);
    render();
  } catch (e) {
    document.getElementById('historyBody').innerHTML = `<div class="history-empty">Error cargando historial: ${e.message}</div>`;
  }
}

export function renderHistoryEntries(entries) {
  const body = document.getElementById('historyBody');
  if (!entries.length) {
    body.innerHTML = '<div class="history-empty">Sin historial todavía. Agregá un comentario abajo.</div>';
    return;
  }

  const actionLabels = {
    'creada': 'creó la tarea',
    'enviada_a_revision': 'envió a revisión',
    'revision_deshecha': 'deshizo el envío a revisión',
    'aprobada': 'aprobó la tarea',
    'devuelta': 'devolvió la tarea',
    'finalizada': 'finalizó la tarea',
    'restaurada': 'restauró la tarea',
    'comentario': 'comentó',
  };

  const actionIcons = {
    'creada': '🆕',
    'enviada_a_revision': '📤',
    'revision_deshecha': '↩️',
    'aprobada': '✅',
    'devuelta': '🔄',
    'finalizada': '✔️',
    'restaurada': '🔁',
    'comentario': '💬',
  };

  let h = '';
  entries.forEach(e => {
    const timeAgo = formatTimeAgo(e.createdAt);
    h += `<div class="history-entry">`;
    h += `<div class="he-icon action-${e.action}">${actionIcons[e.action] || '📝'}</div>`;
    h += `<div class="he-content">`;
    h += `<div class="he-header">`;
    h += `<span class="he-user">${e.userName || e.userEmail || 'Usuario'}</span>`;
    h += `<span class="he-action-label">${actionLabels[e.action] || e.action}</span>`;
    h += `<span class="he-time">${timeAgo}</span>`;
    h += `</div>`;
    if (e.comment) {
      h += `<div class="he-comment">${formatCommentWithMentions(e.comment)}</div>`;
    }
    h += `</div></div>`;
  });
  body.innerHTML = h;
  // Scroll to bottom (newest comments)
  body.scrollTop = body.scrollHeight;
}

export async function addComment() {
  if (!historyTaskId) return;
  const input = document.getElementById('historyCommentInput');
  const comment = input.value.trim();
  if (!comment) return;
  window.closeMentionDropdown && window.closeMentionDropdown();

  try {
    await api('POST', `/api/tasks/${historyTaskId}/comments`, { comment });
    input.value = '';
    const entries = await api('GET', `/api/tasks/${historyTaskId}/history`);
    renderHistoryEntries(entries);
    // Refresh unread counts (for other users' views)
    try { state.unreadCounts = await api('GET', '/api/unread-counts'); } catch(e) {}
    try { state.mentions = await api('GET', '/api/mentions'); } catch(e) {}
    showToast('Comentario agregado', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export function closeHistory() {
  document.getElementById('historyOverlay').classList.remove('active');
  window.closeMentionDropdown && window.closeMentionDropdown();
  historyTaskId = null;
}

export function getUnreadCount(taskId) {
  return state.unreadCounts[String(taskId)] || 0;
}

export function historyBtnHtml(taskId, cssClass = 'check-btn', extraStyle = '') {
  const uc = getUnreadCount(taskId);
  const badge = uc > 0 ? ` has-unread" data-unread="${uc}` : '';
  return `<button class="${cssClass}${badge}" onclick="openHistory(${taskId})" title="Historial${uc > 0 ? ` (${uc} sin leer)` : ''}" style="${extraStyle}">📋</button>`;
}

export function unreadDotHtml(taskId) {
  const uc = getUnreadCount(taskId);
  if (uc === 0) return '';
  return `<span class="unread-badge">${uc}</span>`;
}
