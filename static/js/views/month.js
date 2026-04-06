// Month view. Extracted literally from legacy-inline.js.

import { MONTHS_ES } from '../constants.js';
import { state } from '../state.js';
import { formatDate, formatDateShort, formatDateFull, isToday, getDaysInMonth, getWeekStart } from '../utils/dates.js';
import { getTaskStatus } from '../utils/format.js';
import { getFilteredTasks, populateFilters } from './list.js';
import { getUnreadCount } from '../tasks/history.js';
import { render } from '../router.js';

// =================== RENDER: MONTH ===================
export function renderMonth() {
  const year = state.currentDate.getFullYear(), month = state.currentDate.getMonth();
  document.getElementById('monthLabel').textContent = `${MONTHS_ES[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const dim = getDaysInMonth(year, month);
  const dimPrev = getDaysInMonth(year, month - 1);
  const tasks = getFilteredTasks();
  let h = '';

  ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].forEach((d, i) => {
    h += `<div class="day-header ${i >= 5 ? 'weekend' : ''}">${d}</div>`;
  });

  const totalCells = Math.ceil((startOffset + dim) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    let dn, dateObj, isOther = false;
    if (i < startOffset) { dn = dimPrev - startOffset + i + 1; dateObj = new Date(year, month-1, dn); isOther = true; }
    else if (i >= startOffset + dim) { dn = i - startOffset - dim + 1; dateObj = new Date(year, month+1, dn); isOther = true; }
    else { dn = i - startOffset + 1; dateObj = new Date(year, month, dn); }

    const isWe = (i % 7) >= 5, isT = isToday(dateObj), ds = formatDate(dateObj);
    const dt = tasks.filter(t => t.vencimiento === ds);

    h += `<div class="day-cell ${isOther?'other-month':''} ${isT?'today':''} ${isWe?'weekend':''}">`;
    h += `<div class="day-number">${dn}${dt.length ? `<span class="task-count">${dt.length}</span>` : ''}</div>`;
    if (dt.length) {
      h += `<div class="task-cards">`;
      dt.forEach(t => {
        const isFin = t.finalizada;
        const st = getTaskStatus(t);
        h += `<div class="task-card ${st==='overdue'&&!isFin?'overdue':''} ${isFin?'finalized':''}" data-type="${t.tarea}" ${isFin?'':`onclick="editTask(${t.taskId})"`} title="${t.cliente} — ${t.tarea}&#10;${t.responsable} | Vto: ${formatDateShort(t.vencimiento)}${isFin?'&#10;✅ Finalizada '+formatDateFull(t.fechaFinalizacion):''}">`;
        h += `<div class="card-text"><span class="client-name">${t.cliente}</span><span class="task-type">${t.tarea}</span></div>`;
        const uc = getUnreadCount(t.taskId);
        h += uc > 0 ? `<span class="unread-badge">${uc}</span>` : '';
        h += isFin ? `<span class="fin-tag">✅</span>` : `<span class="card-badge badge-${(t.responsable||'').toLowerCase()}">${(t.responsable||'')[0]||'?'}</span>`;
        h += `</div>`;
      });
      h += `</div>`;
    }
    h += `</div>`;
  }
  document.getElementById('viewMonth').innerHTML = `<div class="calendar-grid">${h}</div>`;
}

// =================== VIEW NAV ===================
export function changeMonth(delta) {
  if (state.currentView === 'week') {
    state.weekStart = new Date(state.weekStart.getTime() + delta * 7 * 86400000);
  } else if (state.currentView === 'mycal') {
    state.myCalWeekStart = new Date(state.myCalWeekStart.getTime() + delta * 7 * 86400000);
  } else {
    state.currentDate.setMonth(state.currentDate.getMonth() + delta);
    populateFilters();
  }
  render();
}

export function goToday() {
  const t = new Date();
  state.currentDate = new Date(t.getFullYear(), t.getMonth(), 1);
  state.weekStart = getWeekStart(t);
  state.myCalWeekStart = getWeekStart(t);
  render();
}
