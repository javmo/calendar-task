// Task detail panel: tdp history + comments.
// Extracted literally from legacy-inline.js.

import { state } from '../state.js';
import { api } from '../api.js';
import { formatCommentWithMentions, formatTimeAgo } from '../utils/format.js';
import { showToast } from '../ui/toast.js';

export async function loadTdpHistory(taskId) {
  try {
    const entries = await api('GET', `/api/tasks/${taskId}/history`);
    renderTdpHistoryEntries(entries);
    // Mark as read
    await api('PUT', `/api/tasks/${taskId}/mark-read`);
    delete state.unreadCounts[String(taskId)];
    state.mentions = state.mentions.map(m => m.taskId === taskId ? {...m, isUnread: false} : m);
  } catch (e) {
    document.getElementById('tdpHistoryBody').innerHTML = `<div class="history-empty">Error: ${e.message}</div>`;
  }
}

export function renderTdpHistoryEntries(entries) {
  const body = document.getElementById('tdpHistoryBody');
  if (!entries.length) {
    body.innerHTML = '<div class="history-empty">Sin historial. Agregá un comentario.</div>';
    return;
  }
  // Reuse the same rendering logic
  const actionLabels = {
    'creada':'creó la tarea','enviada_a_revision':'envió a revisión','revision_deshecha':'deshizo envío',
    'aprobada':'aprobó','devuelta':'devolvió','finalizada':'finalizó','restaurada':'restauró','comentario':'comentó'
  };
  const actionIcons = {
    'creada':'🆕','enviada_a_revision':'📤','revision_deshecha':'↩️','aprobada':'✅',
    'devuelta':'🔄','finalizada':'✔️','restaurada':'🔁','comentario':'💬'
  };
  let h = '';
  entries.forEach(e => {
    h += `<div class="history-entry">`;
    h += `<div class="he-icon action-${e.action}">${actionIcons[e.action]||'📝'}</div>`;
    h += `<div class="he-content">`;
    h += `<div class="he-header"><span class="he-user">${e.userName||e.userEmail||'Usuario'}</span> <span class="he-action-label">${actionLabels[e.action]||e.action}</span> <span class="he-time">${formatTimeAgo(e.createdAt)}</span></div>`;
    if (e.comment) h += `<div class="he-comment">${formatCommentWithMentions(e.comment)}</div>`;
    h += `</div></div>`;
  });
  body.innerHTML = h;
  body.scrollTop = body.scrollHeight;
}

export async function addTdpComment() {
  if (!state.editingId) return;
  const input = document.getElementById('tdpCommentInput');
  const comment = input.value.trim();
  if (!comment) return;

  try {
    await api('POST', `/api/tasks/${state.editingId}/comments`, { comment });
    input.value = '';
    await loadTdpHistory(state.editingId);
    try { state.unreadCounts = await api('GET', '/api/unread-counts'); } catch(e) {}
    showToast('Comentario agregado', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
