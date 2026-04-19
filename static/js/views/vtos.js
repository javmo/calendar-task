// Vencimientos (due dates) view.
// Extracted literally from legacy-inline.js.

import { MONTHS_ES } from '../constants.js';
import { getVtoTaskTypes } from '../taskTypes.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../ui/toast.js';

// VTO_TASK_TYPES is now dynamic: loaded from the API via getVtoTaskTypes().
// Helper so every function can do: const VTO_TASK_TYPES = _vtoTypes();
function _vtoTypes() {
  const dynamic = getVtoTaskTypes();
  if (dynamic.length > 0) return dynamic.map(tt => tt.name);
  // Emergency fallback if taskTypes haven't loaded yet
  return [
    'Casas Particulares', 'VEP Monotributo', 'VEP Autonomos',
    'IIBB CM', 'IIBB ARBA', 'IIBB AGIP', 'IVA', 'Libro IVA Digital',
  ];
}

// Cache de sugerencias por período
state.vtoSugerencias = {};

export function renderVencimientos() {
  document.getElementById('monthLabel').textContent = 'Tabla de Vencimientos';

  if (!state.vtoPeriodo) {
    const now = new Date();
    state.vtoPeriodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const periodos = [];
  for (let m = 1; m <= 12; m++) {
    periodos.push(`2026-${String(m).padStart(2, '0')}`);
  }

  const vtoData = state.vencimientos[state.vtoPeriodo];
  const tabla = vtoData ? vtoData.tabla : null;
  const sugerencias = state.vtoSugerencias[state.vtoPeriodo];
  const tablaSug = sugerencias ? sugerencias.tabla : null;

  let h = `<div class="vtos-header">`;
  h += `<h2>\ud83d\udcc5 Vencimientos por D\u00edgito CUIT</h2>`;
  h += `<select class="vtos-periodo-select" onchange="state.vtoPeriodo=this.value;loadVtoPeriodo()">`;
  periodos.forEach(p => {
    const [y, m] = p.split('-');
    const label = MONTHS_ES[parseInt(m) - 1] + ' ' + y;
    h += `<option value="${p}" ${p === state.vtoPeriodo ? 'selected' : ''}>${label}</option>`;
  });
  h += `</select>`;
  h += `<div class="vtos-actions">`;
  h += `<button class="btn btn-outline-sug" onclick="cargarSugerencias()" title="Traer fechas sugeridas desde calendarios oficiales">\ud83d\udca1 Sugerencias</button>`;
  h += `<button class="btn btn-primary" onclick="saveVencimientos()">\ud83d\udcbe Guardar</button>`;
  h += `<button class="btn btn-success" onclick="aplicarVencimientos()">\u2705 Aplicar a Tareas</button>`;
  h += `</div></div>`;

  // Suggestion banner
  if (tablaSug) {
    const countEmpty = countEmptyCells(tabla);
    const countSug = countSugerenciasDisponibles(tabla, tablaSug);
    h += `<div class="vtos-sug-banner">`;
    h += `<div class="sug-banner-content">`;
    h += `<span class="sug-banner-icon">\ud83d\udca1</span>`;
    h += `<div class="sug-banner-text">`;
    h += `<strong>Sugerencias cargadas</strong> \u2014 ${countSug} fechas sugeridas disponibles para completar.`;
    if (sugerencias.nota) h += `<br><small>${sugerencias.nota}</small>`;
    h += `</div>`;
    h += `<div class="sug-banner-actions">`;
    h += `<button class="btn btn-sug-accept" onclick="aceptarTodasSugerencias()">Aceptar todas</button>`;
    h += `<button class="btn btn-sug-fill" onclick="aceptarSugerenciasVacias()">Solo vac\u00edas</button>`;
    h += `<button class="btn btn-sug-dismiss" onclick="descartarSugerencias()">Descartar</button>`;
    h += `</div></div></div>`;
  }

  const VTO_TASK_TYPES = _vtoTypes();

  // Table
  h += `<div class="vtos-table-wrap"><table class="vtos-table"><thead><tr>`;
  h += `<th>D\u00edgito</th>`;
  VTO_TASK_TYPES.forEach(t => {
    const fuente = sugerencias && sugerencias.fuentes ? sugerencias.fuentes[t] : '';
    h += `<th>${t}${fuente ? `<br><small class="th-fuente">${fuente}</small>` : ''}</th>`;
  });
  h += `</tr></thead><tbody>`;

  for (let d = 0; d <= 9; d++) {
    h += `<tr><td>${d}</td>`;
    VTO_TASK_TYPES.forEach(tipo => {
      const val = tabla && tabla[tipo] ? (tabla[tipo][String(d)] || '') : '';
      const sug = tablaSug && tablaSug[tipo] ? (tablaSug[tipo][String(d)] || '') : '';
      const hasVal = val && val.length > 0;
      const hasSug = sug && sug.length > 0 && !hasVal;
      const sugMatch = hasVal && sug && val === sug;
      const inputId = `vto_${tipo.replace(/\s/g,'_')}_${d}`;

      let cls = '';
      if (hasVal && sugMatch) cls = 'has-value sug-match';
      else if (hasVal) cls = 'has-value';
      else if (hasSug) cls = 'has-sug';

      h += `<td class="${hasSug ? 'td-has-sug' : ''}">`;
      h += `<div class="vto-cell">`;
      h += `<input type="date" id="${inputId}" value="${val}" class="${cls}" `;
      h += `onchange="onVtoInputChange(this, '${tipo}', ${d})">`;

      if (hasSug) {
        const sugDate = new Date(sug + 'T12:00:00');
        const sugLabel = sugDate.getDate() + '/' + (sugDate.getMonth() + 1);
        h += `<div class="sug-hint" onclick="aceptarSugerencia('${tipo}', ${d})" title="Click para aceptar sugerencia: ${sug}">`;
        h += `<span class="sug-date">${sugLabel}</span>`;
        h += `</div>`;
      }
      h += `</div></td>`;
    });
    h += `</tr>`;
  }

  h += `</tbody></table></div>`;

  // Info box
  h += `<div class="vtos-info">`;
  h += `<span class="info-icon">\ud83d\udca1</span>`;
  h += `<div class="info-text">`;
  h += `<strong>\u00bfC\u00f3mo funciona?</strong> Carg\u00e1 las fechas manualmente o us\u00e1 <strong>"Sugerencias"</strong> para pre-cargar fechas basadas en los calendarios oficiales de ARCA, COMARB, ARBA y AGIP. `;
  h += `Las sugerencias aparecen debajo de las celdas vac\u00edas \u2014 hac\u00e9 click en ellas para aceptarlas individualmente, o us\u00e1 los botones para aceptar todas. `;
  h += `Luego puls\u00e1 <strong>"Guardar"</strong> y <strong>"Aplicar a Tareas"</strong> para actualizar los vencimientos de todas las tareas del mes.`;
  h += `</div></div>`;

  // Fuentes reference
  if (sugerencias && sugerencias.fuentes) {
    h += `<div class="vtos-fuentes">`;
    h += `<strong>Fuentes de referencia:</strong>`;
    h += `<div class="fuentes-grid">`;
    Object.entries(sugerencias.fuentes).forEach(([tipo, fuente]) => {
      h += `<span class="fuente-item"><strong>${tipo}:</strong> ${fuente}</span>`;
    });
    h += `</div>`;
    h += `<p class="fuentes-disclaimer">Las fechas son orientativas. Verificar contra las resoluciones oficiales vigentes de cada organismo.</p>`;
    h += `</div>`;
  }

  h += `<div id="vtosResult"></div>`;

  document.getElementById('viewVtos').innerHTML = h;
}

export function countEmptyCells(tabla) {
  let count = 0;
  _vtoTypes().forEach(tipo => {
    for (let d = 0; d <= 9; d++) {
      if (!tabla || !tabla[tipo] || !tabla[tipo][String(d)]) count++;
    }
  });
  return count;
}

export function countSugerenciasDisponibles(tabla, tablaSug) {
  let count = 0;
  _vtoTypes().forEach(tipo => {
    for (let d = 0; d <= 9; d++) {
      const sug = tablaSug && tablaSug[tipo] ? tablaSug[tipo][String(d)] : null;
      if (sug) count++;
    }
  });
  return count;
}

export async function cargarSugerencias() {
  try {
    showToast('Cargando sugerencias...', 'info');
    const data = await api('GET', `/api/vencimientos/${state.vtoPeriodo}/sugerencias`);
    state.vtoSugerencias[state.vtoPeriodo] = data;
    renderVencimientos();
    showToast('Sugerencias cargadas correctamente', 'success');
  } catch(e) {
    showToast('Error al cargar sugerencias: ' + e.message, 'error');
  }
}

export function aceptarSugerencia(tipo, digito) {
  const sug = state.vtoSugerencias[state.vtoPeriodo];
  if (!sug || !sug.tabla[tipo]) return;
  const val = sug.tabla[tipo][String(digito)];
  if (!val) return;

  const inputId = `vto_${tipo.replace(/\s/g,'_')}_${digito}`;
  const input = document.getElementById(inputId);
  if (input) {
    input.value = val;
    input.classList.add('has-value', 'sug-match');
    input.classList.remove('has-sug');
    // Remove the hint
    const cell = input.closest('.vto-cell');
    const hint = cell ? cell.querySelector('.sug-hint') : null;
    if (hint) hint.remove();
    if (cell) cell.closest('td').classList.remove('td-has-sug');
  }
}

export function aceptarTodasSugerencias() {
  const sug = state.vtoSugerencias[state.vtoPeriodo];
  if (!sug) return;

  _vtoTypes().forEach(tipo => {
    for (let d = 0; d <= 9; d++) {
      const val = sug.tabla[tipo] ? sug.tabla[tipo][String(d)] : null;
      if (val) {
        const inputId = `vto_${tipo.replace(/\s/g,'_')}_${d}`;
        const input = document.getElementById(inputId);
        if (input) {
          input.value = val;
          input.classList.add('has-value', 'sug-match');
          input.classList.remove('has-sug');
        }
      }
    }
  });

  // Re-render to clean up hints
  const tabla = collectVtosFromForm();
  if (!state.vencimientos[state.vtoPeriodo]) {
    state.vencimientos[state.vtoPeriodo] = { periodo: state.vtoPeriodo, tabla };
  } else {
    state.vencimientos[state.vtoPeriodo].tabla = tabla;
  }
  renderVencimientos();
  showToast('Todas las sugerencias aplicadas. Record\u00e1 guardar los cambios.', 'success');
}

export function aceptarSugerenciasVacias() {
  const sug = state.vtoSugerencias[state.vtoPeriodo];
  if (!sug) return;

  let count = 0;
  _vtoTypes().forEach(tipo => {
    for (let d = 0; d <= 9; d++) {
      const inputId = `vto_${tipo.replace(/\s/g,'_')}_${d}`;
      const input = document.getElementById(inputId);
      if (input && !input.value) {
        const val = sug.tabla[tipo] ? sug.tabla[tipo][String(d)] : null;
        if (val) {
          input.value = val;
          input.classList.add('has-value', 'sug-match');
          input.classList.remove('has-sug');
          count++;
        }
      }
    }
  });

  const tabla = collectVtosFromForm();
  if (!state.vencimientos[state.vtoPeriodo]) {
    state.vencimientos[state.vtoPeriodo] = { periodo: state.vtoPeriodo, tabla };
  } else {
    state.vencimientos[state.vtoPeriodo].tabla = tabla;
  }
  renderVencimientos();
  showToast(`${count} celdas completadas con sugerencias. Record\u00e1 guardar.`, 'success');
}

export function descartarSugerencias() {
  delete state.vtoSugerencias[state.vtoPeriodo];
  renderVencimientos();
  showToast('Sugerencias descartadas', 'info');
}

export function onVtoInputChange(input, tipo, digito) {
  input.classList.toggle('has-value', !!input.value);
  input.classList.remove('has-sug', 'sug-match');
  if (input.value) {
    const sug = state.vtoSugerencias[state.vtoPeriodo];
    if (sug && sug.tabla[tipo] && sug.tabla[tipo][String(digito)] === input.value) {
      input.classList.add('sug-match');
    }
  }
  // Remove hint if present
  const cell = input.closest('.vto-cell');
  const hint = cell ? cell.querySelector('.sug-hint') : null;
  if (hint && input.value) hint.remove();
}

export async function loadVtoPeriodo() {
  try {
    const data = await api('GET', `/api/vencimientos/${state.vtoPeriodo}`);
    state.vencimientos[state.vtoPeriodo] = data;
  } catch(e) {
    console.warn('Load vto periodo:', e);
  }
  renderVencimientos();
}

export function collectVtosFromForm() {
  const tabla = {};
  _vtoTypes().forEach(tipo => {
    tabla[tipo] = {};
    for (let d = 0; d <= 9; d++) {
      const input = document.getElementById(`vto_${tipo.replace(/\s/g,'_')}_${d}`);
      tabla[tipo][String(d)] = input && input.value ? input.value : null;
    }
  });
  return tabla;
}

export async function saveVencimientos() {
  const tabla = collectVtosFromForm();
  try {
    await api('PUT', `/api/vencimientos/${state.vtoPeriodo}`, { tabla });
    state.vencimientos[state.vtoPeriodo] = { periodo: state.vtoPeriodo, tabla };
    showToast('Vencimientos guardados', 'success');
    document.getElementById('vtosResult').innerHTML = '';
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

export async function aplicarVencimientos() {
  const tabla = collectVtosFromForm();
  try {
    await api('PUT', `/api/vencimientos/${state.vtoPeriodo}`, { tabla });
    state.vencimientos[state.vtoPeriodo] = { periodo: state.vtoPeriodo, tabla };

    const result = await api('POST', `/api/vencimientos/${state.vtoPeriodo}/aplicar`);

    document.getElementById('vtosResult').innerHTML =
      `<div class="vtos-result success">\u2705 ${result.tareasActualizadas} tareas actualizadas de ${result.totalTareas} en ${result.mes}.</div>`;

    state.tasks = await api('GET', '/api/tasks');
    showToast(`Vencimientos aplicados: ${result.tareasActualizadas} tareas actualizadas`, 'success');
  } catch (e) {
    document.getElementById('vtosResult').innerHTML =
      `<div class="vtos-result error">\u274c Error: ${e.message}</div>`;
    showToast('Error: ' + e.message, 'error');
  }
}
