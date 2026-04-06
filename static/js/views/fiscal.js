// Fiscal period generation view.
// Extracted literally from legacy-inline.js.

import { TASK_COLORS } from '../constants.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { showConfirm } from '../ui/dialogs.js';
import { render } from '../router.js';
import { populateFilters } from './list.js';

// =================== RENDER: FISCAL PERIOD ===================
export function renderFiscal() {
  document.getElementById('monthLabel').textContent = 'Generar Período Fiscal';

  const clientsWithCats = state.clientes.filter(c => c.categorias && c.categorias.length > 0);
  const now = new Date();
  const defaultYear = now.getFullYear() + (now.getMonth() >= 10 ? 1 : 0);

  if (!state.fiscalYear) state.fiscalYear = defaultYear;
  if (!state.fiscalSelectedClients) state.fiscalSelectedClients = new Set();
  const selAll = state.fiscalSelectedClients.size === 0;

  let h = `<div class="fiscal-panel">`;
  h += `<h2>📆 Generar Período Fiscal</h2>`;
  h += `<p style="color:var(--text-secondary);font-size:13px;margin-bottom:20px">Generá tareas automáticamente para todos los meses del año fiscal, basándote en las categorías asignadas a cada cliente.</p>`;

  h += `<div style="display:flex;gap:16px;align-items:flex-end;margin-bottom:24px;flex-wrap:wrap">`;
  h += `<div><label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:5px">Año fiscal</label>`;
  h += `<input type="number" id="fiscalYearInput" value="${state.fiscalYear}" min="2024" max="2040" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;width:100px;font-family:inherit" onchange="state.fiscalYear=+this.value"></div>`;

  // Responsable select
  h += `<div><label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:5px">Responsable por defecto</label>`;
  h += `<select id="fiscalResponsable" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit">`;
  state.users.filter(u => u.responsableName || u.displayName).forEach(u => {
    const name = u.responsableName || u.displayName;
    h += `<option value="${name}">${name}</option>`;
  });
  h += `</select></div>`;

  h += `<div><label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:5px">Semana</label>`;
  h += `<select id="fiscalSemana" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit">`;
  ['1ER SEMANA','2DA SEMANA','3ER SEMANA','4TA SEMANA'].forEach(s => {
    h += `<option value="${s}">${s}</option>`;
  });
  h += `</select></div>`;

  h += `<button class="btn btn-primary" onclick="generateFiscalPeriod()" style="height:38px">⚡ Generar Tareas</button>`;
  h += `</div>`;

  // Clients list
  if (clientsWithCats.length === 0) {
    h += `<div style="padding:32px;text-align:center;color:var(--text-muted);background:var(--surface2);border-radius:var(--radius-sm)">`;
    h += `<div style="font-size:24px;margin-bottom:8px">📋</div>`;
    h += `<p>No hay clientes con categorías asignadas.</p>`;
    h += `<p style="font-size:12px;margin-top:4px">Editá un cliente y asignale categorías de tareas primero.</p>`;
    h += `</div>`;
  } else {
    h += `<div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">`;
    h += `<span style="font-size:13px;font-weight:600">${clientsWithCats.length} cliente${clientsWithCats.length !== 1 ? 's' : ''} con categorías</span>`;
    h += `<label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer">`;
    h += `<input type="checkbox" ${selAll ? 'checked' : ''} onchange="toggleFiscalSelectAll(this.checked)"> Todos`;
    h += `</label></div>`;

    h += `<div class="fiscal-clients-list">`;
    clientsWithCats.forEach(c => {
      const isSelected = selAll || state.fiscalSelectedClients.has(c.clienteId);
      h += `<div class="fiscal-client-row ${isSelected ? 'selected' : ''}">`;
      h += `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1">`;
      h += `<input type="checkbox" class="fiscal-client-cb" value="${c.clienteId}" ${isSelected ? 'checked' : ''} onchange="toggleFiscalClient(${c.clienteId}, this.checked)">`;
      h += `<div>`;
      h += `<div style="font-weight:600;font-size:13px">${c.nombre}</div>`;
      h += `<div style="font-size:11px;color:var(--text-muted)">CUIT: ${c.cuit || '-'}</div>`;
      h += `</div></label>`;
      h += `<div class="ce-categorias" style="justify-content:flex-end">`;
      c.categorias.forEach(cat => {
        const co = TASK_COLORS[cat] || '#64748b';
        h += `<span class="cc-cat-tag" style="background:${co}20;color:${co};border:1px solid ${co}40">${cat}</span>`;
      });
      h += `</div></div>`;
    });
    h += `</div>`;
  }

  h += `</div>`;
  document.getElementById('viewFiscal').innerHTML = h;
}

export function toggleFiscalSelectAll(checked) {
  if (checked) {
    state.fiscalSelectedClients = new Set();
  } else {
    state.fiscalSelectedClients = new Set([-1]); // sentinel: none selected
  }
  renderFiscal();
}

export function toggleFiscalClient(clienteId, checked) {
  if (state.fiscalSelectedClients.size === 0) {
    // Was "all selected" — switch to explicit selection
    const allIds = state.clientes.filter(c => c.categorias && c.categorias.length > 0).map(c => c.clienteId);
    state.fiscalSelectedClients = new Set(allIds);
  }
  if (checked) {
    state.fiscalSelectedClients.add(clienteId);
    state.fiscalSelectedClients.delete(-1);
  } else {
    state.fiscalSelectedClients.delete(clienteId);
    if (state.fiscalSelectedClients.size === 0) state.fiscalSelectedClients.add(-1);
  }
  // Check if all are selected again
  const allIds = state.clientes.filter(c => c.categorias && c.categorias.length > 0).map(c => c.clienteId);
  if (allIds.every(id => state.fiscalSelectedClients.has(id))) {
    state.fiscalSelectedClients = new Set();
  }
  renderFiscal();
}

export async function generateFiscalPeriod() {
  const year = state.fiscalYear || new Date().getFullYear();
  const responsable = document.getElementById('fiscalResponsable')?.value || 'PERSONA';
  const semana = document.getElementById('fiscalSemana')?.value || '1ER SEMANA';

  const clientsWithCats = state.clientes.filter(c => c.categorias && c.categorias.length > 0);
  if (clientsWithCats.length === 0) { showToast('No hay clientes con categorías', 'error'); return; }

  let clienteIds = null;
  if (state.fiscalSelectedClients.size > 0 && !state.fiscalSelectedClients.has(-1)) {
    clienteIds = [...state.fiscalSelectedClients];
  } else if (state.fiscalSelectedClients.has(-1)) {
    showToast('Seleccioná al menos un cliente', 'error'); return;
  }

  const count = clienteIds ? clienteIds.length : clientsWithCats.length;
  if (!await showConfirm('Generar Período Fiscal',
    `Se generarán tareas para <strong>${count} cliente${count !== 1 ? 's' : ''}</strong> durante todo el año <strong>${year}</strong>.<br><br>Las tareas duplicadas se omitirán automáticamente.`,
    { icon: '📆', confirmText: 'Generar' })) return;

  try {
    const body = { year, responsable, semana };
    if (clienteIds) body.clienteIds = clienteIds;
    const result = await api('POST', '/api/generate-fiscal-period', body);
    state.tasks = await api('GET', '/api/tasks');
    populateFilters();
    render();
    showToast(`${result.totalCreated} tarea${result.totalCreated !== 1 ? 's' : ''} creada${result.totalCreated !== 1 ? 's' : ''} para ${result.clientsProcessed} cliente${result.clientsProcessed !== 1 ? 's' : ''}`, 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
