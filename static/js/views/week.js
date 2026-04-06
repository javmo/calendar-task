// Week view. Extracted literally from legacy-inline.js.

import { DAYS_FULL } from '../constants.js';
import { state } from '../state.js';
import { formatDate, formatDateShort, isToday } from '../utils/dates.js';
import { getEstadoLabel, getEstadoIcon } from '../utils/format.js';
import { getFilteredTasks } from './list.js';
import { isAdmin } from '../tasks/taskActions.js';
import { isMyTask } from './summary.js';
import { historyBtnHtml, unreadDotHtml } from '../tasks/history.js';

// =================== RENDER: WEEK ===================
export function renderWeek() {
  const ws = state.weekStart;
  const we = new Date(ws.getTime() + 6 * 86400000);
  document.getElementById('monthLabel').textContent = `${ws.getDate()}/${ws.getMonth()+1} — ${we.getDate()}/${we.getMonth()+1}/${we.getFullYear()}`;

  const tasks = getFilteredTasks();
  let h = '';

  for (let i = 0; i < 7; i++) {
    const d = new Date(ws.getTime() + i * 86400000);
    const ds = formatDate(d), isT = isToday(d);
    const dt = tasks.filter(t => t.vencimiento === ds);

    h += `<div class="week-day-col ${isT?'today':''}">`;
    h += `<div class="week-day-header"><div class="wday-name">${DAYS_FULL[d.getDay()]}</div><div class="wday-num">${d.getDate()}</div></div>`;
    h += `<div class="week-day-body">`;

    dt.forEach(t => {
      const isFin = t.finalizada;
      const estado = t.estado || 'pendiente';
      h += `<div class="week-task-card ${isFin?'finalized':''}" data-type="${t.tarea}" ${isFin?'':`onclick="editTask(${t.taskId})"`}>`;
      h += `<div class="client-name">${t.cliente} ${unreadDotHtml(t.taskId)}</div><div class="task-type">${t.tarea}</div>`;
      if (isFin) {
        h += `<div class="fin-tag">✅ Finalizada ${formatDateShort(t.fechaFinalizacion)}</div>`;
        h += `<div class="card-actions" onclick="event.stopPropagation()">`;
        h += historyBtnHtml(t.taskId, 'action-btn', 'font-size:10px');
        if (isAdmin()) h += `<button class="action-btn" onclick="restoreTask(${t.taskId})" title="Restaurar" style="font-size:10px">↩</button>`;
        h += `</div>`;
      } else {
        h += `<div style="margin-top:2px"><span class="estado-badge estado-${estado}" style="font-size:9px;padding:1px 6px">${getEstadoIcon(estado)} ${getEstadoLabel(estado)}</span></div>`;
        h += `<div class="card-actions" onclick="event.stopPropagation()">`;
        if (isAdmin()) {
          h += `<button class="action-btn ${t.completado?'active':''}" onclick="toggleStatus(${t.taskId},'completado')" title="Completado">✔</button>`;
          h += `<button class="action-btn ${t.enviado?'active':''}" onclick="toggleStatus(${t.taskId},'enviado')" title="Enviado">📩</button>`;
          h += `<button class="action-btn finalize-btn" onclick="finalizeTask(${t.taskId})" title="Finalizar" style="font-size:10px">✅</button>`;
        } else if (isMyTask(t)) {
          if (estado === 'pendiente' || estado === 'devuelta') {
            h += `<button class="action-btn" onclick="submitForReview(${t.taskId})" title="Enviar a revisión" style="font-size:10px;width:auto;padding:2px 6px">📤</button>`;
          } else if (estado === 'en_revision') {
            h += `<button class="action-btn" onclick="undoSubmitReview(${t.taskId})" title="Deshacer envío" style="font-size:10px;width:auto;padding:2px 6px">↩</button>`;
          }
        }
        h += historyBtnHtml(t.taskId, 'action-btn', 'font-size:10px');
        h += `</div>`;
      }
      h += `</div>`;
    });

    h += `</div></div>`;
  }
  document.getElementById('viewWeek').innerHTML = `<div class="week-grid">${h}</div>`;
}
