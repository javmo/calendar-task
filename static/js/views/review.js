// Admin review dashboard.
// Extracted literally from legacy-inline.js.

import { TASK_COLORS } from '../constants.js';
import { state } from '../state.js';
import { formatDateFull } from '../utils/dates.js';
import { getDeadlineClass } from '../utils/format.js';

// =================== ADMIN REVIEW DASHBOARD ===================
export async function renderReview() {
  const container = document.getElementById('viewReview');

  // Get tasks en_revision from local state
  const reviewTasks = state.tasks.filter(t => t.estado === 'en_revision');

  let h = `<div class="review-header">`;
  h += `<h2>📝 Tareas para Revisar <span class="review-count">${reviewTasks.length}</span></h2>`;
  h += `</div>`;

  if (reviewTasks.length === 0) {
    h += `<div class="review-empty">`;
    h += `<div class="re-icon">✅</div>`;
    h += `<p>No hay tareas pendientes de revisión</p>`;
    h += `</div>`;
    container.innerHTML = h;
    return;
  }

  h += `<div class="review-cards">`;
  reviewTasks.forEach(t => {
    const co = TASK_COLORS[t.tarea] || '#64748b';
    const dlClass = getDeadlineClass(t.vencimiento);
    const assignedUser = state.users.find(u => u.email === t.assignedTo);
    const assignedName = assignedUser ? (assignedUser.responsableName || assignedUser.displayName) : (t.responsable || 'Sin asignar');

    h += `<div class="review-card">`;
    h += `<div class="review-card-header">`;
    h += `<div class="rc-type-dot" style="background:${co}"></div>`;
    h += `<div class="rc-info">`;
    h += `<div class="rc-client">${t.cliente}</div>`;
    h += `<div class="rc-task">${t.tarea}</div>`;
    h += `</div>`;
    h += `<span class="estado-badge estado-en_revision">🔍 En Revisión</span>`;
    h += `</div>`;

    h += `<div class="review-card-body">`;
    h += `<div class="review-card-meta">`;
    h += `<span>👤 ${assignedName}</span>`;
    h += `<span><span class="deadline-badge ${dlClass}">📅 ${formatDateFull(t.vencimiento)}</span></span>`;
    h += `<span>📁 ${t.semana}</span>`;
    h += `</div>`;
    h += `</div>`;

    h += `<div class="review-card-actions">`;
    h += `<button class="btn-workflow btn-approve" onclick="approveTask(${t.taskId})">✅ Aprobar</button>`;
    h += `<button class="btn-workflow btn-return" onclick="returnTask(${t.taskId})">↩️ Devolver</button>`;
    h += `<button class="btn-workflow" style="background:var(--surface);color:var(--text-secondary);border-color:var(--border)" onclick="openHistory(${t.taskId})">📋 Historial</button>`;
    h += `</div>`;
    h += `</div>`;
  });
  h += `</div>`;

  container.innerHTML = h;
}
