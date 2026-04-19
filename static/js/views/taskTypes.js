// Task Types admin view.
// CRUD for the task types lookup table backed by /api/task-types.

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { showConfirm } from '../ui/dialogs.js';
import { loadTaskTypes } from '../taskTypes.js';
import { render } from '../router.js';
import { populateFilters, populateFormSelects, renderLegend } from './list.js';

// =================== MODULE STATE ===================
let _ttList = [];          // local copy for display (may include inactive)
let _searchVal = '';
let _catFilter = '';
let _showInactive = false;

// =================== LOAD & RENDER ===================

export async function renderTaskTypes() {
  document.getElementById('monthLabel').textContent = 'Tipos de Tarea';
  const container = document.getElementById('viewTaskTypes');
  container.innerHTML = '<div class="tt-loading">Cargando...</div>';
  await _loadList();
  _renderView();
}

async function _loadList() {
  try {
    _ttList = await api('GET', '/api/task-types?incluirInactivos=true&conUso=true');
  } catch (e) {
    showToast('Error al cargar tipos de tarea: ' + e.message, 'error');
    _ttList = [];
  }
}

function _filtered() {
  return _ttList.filter(tt => {
    if (!_showInactive && !tt.activo) return false;
    if (_catFilter && tt.categoria !== _catFilter) return false;
    if (_searchVal && !tt.name.toLowerCase().includes(_searchVal.toLowerCase())) return false;
    return true;
  });
}

function _renderView() {
  const container = document.getElementById('viewTaskTypes');
  const list = _filtered();

  let h = `<div class="tt-toolbar">`;
  h += `<h2 class="tt-title">Tipos de Tarea</h2>`;
  h += `<div class="search-wrapper" style="max-width:240px">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    <input type="text" class="search-input" placeholder="Buscar tipo..." value="${_escAttr(_searchVal)}" oninput="onTtSearch(this.value)">
  </div>`;
  h += `<select class="filter-select" onchange="onTtCatFilter(this.value)">
    <option value="" ${!_catFilter?'selected':''}>Todas las categorías</option>
    <option value="fiscal" ${_catFilter==='fiscal'?'selected':''}>Fiscal</option>
    <option value="general" ${_catFilter==='general'?'selected':''}>General</option>
    <option value="operativa" ${_catFilter==='operativa'?'selected':''}>Operativa</option>
  </select>`;
  h += `<label class="tt-chk-label"><input type="checkbox" ${_showInactive?'checked':''} onchange="onTtShowInactive(this.checked)"> Mostrar inactivos</label>`;
  h += `<button class="btn btn-primary" onclick="openTtCreateModal()">+ Nuevo tipo</button>`;
  h += `<button class="btn" onclick="openTtMergeModal()" title="Fusionar dos tipos">Fusionar tipos</button>`;
  h += `</div>`;

  if (list.length === 0) {
    h += `<div class="list-empty-state"><div class="list-empty-icon">🏷</div><div class="list-empty-title">Sin resultados</div><div class="list-empty-hint">No hay tipos de tarea que coincidan con el filtro.</div></div>`;
  } else {
    h += `<div class="tt-table-wrap"><table class="tt-table">`;
    h += `<thead><tr>
      <th style="width:32px">Color</th>
      <th>Nombre</th>
      <th>Categoría</th>
      <th>Tiene Vto.</th>
      <th title="Clientes que usan este tipo"># Clientes</th>
      <th title="Tareas que usan este tipo"># Tareas</th>
      <th>Estado</th>
      <th>Acciones</th>
    </tr></thead><tbody>`;

    list.forEach(tt => {
      const catLabel = { fiscal: 'Fiscal', general: 'General', operativa: 'Operativa' }[tt.categoria] || tt.categoria;
      const id = tt.id;
      h += `<tr class="${tt.activo ? '' : 'tt-row-inactive'}">`;
      h += `<td><span class="tt-swatch" style="background:${_escAttr(tt.color)}" title="${_escAttr(tt.color)}"></span></td>`;
      h += `<td class="tt-name-cell"><strong>${_esc(tt.name)}</strong>${tt.icon ? ` <span class="tt-icon">${_esc(tt.icon)}</span>` : ''}${tt.descripcion ? `<div class="tt-descripcion">${_esc(tt.descripcion)}</div>` : ''}</td>`;
      h += `<td><span class="tt-cat-badge tt-cat-${tt.categoria}">${catLabel}</span></td>`;
      h += `<td style="text-align:center">${tt.tieneVencimiento ? '<span class="tt-check">&#10003;</span>' : '<span class="tt-dash">&ndash;</span>'}</td>`;
      h += `<td style="text-align:center">${tt.usageClientes ?? '–'}</td>`;
      h += `<td style="text-align:center">${tt.usageTasks ?? '–'}</td>`;
      h += `<td>${tt.activo ? '<span class="tt-badge-activo">Activo</span>' : '<span class="tt-badge-inactivo">Inactivo</span>'}</td>`;
      h += `<td><div class="tt-actions">`;
      h += `<button class="tt-btn" title="Editar" onclick="openTtEditModal('${id}')">&#9998;</button>`;
      h += `<button class="tt-btn" title="Renombrar con cascada" onclick="openTtRenameModal('${id}')">&#9997;</button>`;
      h += `<button class="tt-btn" title="${tt.activo ? 'Desactivar' : 'Activar'}" onclick="toggleTtActivo('${id}',${!tt.activo})">${tt.activo ? '&#9632;' : '&#9654;'}</button>`;
      h += `<button class="tt-btn tt-btn-danger" title="Eliminar" onclick="deleteTt('${id}')">&#128465;</button>`;
      h += `</div></td>`;
      h += `</tr>`;
    });

    h += `</tbody></table></div>`;
  }

  // ---- Create/Edit Modal ----
  h += _buildEditModalHtml();
  // ---- Rename Modal ----
  h += _buildRenameModalHtml();
  // ---- Merge Modal ----
  h += _buildMergeModalHtml();

  container.innerHTML = h;
}

// =================== HTML HELPERS ===================

function _esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function _escAttr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function _buildEditModalHtml() {
  return `
  <div class="tt-modal-overlay" id="ttEditOverlay" onclick="if(event.target===this)closeTtEditModal()">
    <div class="tt-modal">
      <h2 id="ttEditTitle">Nuevo Tipo de Tarea <button class="modal-close" onclick="closeTtEditModal()">&#x2715;</button></h2>
      <div class="tt-modal-body">
        <div class="form-group">
          <label>Nombre <span class="tt-required">*</span></label>
          <input type="text" id="ttfName" placeholder="Ej: IVA, Liquidación de sueldos...">
        </div>
        <div class="form-group">
          <label>Color <span class="tt-required">*</span></label>
          <div class="tt-color-row">
            <input type="color" id="ttfColorPicker" value="#64748b" oninput="document.getElementById('ttfColorText').value=this.value">
            <input type="text" id="ttfColorText" placeholder="#64748b" maxlength="7"
              oninput="if(/^#[0-9a-fA-F]{6}$/.test(this.value))document.getElementById('ttfColorPicker').value=this.value">
          </div>
        </div>
        <div class="form-group">
          <label>Icono <span class="tt-hint">(emoji opcional)</span></label>
          <input type="text" id="ttfIcon" placeholder="Ej: 📋" maxlength="8">
        </div>
        <div class="form-group">
          <label>Descripción <span class="tt-hint">(opcional)</span></label>
          <textarea id="ttfDescripcion" rows="2" placeholder="Descripción breve del tipo de tarea..."></textarea>
        </div>
        <div class="form-group">
          <label>Categoría <span class="tt-required">*</span></label>
          <select id="ttfCategoria">
            <option value="fiscal">Fiscal</option>
            <option value="general">General</option>
            <option value="operativa">Operativa</option>
          </select>
        </div>
        <div class="form-group tt-checkbox-group">
          <label><input type="checkbox" id="ttfTieneVto"> Tiene vencimiento (aparece en tabla de Vtos.)</label>
        </div>
        <div class="form-group tt-checkbox-group">
          <label><input type="checkbox" id="ttfActivo" checked> Activo</label>
        </div>
        <div class="form-group">
          <label>Orden <span class="tt-hint">(numérico, menor = primero)</span></label>
          <input type="number" id="ttfOrden" min="0" placeholder="0">
        </div>
        <div class="tt-field-error" id="ttEditError" style="display:none"></div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeTtEditModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveTtEdit()" id="ttEditSaveBtn">Guardar</button>
      </div>
    </div>
  </div>`;
}

function _buildRenameModalHtml() {
  return `
  <div class="tt-modal-overlay" id="ttRenameOverlay" onclick="if(event.target===this)closeTtRenameModal()">
    <div class="tt-modal tt-modal-sm">
      <h2 id="ttRenameTitle">Renombrar tipo <button class="modal-close" onclick="closeTtRenameModal()">&#x2715;</button></h2>
      <div class="tt-modal-body">
        <p class="tt-rename-hint">Renombrar actualiza <strong>todas las tareas y clientes</strong> que usen este tipo.</p>
        <div class="form-group">
          <label>Nuevo nombre <span class="tt-required">*</span></label>
          <input type="text" id="ttfNuevoNombre" placeholder="Nuevo nombre...">
        </div>
        <div class="tt-field-error" id="ttRenameError" style="display:none"></div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeTtRenameModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveTtRename()" id="ttRenameSaveBtn">Renombrar</button>
      </div>
    </div>
  </div>`;
}

function _buildMergeModalHtml() {
  const activeTypes = _ttList.filter(tt => tt.activo);
  const opts = activeTypes.map(tt =>
    `<option value="${_escAttr(tt.id)}">${_esc(tt.name)}</option>`
  ).join('');
  return `
  <div class="tt-modal-overlay" id="ttMergeOverlay" onclick="if(event.target===this)closeTtMergeModal()">
    <div class="tt-modal tt-modal-sm">
      <h2>Fusionar tipos de tarea <button class="modal-close" onclick="closeTtMergeModal()">&#x2715;</button></h2>
      <div class="tt-modal-body">
        <div class="tt-merge-warning">
          <strong>Atención:</strong> El tipo origen será eliminado permanentemente.
          Las tareas y clientes pasarán al tipo destino.
        </div>
        <div class="form-group">
          <label>Tipo origen (se elimina)</label>
          <select id="ttfMergeOrigen">${opts}</select>
        </div>
        <div class="form-group">
          <label>Tipo destino (se conserva)</label>
          <select id="ttfMergeDestino">${opts}</select>
        </div>
        <div class="tt-merge-usage" id="ttMergeUsageInfo"></div>
        <div class="tt-field-error" id="ttMergeError" style="display:none"></div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeTtMergeModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="saveTtMerge()" id="ttMergeSaveBtn">Fusionar</button>
      </div>
    </div>
  </div>`;
}

// =================== TOOLBAR HANDLERS ===================

export function onTtSearch(val) {
  _searchVal = val;
  _renderView();
}

export function onTtCatFilter(val) {
  _catFilter = val;
  _renderView();
}

export function onTtShowInactive(checked) {
  _showInactive = checked;
  _renderView();
}

// =================== EDIT MODAL ===================

let _editingTtId = null;

export function openTtCreateModal() {
  _editingTtId = null;
  document.getElementById('ttEditTitle').innerHTML = 'Nuevo Tipo de Tarea <button class="modal-close" onclick="closeTtEditModal()">&#x2715;</button>';
  document.getElementById('ttfName').value = '';
  document.getElementById('ttfColorPicker').value = '#64748b';
  document.getElementById('ttfColorText').value = '#64748b';
  document.getElementById('ttfIcon').value = '';
  document.getElementById('ttfDescripcion').value = '';
  document.getElementById('ttfCategoria').value = 'general';
  document.getElementById('ttfTieneVto').checked = false;
  document.getElementById('ttfActivo').checked = true;
  document.getElementById('ttfOrden').value = '';
  _clearTtEditError();
  document.getElementById('ttEditOverlay').classList.add('active');
  document.getElementById('ttfName').focus();
}

export function openTtEditModal(id) {
  const tt = _ttList.find(x => x.id === id);
  if (!tt) return;
  _editingTtId = id;
  document.getElementById('ttEditTitle').innerHTML = 'Editar Tipo de Tarea <button class="modal-close" onclick="closeTtEditModal()">&#x2715;</button>';
  document.getElementById('ttfName').value = tt.name;
  const color = tt.color || '#64748b';
  document.getElementById('ttfColorPicker').value = color;
  document.getElementById('ttfColorText').value = color;
  document.getElementById('ttfIcon').value = tt.icon || '';
  document.getElementById('ttfDescripcion').value = tt.descripcion || '';
  document.getElementById('ttfCategoria').value = tt.categoria || 'general';
  document.getElementById('ttfTieneVto').checked = !!tt.tieneVencimiento;
  document.getElementById('ttfActivo').checked = !!tt.activo;
  document.getElementById('ttfOrden').value = tt.orden != null ? tt.orden : '';
  _clearTtEditError();
  document.getElementById('ttEditOverlay').classList.add('active');
  document.getElementById('ttfName').focus();
}

export function closeTtEditModal() {
  document.getElementById('ttEditOverlay').classList.remove('active');
  _editingTtId = null;
}

export async function saveTtEdit() {
  const name = document.getElementById('ttfName').value.trim();
  if (!name) { _showTtEditError('El nombre es obligatorio.'); return; }

  let color = document.getElementById('ttfColorText').value.trim();
  if (!color) color = document.getElementById('ttfColorPicker').value;
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) { _showTtEditError('El color debe ser un hex válido (ej: #3b82f6).'); return; }

  const body = {
    name,
    color,
    icon: document.getElementById('ttfIcon').value.trim() || null,
    descripcion: document.getElementById('ttfDescripcion').value.trim() || null,
    categoria: document.getElementById('ttfCategoria').value,
    tieneVencimiento: document.getElementById('ttfTieneVto').checked,
    activo: document.getElementById('ttfActivo').checked,
  };
  const ordenVal = document.getElementById('ttfOrden').value;
  if (ordenVal !== '') body.orden = parseInt(ordenVal, 10);

  const btn = document.getElementById('ttEditSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    if (_editingTtId) {
      const existing = _ttList.find(x => x.id === _editingTtId);
      const nameChanged = existing && existing.name !== name;
      const result = await api('PUT', `/api/task-types/${_editingTtId}`, body);

      if (nameChanged && result._cascade) {
        const { tasksActualizadas, clientesActualizados } = result._cascade;
        showToast(
          `Tipo actualizado. Renombre en cascada: ${tasksActualizadas} tarea${tasksActualizadas !== 1 ? 's' : ''} y ${clientesActualizados} cliente${clientesActualizados !== 1 ? 's' : ''} actualizados.`,
          'success'
        );
        // Reload main data as tasks/clientes changed
        state.tasks = await api('GET', '/api/tasks');
        state.clientes = await api('GET', '/api/clientes');
        populateFilters();
        populateFormSelects();
        renderLegend();
        render();
      } else {
        showToast('Tipo actualizado', 'success');
      }
    } else {
      await api('POST', '/api/task-types', body);
      showToast('Tipo creado', 'success');
    }

    closeTtEditModal();
    await _reloadAndRefresh();
  } catch (e) {
    _showTtEditError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}

function _showTtEditError(msg) {
  const el = document.getElementById('ttEditError');
  el.textContent = msg;
  el.style.display = '';
}

function _clearTtEditError() {
  const el = document.getElementById('ttEditError');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

// =================== RENAME MODAL ===================

let _renamingTtId = null;

export function openTtRenameModal(id) {
  const tt = _ttList.find(x => x.id === id);
  if (!tt) return;
  _renamingTtId = id;
  document.getElementById('ttRenameTitle').innerHTML = `Renombrar &ldquo;${_esc(tt.name)}&rdquo; <button class="modal-close" onclick="closeTtRenameModal()">&#x2715;</button>`;
  document.getElementById('ttfNuevoNombre').value = '';
  _clearTtRenameError();
  document.getElementById('ttRenameOverlay').classList.add('active');
  document.getElementById('ttfNuevoNombre').focus();
}

export function closeTtRenameModal() {
  document.getElementById('ttRenameOverlay').classList.remove('active');
  _renamingTtId = null;
}

export async function saveTtRename() {
  const nuevoNombre = document.getElementById('ttfNuevoNombre').value.trim();
  if (!nuevoNombre) { _showTtRenameError('El nuevo nombre es obligatorio.'); return; }

  const tt = _ttList.find(x => x.id === _renamingTtId);
  if (!tt) return;

  // Show usage before confirming
  let usageText = '';
  try {
    const usage = await api('GET', `/api/task-types/${_renamingTtId}/usage`);
    const clienteNombres = usage.clientes.slice(0, 5).map(c => c.nombre).join(', ');
    const extra = usage.clientes.length > 5 ? ` y ${usage.clientes.length - 5} más...` : '';
    usageText = `Se actualizarán <strong>${usage.tasks}</strong> tarea${usage.tasks !== 1 ? 's' : ''} y <strong>${usage.clientes.length}</strong> cliente${usage.clientes.length !== 1 ? 's' : ''}${usage.clientes.length > 0 ? `: ${clienteNombres}${extra}` : ''}.`;
  } catch (e) {
    usageText = '(no se pudo cargar el detalle de uso)';
  }

  const ok = await showConfirm(
    'Confirmar renombre',
    `¿Renombrar &ldquo;<strong>${_esc(tt.name)}</strong>&rdquo; a &ldquo;<strong>${_esc(nuevoNombre)}</strong>&rdquo;?<br><br>${usageText}`,
    { icon: '✍', confirmText: 'Renombrar', cancelText: 'Cancelar' }
  );
  if (!ok) return;

  const btn = document.getElementById('ttRenameSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Renombrando...';

  try {
    const result = await api('POST', `/api/task-types/${_renamingTtId}/rename`, { nuevoNombre });
    showToast(
      `Renombrado a "${result.nuevoNombre}". ${result.tasksActualizadas} tarea${result.tasksActualizadas !== 1 ? 's' : ''} y ${result.clientesActualizados} cliente${result.clientesActualizados !== 1 ? 's' : ''} actualizados.`,
      'success'
    );
    closeTtRenameModal();
    // Reload tasks + clientes since names changed
    state.tasks = await api('GET', '/api/tasks');
    state.clientes = await api('GET', '/api/clientes');
    populateFilters();
    populateFormSelects();
    renderLegend();
    render();
    await _reloadAndRefresh();
  } catch (e) {
    _showTtRenameError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Renombrar';
  }
}

function _showTtRenameError(msg) {
  const el = document.getElementById('ttRenameError');
  el.textContent = msg;
  el.style.display = '';
}

function _clearTtRenameError() {
  const el = document.getElementById('ttRenameError');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

// =================== MERGE MODAL ===================

export function openTtMergeModal() {
  const el = document.getElementById('ttMergeOverlay');
  if (!el) { showToast('Recargá la vista primero', 'error'); return; }
  document.getElementById('ttMergeUsageInfo').innerHTML = '';
  _clearTtMergeError();
  el.classList.add('active');
}

export function closeTtMergeModal() {
  const el = document.getElementById('ttMergeOverlay');
  if (el) el.classList.remove('active');
}

export async function saveTtMerge() {
  const origenId = document.getElementById('ttfMergeOrigen').value;
  const destinoId = document.getElementById('ttfMergeDestino').value;
  if (origenId === destinoId) { _showTtMergeError('El tipo origen y destino deben ser distintos.'); return; }

  const origen = _ttList.find(x => x.id === origenId);
  const destino = _ttList.find(x => x.id === destinoId);
  if (!origen || !destino) return;

  const ok = await showConfirm(
    'Confirmar fusión',
    `¿Fusionar &ldquo;<strong>${_esc(origen.name)}</strong>&rdquo; en &ldquo;<strong>${_esc(destino.name)}</strong>&rdquo;?<br><br>El tipo origen será <strong>eliminado permanentemente</strong>. Sus tareas y clientes pasarán al tipo destino.`,
    { icon: '&#128257;', confirmText: 'Fusionar', danger: true }
  );
  if (!ok) return;

  const btn = document.getElementById('ttMergeSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Fusionando...';

  try {
    const result = await api('POST', '/api/task-types/merge', { origenId, destinoId });
    showToast(
      `Fusión completada. "${result.origenEliminado}" → "${result.destinoNombre}". ${result.tasksActualizadas} tarea${result.tasksActualizadas !== 1 ? 's' : ''} y ${result.clientesActualizados} cliente${result.clientesActualizados !== 1 ? 's' : ''} actualizados.`,
      'success'
    );
    closeTtMergeModal();
    // Reload everything since tasks + clientes changed
    state.tasks = await api('GET', '/api/tasks');
    state.clientes = await api('GET', '/api/clientes');
    populateFilters();
    populateFormSelects();
    renderLegend();
    render();
    await _reloadAndRefresh();
  } catch (e) {
    _showTtMergeError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fusionar';
  }
}

function _showTtMergeError(msg) {
  const el = document.getElementById('ttMergeError');
  if (el) { el.textContent = msg; el.style.display = ''; }
}

function _clearTtMergeError() {
  const el = document.getElementById('ttMergeError');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

// =================== TOGGLE ACTIVO ===================

export async function toggleTtActivo(id, newActivo) {
  try {
    await api('PUT', `/api/task-types/${id}`, { activo: newActivo });
    const tt = _ttList.find(x => x.id === id);
    if (tt) tt.activo = newActivo;
    showToast(`Tipo ${newActivo ? 'activado' : 'desactivado'}`, 'success');
    await _reloadAndRefresh();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// =================== DELETE ===================

export async function deleteTt(id) {
  const tt = _ttList.find(x => x.id === id);
  if (!tt) return;

  // Try a soft delete first. Offer hard delete if usage is 0.
  let usageClientes = tt.usageClientes ?? 0;
  let usageTasks = tt.usageTasks ?? 0;

  // Refresh usage to be sure
  try {
    const usage = await api('GET', `/api/task-types/${id}/usage`);
    usageClientes = usage.clientes.length;
    usageTasks = usage.tasks;
  } catch (e) { /* use cached values */ }

  const hasUsage = usageClientes > 0 || usageTasks > 0;

  if (hasUsage) {
    const ok = await showConfirm(
      'Desactivar tipo',
      `El tipo &ldquo;<strong>${_esc(tt.name)}</strong>&rdquo; está en uso (${usageTasks} tarea${usageTasks !== 1 ? 's' : ''}, ${usageClientes} cliente${usageClientes !== 1 ? 's' : ''}). No se puede eliminar permanentemente. ¿Desactivarlo en su lugar?`,
      { icon: '🗑', confirmText: 'Desactivar', cancelText: 'Cancelar' }
    );
    if (!ok) return;
    try {
      await api('DELETE', `/api/task-types/${id}`);
      showToast(`Tipo "${tt.name}" desactivado`, 'success');
      await _reloadAndRefresh();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  } else {
    const ok = await showConfirm(
      'Eliminar tipo',
      `¿Eliminar permanentemente el tipo &ldquo;<strong>${_esc(tt.name)}</strong>&rdquo;? No tiene tareas ni clientes asignados.`,
      { icon: '🗑', confirmText: 'Eliminar', danger: true }
    );
    if (!ok) return;
    try {
      await api('DELETE', `/api/task-types/${id}?hard=true`);
      showToast(`Tipo "${tt.name}" eliminado`, 'success');
      await _reloadAndRefresh();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }
}

// =================== SHARED HELPERS ===================

async function _reloadAndRefresh() {
  // Reload local list
  await _loadList();
  // Invalidate global registry so all views use updated colors/names
  await loadTaskTypes({ force: true });
  // Re-render view
  _renderView();
}
