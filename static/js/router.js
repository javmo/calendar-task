// Router / view management + loading/app screens.
// Extracted literally from legacy-inline.js.

import { state } from './state.js';
import { getWeekStart } from './utils/dates.js';
import { renderMonth } from './views/month.js';
import { renderWeek } from './views/week.js';
import { renderList, populateFilters, populateFormSelects, renderLegend, updateStats, renderFinalized } from './views/list.js';
import { renderMyCalendar } from './views/myCal.js';
import { renderUsers } from './views/users.js';
import { renderClientes } from './views/clientes.js';
import { renderVencimientos } from './views/vtos.js';
import { renderAssign } from './views/assign.js';
import { renderReview } from './views/review.js';
import { renderFiscal } from './views/fiscal.js';
import { updateSummaryBadges } from './views/summary.js';
import { renderTaskTypes } from './views/taskTypes.js';
import { renderBackup } from './views/backup.js';
import { updateUserMenu } from './auth.js';

// =================== SCREEN MANAGEMENT ===================
export function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }
export function showSetup() {
  document.getElementById('setupScreen').style.display = 'flex';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'none';
}
export function showLogin() {
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}
export function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.style.display = 'block';
}
export function skipSetup() {
  // Try dev mode — resolved at runtime via window to avoid circular import.
  window.checkDevMode && window.checkDevMode();
}

export function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('profileSetup').classList.remove('active');
  document.getElementById('app').style.display = 'block';

  const t = new Date();
  state.currentDate = new Date(t.getFullYear(), t.getMonth(), 1);
  state.weekStart = getWeekStart(t);
  state.myCalWeekStart = getWeekStart(t);

  populateFilters();
  populateFormSelects();
  renderLegend();
  updateUserMenu();
  render();
}

// =================== VIEW MANAGEMENT ===================
export function setView(v) {
  state.currentView = v;
  if (v !== 'list') state.selectedTasks.clear();
  document.querySelectorAll('.view-toggle .btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));

const views = { month: 'viewMonth', week: 'viewWeek', list: 'viewList', mycal: 'viewMyCal', users: 'viewUsers', clientes: 'viewClientes', vtos: 'viewVtos', assign: 'viewAssign', review: 'viewReview', fiscal: 'viewFiscal', taskTypes: 'viewTaskTypes', backup: 'viewBackup' };
    for (const [key, id] of Object.entries(views)) {
      document.getElementById(id).style.display = key === v ? '' : 'none';
    }

    // Show/hide filters for special views
    const hideFilter = ['users','clientes','vtos','assign','review','fiscal','taskTypes','backup'];
    const hideLegend = ['users','mycal','clientes','vtos','assign','review','fiscal','taskTypes','backup'];
    const hideSearch = ['clientes','users','vtos','assign','review','fiscal','taskTypes','backup'];
    document.getElementById('filterGroup').style.display = hideFilter.includes(v) ? 'none' : '';
    document.getElementById('legend').style.display = hideLegend.includes(v) ? 'none' : '';
    document.querySelector('.toolbar .search-wrapper').style.display = hideSearch.includes(v) ? 'none' : '';

  render();
}

// =================== MAIN RENDER ===================
export function render() {
  updateStats();
  if (state.currentView === 'month') renderMonth();
  else if (state.currentView === 'week') renderWeek();
  else if (state.currentView === 'list') renderList();
  else if (state.currentView === 'mycal') renderMyCalendar();
  else if (state.currentView === 'users') renderUsers();
  else if (state.currentView === 'clientes') renderClientes();
  else if (state.currentView === 'vtos') renderVencimientos();
  else if (state.currentView === 'assign') renderAssign();
  else if (state.currentView === 'review') renderReview();
  else if (state.currentView === 'fiscal') renderFiscal();
  else if (state.currentView === 'taskTypes') renderTaskTypes();
  else if (state.currentView === 'backup') renderBackup();
  renderFinalized();
  updateSummaryBadges();
}
