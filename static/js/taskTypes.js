// taskTypes.js — dynamic task type registry.
// Loads task types from the API and keeps state.taskTypes* in sync.
// Falls back to TASK_COLORS for non-admin users so all views keep working.
//
// TODO: if the backend ever exposes a public (non-admin) read endpoint for
// task types, remove the try/catch fallback and always use the API.

import { TASK_COLORS } from './constants.js';
import { state } from './state.js';
import { api } from './api.js';

const FALLBACK_COLOR = '#64748b';

// Build state registries from an array of TaskType objects.
function _buildRegistries(types) {
  state.taskTypes = types;
  state.taskTypesById = {};
  state.taskTypesByName = {};
  for (const tt of types) {
    if (tt.id) state.taskTypesById[tt.id] = tt;
    state.taskTypesByName[tt.name.toLowerCase()] = tt;
  }
}

// Build fallback registries from the hardcoded TASK_COLORS constant.
// Used when the API is unavailable (non-admin users or network error).
function _buildFallbackRegistries() {
  const fallbackTypes = Object.entries(TASK_COLORS).map(([name, color], i) => ({
    id: null,
    taskTypeId: i + 1,
    name,
    color,
    icon: null,
    descripcion: null,
    categoria: 'general',
    tieneVencimiento: [
      'Casas Particulares', 'VEP Monotributo', 'VEP Autonomos',
      'IIBB CM', 'IIBB ARBA', 'IIBB AGIP', 'IVA', 'Libro IVA Digital',
    ].includes(name),
    activo: true,
    orden: i,
    createdAt: null,
    updatedAt: null,
  }));
  _buildRegistries(fallbackTypes);
}

/**
 * Load task types from the API into state.
 * @param {object} opts
 * @param {boolean} opts.force — if true, always re-fetch even if already loaded
 */
export async function loadTaskTypes({ force = false } = {}) {
  // Skip if already populated and not forcing a refresh
  if (!force && state.taskTypes && state.taskTypes.length > 0) return;

  try {
    const types = await api('GET', '/api/task-types?incluirInactivos=true');
    _buildRegistries(types);
  } catch (e) {
    // Non-admins get a 403; network errors get a generic error.
    // Either way, fall back to the legacy hardcoded list so views still work.
    console.warn('taskTypes: could not load from API, falling back to TASK_COLORS:', e.message);
    if (state.taskTypes.length === 0) {
      _buildFallbackRegistries();
    }
  }
}

/**
 * Return the hex color for a task type name.
 * Tolerates case mismatches and unknown/deleted types by returning a safe fallback.
 */
export function getTaskColor(name) {
  if (!name) return FALLBACK_COLOR;
  const tt = state.taskTypesByName[name.toLowerCase()];
  if (tt) return tt.color;
  // Last resort: check legacy hardcoded map
  return TASK_COLORS[name] || FALLBACK_COLOR;
}

/**
 * Return active task types sorted by orden then name.
 */
export function getActiveTaskTypes() {
  return state.taskTypes.filter(tt => tt.activo);
}

/**
 * Return active task types that have tieneVencimiento === true.
 * Replaces the hardcoded VTO_TASK_TYPES list in views/vtos.js.
 */
export function getVtoTaskTypes() {
  return state.taskTypes.filter(tt => tt.activo && tt.tieneVencimiento);
}
