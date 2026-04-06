// Floating summary panel + isMyTask + navigateToTask + badge updater.
// Extracted literally from legacy-inline.js.

import { TASK_COLORS } from '../constants.js';
import { state } from '../state.js';
import { parseDate, formatDateShort } from '../utils/dates.js';
import { getEstadoLabel, getEstadoIcon, formatTimeAgo } from '../utils/format.js';
import { isAdmin } from '../tasks/taskActions.js';

// =================== FLOATING SUMMARY PANEL ===================
let summaryOpen = false;

export function toggleSummaryPanel() {
  summaryOpen = !summaryOpen;
  document.getElementById('summaryPanel').classList.toggle('open', summaryOpen);
  if (summaryOpen) renderSummaryPanel();
}

export function closeSummaryPanel() {
  summaryOpen = false;
  document.getElementById('summaryPanel').classList.remove('open');
}

export function renderSummaryPanel() {
  const body = document.getElementById('summaryPanelBody');
  const today = new Date(); today.setHours(0,0,0,0);
  const twoDaysMs = 2 * 86400000;
  let h = '';

  if (isAdmin()) {
    // Admin: tasks pending review
    const reviewTasks = state.tasks.filter(t => t.estado === 'en_revision');
    h += `<div class="summary-section">`;
    h += `<div class="summary-section-header">🔍 Tareas en Revisión <span class="ss-count red">${reviewTasks.length}</span></div>`;
    if (reviewTasks.length === 0) {
      h += `<div class="summary-empty">Sin tareas para revisar</div>`;
    } else {
      reviewTasks.slice(0, 10).forEach(t => {
        const co = TASK_COLORS[t.tarea] || '#64748b';
        h += `<div class="summary-item">`;
        h += `<div class="si-dot" style="background:${co}"></div>`;
        h += `<div class="si-info">`;
        h += `<div class="si-client">${t.cliente}</div>`;
        h += `<div class="si-meta"><span>${t.tarea}</span><span>👤 ${t.responsable}</span></div>`;
        h += `</div>`;
        h += `<div class="si-actions">`;
        h += `<button class="si-btn approve" onclick="event.stopPropagation();approveTask(${t.taskId})" title="Aprobar">✅</button>`;
        h += `<button class="si-btn rreturn" onclick="event.stopPropagation();returnTask(${t.taskId})" title="Devolver">↩️</button>`;
        h += `<button class="si-btn history" onclick="event.stopPropagation();openHistory(${t.taskId})" title="Historial">📋</button>`;
        h += `</div>`;
        h += `</div>`;
      });
      if (reviewTasks.length > 10) {
        h += `<div class="summary-item" onclick="setView('review');closeSummaryPanel()"><div class="si-info"><div class="si-client" style="color:var(--accent)">Ver todas (${reviewTasks.length})...</div></div></div>`;
      }
    }
    h += `</div>`;
  } else {
    // Non-admin: tasks returned for corrections
    const returnedTasks = state.tasks.filter(t => t.estado === 'devuelta' && isMyTask(t));
    if (returnedTasks.length > 0) {
      h += `<div class="summary-section">`;
      h += `<div class="summary-section-header">↩️ Devueltas con Ajustes <span class="ss-count orange">${returnedTasks.length}</span></div>`;
      returnedTasks.forEach(t => {
        const co = TASK_COLORS[t.tarea] || '#64748b';
        h += `<div class="summary-item">`;
        h += `<div class="si-dot" style="background:${co}"></div>`;
        h += `<div class="si-info">`;
        h += `<div class="si-client">${t.cliente}</div>`;
        h += `<div class="si-meta"><span>${t.tarea}</span></div>`;
        h += `</div>`;
        h += `<div class="si-actions">`;
        h += `<button class="si-btn go" onclick="event.stopPropagation();submitForReview(${t.taskId})" title="Re-enviar">📤</button>`;
        h += `<button class="si-btn history" onclick="event.stopPropagation();openHistory(${t.taskId})" title="Ver observaciones">📋</button>`;
        h += `</div>`;
        h += `</div>`;
      });
      h += `</div>`;
    }

    // Non-admin: tasks in review (mine)
    const myReviewTasks = state.tasks.filter(t => t.estado === 'en_revision' && isMyTask(t));
    if (myReviewTasks.length > 0) {
      h += `<div class="summary-section">`;
      h += `<div class="summary-section-header">🔍 En Revisión <span class="ss-count">${myReviewTasks.length}</span></div>`;
      myReviewTasks.slice(0, 5).forEach(t => {
        const co = TASK_COLORS[t.tarea] || '#64748b';
        h += `<div class="summary-item">`;
        h += `<div class="si-dot" style="background:${co}"></div>`;
        h += `<div class="si-info">`;
        h += `<div class="si-client">${t.cliente}</div>`;
        h += `<div class="si-meta"><span>${t.tarea}</span><span>Esperando revisión</span></div>`;
        h += `</div>`;
        h += `<div class="si-actions">`;
        h += `<button class="si-btn history" onclick="event.stopPropagation();openHistory(${t.taskId})" title="Historial">📋</button>`;
        h += `</div>`;
        h += `</div>`;
      });
      h += `</div>`;
    }
  }

  // Both roles: unread mentions
  const unreadMentions = state.mentions.filter(m => m.isUnread);
  if (unreadMentions.length > 0) {
    h += `<div class="summary-section">`;
    h += `<div class="summary-section-header">💬 Menciones sin leer <span class="ss-count red">${unreadMentions.length}</span></div>`;
    unreadMentions.slice(0, 8).forEach(m => {
      const task = state.tasks.find(t => t.taskId === m.taskId);
      const taskName = task ? `${task.cliente} — ${task.tarea}` : `Tarea #${m.taskId}`;
      const co = task ? (TASK_COLORS[task.tarea] || '#64748b') : '#64748b';
      h += `<div class="summary-item" onclick="openHistory(${m.taskId});closeSummaryPanel()">`;
      h += `<div class="si-dot" style="background:${co}"></div>`;
      h += `<div class="si-info">`;
      h += `<div class="si-client">${taskName}</div>`;
      h += `<div class="si-meta"><span>💬 ${m.userName || m.userEmail} te mencionó</span><span>${formatTimeAgo(m.createdAt)}</span></div>`;
      if (m.comment) h += `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">"${m.comment}"</div>`;
      h += `</div>`;
      h += `</div>`;
    });
    if (unreadMentions.length > 8) {
      h += `<div class="summary-item"><div class="si-info"><div class="si-client" style="color:var(--accent)">...y ${unreadMentions.length - 8} más</div></div></div>`;
    }
    h += `</div>`;
  }

  // Both roles: tasks with unread comments (excluding tasks already shown as mentions)
  const mentionTaskIds = new Set(unreadMentions.map(m => String(m.taskId)));
  const unreadTaskIds = Object.entries(state.unreadCounts)
    .filter(([tid, c]) => c > 0 && !mentionTaskIds.has(tid))
    .sort((a,b) => b[1] - a[1]).slice(0, 8);
  if (unreadTaskIds.length > 0) {
    const totalUnread = unreadTaskIds.reduce((s, [,c]) => s + c, 0);
    h += `<div class="summary-section">`;
    h += `<div class="summary-section-header">📋 Mensajes sin leer <span class="ss-count red">${totalUnread}</span></div>`;
    unreadTaskIds.forEach(([tid, count]) => {
      const task = state.tasks.find(t => t.taskId === parseInt(tid));
      if (!task) return;
      const co = TASK_COLORS[task.tarea] || '#64748b';
      h += `<div class="summary-item" onclick="openHistory(${task.taskId});closeSummaryPanel()">`;
      h += `<div class="si-dot" style="background:${co}"></div>`;
      h += `<div class="si-info">`;
      h += `<div class="si-client">${task.cliente} — ${task.tarea}</div>`;
      h += `<div class="si-meta"><span>${count} mensaje${count > 1 ? 's' : ''} sin leer</span></div>`;
      h += `</div>`;
      h += `<span class="unread-badge">${count}</span>`;
      h += `</div>`;
    });
    h += `</div>`;
  }

  // Both roles: upcoming deadlines (within 2 days, not finalized)
  const urgentTasks = state.tasks.filter(t => {
    if (t.finalizada || t.estado === 'aprobada') return false;
    if (!isAdmin() && !isMyTask(t)) return false;
    const vto = parseDate(t.vencimiento);
    if (!vto) return false;
    const diff = vto - today;
    return diff >= 0 && diff <= twoDaysMs;
  }).sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || ''));

  // Both roles: overdue tasks
  const overdueTasks = state.tasks.filter(t => {
    if (t.finalizada || t.estado === 'aprobada') return false;
    if (!isAdmin() && !isMyTask(t)) return false;
    const vto = parseDate(t.vencimiento);
    if (!vto) return false;
    return vto < today;
  }).sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || ''));

  if (overdueTasks.length > 0) {
    h += `<div class="summary-section">`;
    h += `<div class="summary-section-header">🔴 Vencidas <span class="ss-count red">${overdueTasks.length}</span></div>`;
    overdueTasks.slice(0, 8).forEach(t => {
      const co = TASK_COLORS[t.tarea] || '#64748b';
      const estado = t.estado || 'pendiente';
      h += `<div class="summary-item" onclick="navigateToTask(${t.taskId})">`;
      h += `<div class="si-dot" style="background:${co}"></div>`;
      h += `<div class="si-info">`;
      h += `<div class="si-client">${t.cliente}</div>`;
      h += `<div class="si-meta"><span>${t.tarea}</span><span>${getEstadoIcon(estado)} ${getEstadoLabel(estado)}</span></div>`;
      h += `</div>`;
      h += `<span class="si-deadline urgent">Vto ${formatDateShort(t.vencimiento)}</span>`;
      h += `</div>`;
    });
    if (overdueTasks.length > 8) {
      h += `<div class="summary-item" onclick="setView('list');document.getElementById('filterEstado').value='overdue';render();closeSummaryPanel()"><div class="si-info"><div class="si-client" style="color:var(--danger)">Ver todas (${overdueTasks.length})...</div></div></div>`;
    }
    h += `</div>`;
  }

  if (urgentTasks.length > 0) {
    h += `<div class="summary-section">`;
    h += `<div class="summary-section-header">⚡ Próximas a Vencer <span class="ss-count orange">${urgentTasks.length}</span></div>`;
    urgentTasks.slice(0, 8).forEach(t => {
      const co = TASK_COLORS[t.tarea] || '#64748b';
      const vto = parseDate(t.vencimiento);
      const diffDays = Math.ceil((vto - today) / 86400000);
      const dlLabel = diffDays === 0 ? 'Hoy' : diffDays === 1 ? 'Mañana' : `En ${diffDays}d`;
      const estado = t.estado || 'pendiente';
      h += `<div class="summary-item" onclick="navigateToTask(${t.taskId})">`;
      h += `<div class="si-dot" style="background:${co}"></div>`;
      h += `<div class="si-info">`;
      h += `<div class="si-client">${t.cliente}</div>`;
      h += `<div class="si-meta"><span>${t.tarea}</span><span>${getEstadoIcon(estado)} ${getEstadoLabel(estado)}</span></div>`;
      h += `</div>`;
      h += `<span class="si-deadline ${diffDays === 0 ? 'urgent' : 'soon'}">${dlLabel}</span>`;
      h += `</div>`;
    });
    h += `</div>`;
  }

  if (!h) {
    h = `<div class="summary-empty" style="padding:40px">✅ Todo al día, no hay alertas</div>`;
  }

  body.innerHTML = h;
}

export function isMyTask(t) {
  if (!state.currentUser) return false;
  if (t.assignedTo === state.currentUser.email) return true;
  if (state.currentUser.responsableName && t.responsable === state.currentUser.responsableName) return true;
  return false;
}

export function navigateToTask(taskId) {
  closeSummaryPanel();
  const task = state.tasks.find(t => t.taskId === taskId);
  if (!task) return;

  // Navigate to the task's month in list view
  const vto = task.vencimiento;
  if (vto) {
    const [y, m] = vto.split('-').map(Number);
    state.currentDate = new Date(y, m - 1, 1);
  }
  // Dynamic lookup to avoid circular imports with router/tasks modules.
  window.setView && window.setView('list');

  // If non-admin, open history; if admin, open edit
  if (isAdmin()) {
    window.editTask && window.editTask(taskId);
  } else {
    window.openHistory && window.openHistory(taskId);
  }
}

export function updateSummaryBadges() {
  const fab = document.getElementById('summaryFab');
  const fabBadge = document.getElementById('fabBadge');
  const reviewBadge = document.getElementById('reviewBadge');

  if (!state.currentUser) { fab.style.display = 'none'; return; }
  fab.style.display = '';

  const today = new Date(); today.setHours(0,0,0,0);
  const twoDaysMs = 2 * 86400000;
  let totalAlerts = 0;

  if (isAdmin()) {
    const reviewCount = state.tasks.filter(t => t.estado === 'en_revision').length;
    totalAlerts += reviewCount;

    // Update review tab badge
    reviewBadge.textContent = reviewCount;
    reviewBadge.classList.toggle('hidden', reviewCount === 0);
  }

  // Count overdue + urgent for both roles
  const alertTasks = state.tasks.filter(t => {
    if (t.finalizada || t.estado === 'aprobada') return false;
    if (!isAdmin() && !isMyTask(t)) return false;
    const vto = parseDate(t.vencimiento);
    if (!vto) return false;
    const diff = vto - today;
    return diff < twoDaysMs;
  });
  totalAlerts += alertTasks.length;

  // For non-admin, also count returned tasks
  if (!isAdmin()) {
    const returned = state.tasks.filter(t => t.estado === 'devuelta' && isMyTask(t)).length;
    totalAlerts += returned;
  }

  // Count unread comments and mentions (deduplicated: mentions take priority)
  const totalUnreadMentions = state.mentions.filter(m => m.isUnread).length;
  const mentionTids = new Set(state.mentions.filter(m => m.isUnread).map(m => String(m.taskId)));
  const totalUnreadComments = Object.entries(state.unreadCounts)
    .filter(([tid, c]) => c > 0 && !mentionTids.has(tid))
    .reduce((s, [,c]) => s + c, 0);
  totalAlerts += totalUnreadComments + totalUnreadMentions;

  fabBadge.textContent = totalAlerts;
  fabBadge.classList.toggle('hidden', totalAlerts === 0);

  // Refresh panel content if open
  if (summaryOpen) renderSummaryPanel();
}
