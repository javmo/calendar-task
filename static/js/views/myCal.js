// My Calendar view + drag & drop + reorder within day.
// Extracted literally from legacy-inline.js.

import { MONTHS_ES, DAYS_FULL } from '../constants.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { formatDate, formatDateShort, isToday } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';

// Extra state slots used only by this view (set as in the monolith)
state.myCalSearch = '';
state.myCalMonthFilter = '';
state.myCalCollapsedGroups = new Set();
state.myCalExpandedDays = new Set(); // days with all tasks shown

// Reorder drag state
let reorderDropTarget = null; // { dateStr, beforeTaskId } or null
let didDrag = false; // distinguish click from drag

// =================== RENDER: MY CALENDAR ===================
export function renderMyCalendar() {
  if (!state.currentUser) return;

  const ws = state.myCalWeekStart;
  const we = new Date(ws.getTime() + 6 * 86400000);
  document.getElementById('monthLabel').textContent =
    `Mi Calendario — ${ws.getDate()}/${ws.getMonth()+1} — ${we.getDate()}/${we.getMonth()+1}/${we.getFullYear()}`;

  const myName = state.currentUser.responsableName || '';
  const myEmail = state.currentUser.email;

  // My tasks: assigned to me (by responsable name or assignedTo email)
  const myTasks = state.tasks.filter(t =>
    (myName && t.responsable === myName) ||
    (t.assignedTo && t.assignedTo === myEmail)
  );

  // Scheduled task IDs
  const scheduledIds = new Set(state.schedule.map(s => s.taskId));

  // Unscheduled tasks (not finalized, not scheduled)
  let unscheduled = myTasks.filter(t => !t.finalizada && !scheduledIds.has(t.taskId));

  // Apply month filter to sidebar
  if (state.myCalMonthFilter) {
    unscheduled = unscheduled.filter(t => (t.vencimiento || '').startsWith(state.myCalMonthFilter));
  }

  // Apply search filter to sidebar
  if (state.myCalSearch) {
    const s = state.myCalSearch.toLowerCase();
    unscheduled = unscheduled.filter(t =>
      t.cliente.toLowerCase().includes(s) || t.tarea.toLowerCase().includes(s)
    );
  }

  unscheduled.sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || ''));

  // Group by task type for collapsible sections
  const byType = {};
  unscheduled.forEach(t => {
    if (!byType[t.tarea]) byType[t.tarea] = [];
    byType[t.tarea].push(t);
  });

  // Build sidebar
  let sideH = '';

  // Search box
  sideH += `<div class="sidebar-search"><input type="text" placeholder="Buscar tarea o cliente..." value="${state.myCalSearch}" oninput="state.myCalSearch=this.value;renderMyCalendar()"></div>`;

  // Month filter
  const months = [...new Set(myTasks.filter(t=>!t.finalizada).map(t => (t.vencimiento||'').slice(0,7)).filter(Boolean))].sort();
  sideH += `<div class="sidebar-month-filter"><select onchange="state.myCalMonthFilter=this.value;renderMyCalendar()">`;
  sideH += `<option value="">Todos los meses</option>`;
  months.forEach(m => {
    const [y, mo] = m.split('-');
    sideH += `<option value="${m}" ${state.myCalMonthFilter===m?'selected':''}>${MONTHS_ES[parseInt(mo,10)-1]} ${y}</option>`;
  });
  sideH += `</select></div>`;

  if (unscheduled.length === 0) {
    sideH += '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">Sin tareas pendientes</div>';
  } else {
    sideH += `<div class="sidebar-tasks">`;
    Object.keys(byType).sort().forEach(tipo => {
      const tasks = byType[tipo];
      const collapsed = state.myCalCollapsedGroups.has(tipo);
      sideH += `<div class="sidebar-group-header" onclick="toggleMyCalGroup('${tipo.replace(/'/g,"\\'")}')">`;
      sideH += `<span class="sg-arrow ${collapsed?'collapsed':''}">▼</span>`;
      sideH += `${tipo} <span class="sg-count">${tasks.length}</span>`;
      sideH += `</div>`;
      if (!collapsed) {
        tasks.forEach(t => {
          sideH += `<div class="sidebar-task" data-type="${t.tarea}" draggable="true" ondragstart="onDragStart(event, ${t.taskId})" ondragend="onDragEnd(event)">`;
          sideH += `<div class="st-client">${t.cliente}</div>`;
          sideH += `<div class="st-type">${t.tarea} — <span class="st-vto">${formatDateShort(t.vencimiento)}</span></div>`;
          sideH += `</div>`;
        });
      }
    });
    sideH += `</div>`;
  }

  // Build sticky header row + week grid
  const MAX_VISIBLE = 4;
  let headerH = '';
  let gridH = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws.getTime() + i * 86400000);
    const ds = formatDate(d), isT = isToday(d);

    // Sticky header
    headerH += `<div class="my-day-header ${isT?'today':''}"><div class="wday-name">${DAYS_FULL[d.getDay()]}</div><div class="wday-num">${d.getDate()}</div></div>`;

    // Tasks scheduled for this day, sorted by sortOrder
    const daySchedules = state.schedule
      .filter(s => s.scheduledDate === ds)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const dayTasks = daySchedules.map(s => {
      const task = state.tasks.find(t => t.taskId === s.taskId);
      return task ? { ...task, _scheduleNotes: s.notes } : null;
    }).filter(Boolean);

    // Also show tasks due this day (even if not scheduled)
    const dueTasks = myTasks.filter(t => t.vencimiento === ds && !daySchedules.some(s => s.taskId === t.taskId));

    const allDayCards = [];

    // Scheduled tasks
    dayTasks.forEach(t => {
      const isFin = t.finalizada;
      let card = `<div class="my-sched-card ${isFin?'finalized':''}" data-type="${t.tarea}" data-taskid="${t.taskId}" data-date="${ds}" draggable="${!isFin}" ${!isFin?`ondragstart="onDragStart(event, ${t.taskId})" ondragend="onDragEnd(event)"`:''} ondragover="onCardDragOver(event, ${t.taskId}, '${ds}')" ondragleave="onCardDragLeave(event)" onclick="onSchedCardClick(event, ${t.taskId})">`;
      card += `<button class="sc-remove" onclick="event.stopPropagation();removeSchedule(${t.taskId})" title="Quitar" aria-label="Quitar tarea del calendario">✕</button>`;
      card += `<div class="sc-client">${t.cliente}</div>`;
      card += `<div class="sc-type">${t.tarea}</div>`;
      card += `<div class="sc-meta"><span class="sc-vto">Vto: ${formatDateShort(t.vencimiento)}</span>`;
      if (isFin) card += ` <span class="fin-tag">✅</span>`;
      card += `</div></div>`;
      allDayCards.push(card);
    });

    // Due tasks (not scheduled, shown as ghost)
    dueTasks.forEach(t => {
      if (t.finalizada) return;
      let card = `<div class="my-sched-card" data-type="${t.tarea}" style="opacity:.6;border-style:dashed" draggable="true" ondragstart="onDragStart(event, ${t.taskId})" ondragend="onDragEnd(event)" onclick="onSchedCardClick(event, ${t.taskId})">`;
      card += `<div class="sc-client">${t.cliente}</div>`;
      card += `<div class="sc-type">${t.tarea} <small style="color:var(--warning)">(vence)</small></div>`;
      card += `<div class="sc-meta"><span class="sc-vto">Vto: ${formatDateShort(t.vencimiento)}</span></div>`;
      card += `</div>`;
      allDayCards.push(card);
    });

    gridH += `<div class="my-day-col ${isT?'today':''}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event, '${ds}')">`;
    gridH += `<div class="my-day-body">`;

    const expanded = state.myCalExpandedDays.has(ds);
    const visibleCards = expanded ? allDayCards : allDayCards.slice(0, MAX_VISIBLE);
    const hiddenCount = allDayCards.length - MAX_VISIBLE;

    visibleCards.forEach(card => { gridH += card; });

    if (!expanded && hiddenCount > 0) {
      gridH += `<div class="show-more-btn" onclick="state.myCalExpandedDays.add('${ds}');renderMyCalendar()">+ ${hiddenCount} mas</div>`;
    } else if (expanded && hiddenCount > 0) {
      gridH += `<div class="show-more-btn" onclick="state.myCalExpandedDays.delete('${ds}');renderMyCalendar()">Mostrar menos</div>`;
    }

    gridH += `</div></div>`;
  }

  document.getElementById('viewMyCal').innerHTML =
    `<div class="my-cal-layout">
      <div class="my-cal-sidebar">
        <div class="sidebar-header">
          <h3>Sin agendar</h3>
          <span class="sidebar-count">${unscheduled.length}</span>
        </div>
        ${sideH}
      </div>
      <div class="my-cal-grid-container">
        <div class="my-cal-sticky-header">${headerH}</div>
        <div class="my-cal-week-grid">${gridH}</div>
      </div>
    </div>
    <button class="back-to-top" id="backToTop" onclick="window.scrollTo({top:0,behavior:'smooth'})">▲</button>`;

  // Show/hide back-to-top on scroll
  const onScroll = () => {
    const btn = document.getElementById('backToTop');
    if (btn) btn.classList.toggle('visible', window.scrollY > 300);
  };
  window.removeEventListener('scroll', onScroll);
  window.addEventListener('scroll', onScroll);
  onScroll();
}

export function toggleMyCalGroup(tipo) {
  if (state.myCalCollapsedGroups.has(tipo)) state.myCalCollapsedGroups.delete(tipo);
  else state.myCalCollapsedGroups.add(tipo);
  renderMyCalendar();
}

// =================== DRAG & DROP ===================
export function onDragStart(e, taskId) {
  didDrag = true;
  e.dataTransfer.setData('text/plain', taskId.toString());
  e.dataTransfer.effectAllowed = 'move';
  e.target.classList.add('dragging');
}

export function onSchedCardClick(e, taskId) {
  if (didDrag) { didDrag = false; return; }
  if (window.editTask) window.editTask(taskId);
}

export function onDragEnd(e) {
  e.target.classList.remove('dragging');
  reorderDropTarget = null;
  setTimeout(() => { didDrag = false; }, 0);
  document.querySelectorAll('.my-day-body').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.my-sched-card').forEach(el => {
    el.classList.remove('drop-above', 'drop-below');
  });
}

export function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const body = e.currentTarget.querySelector('.my-day-body') || e.currentTarget;
  body.classList.add('drag-over');
}

export function onDragLeave(e) {
  const body = e.currentTarget.querySelector('.my-day-body') || e.currentTarget;
  body.classList.remove('drag-over');
}

// Detect which half of a card the cursor is over for reorder indicator
export function onCardDragOver(e, targetTaskId, dateStr) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';

  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const above = e.clientY < midY;

  card.classList.toggle('drop-above', above);
  card.classList.toggle('drop-below', !above);

  reorderDropTarget = { dateStr, targetTaskId, above };
}

export function onCardDragLeave(e) {
  e.currentTarget.classList.remove('drop-above', 'drop-below');
}

export async function onDrop(e, dateStr) {
  e.preventDefault();
  const body = e.currentTarget.querySelector('.my-day-body') || e.currentTarget;
  body.classList.remove('drag-over');
  document.querySelectorAll('.my-sched-card').forEach(el => {
    el.classList.remove('drop-above', 'drop-below');
  });

  const taskId = parseInt(e.dataTransfer.getData('text/plain'));
  if (isNaN(taskId)) return;

  // Check if this is a reorder within the same day
  const isAlreadyScheduledHere = state.schedule.some(s => s.taskId === taskId && s.scheduledDate === dateStr);

  if (isAlreadyScheduledHere && reorderDropTarget && reorderDropTarget.dateStr === dateStr) {
    // Reorder within the same day
    await reorderInDay(dateStr, taskId, reorderDropTarget.targetTaskId, reorderDropTarget.above);
    reorderDropTarget = null;
    return;
  }

  // Schedule or move to a different day
  try {
    await api('POST', '/api/schedule', { taskId, scheduledDate: dateStr });
    const existing = state.schedule.findIndex(s => s.taskId === taskId);
    if (existing >= 0) {
      state.schedule[existing].scheduledDate = dateStr;
    } else {
      const maxOrder = state.schedule
        .filter(s => s.scheduledDate === dateStr)
        .reduce((m, s) => Math.max(m, s.sortOrder ?? 0), -1);
      state.schedule.push({ taskId, scheduledDate: dateStr, userEmail: state.currentUser.email, notes: '', sortOrder: maxOrder + 1 });
    }

    // If dropped on a specific card position, reorder after scheduling
    if (reorderDropTarget && reorderDropTarget.dateStr === dateStr) {
      await reorderInDay(dateStr, taskId, reorderDropTarget.targetTaskId, reorderDropTarget.above);
      reorderDropTarget = null;
      return;
    }

    reorderDropTarget = null;
    renderMyCalendar();
    showToast('Tarea agendada', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function reorderInDay(dateStr, movedTaskId, targetTaskId, above) {
  // Build the current order for this day
  const daySchedules = state.schedule
    .filter(s => s.scheduledDate === dateStr)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const orderedIds = daySchedules.map(s => s.taskId).filter(id => id !== movedTaskId);

  // Insert at the target position
  const targetIdx = orderedIds.indexOf(targetTaskId);
  if (targetIdx === -1) {
    orderedIds.push(movedTaskId);
  } else {
    orderedIds.splice(above ? targetIdx : targetIdx + 1, 0, movedTaskId);
  }

  // Update local state immediately
  orderedIds.forEach((id, i) => {
    const entry = state.schedule.find(s => s.taskId === id && s.scheduledDate === dateStr);
    if (entry) entry.sortOrder = i;
  });
  renderMyCalendar();

  // Persist to backend
  try {
    await api('PUT', '/api/schedule/reorder', { scheduledDate: dateStr, taskIds: orderedIds });
  } catch (err) {
    showToast('Error al reordenar: ' + err.message, 'error');
  }
}

export async function removeSchedule(taskId) {
  try {
    await api('DELETE', `/api/schedule/${taskId}`);
    state.schedule = state.schedule.filter(s => s.taskId !== taskId);
    renderMyCalendar();
    showToast('Tarea desagendada', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}
