// Task export/import JSON.
// Extracted literally from legacy-inline.js.

import { state } from '../state.js';
import { api } from '../api.js';
import { formatDate } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';
import { loadAllData } from '../auth.js';
import { populateFilters, populateFormSelects } from '../views/list.js';
import { render } from '../router.js';

// =================== EXPORT / IMPORT ===================
export function exportJSON() {
  const data = { tasks: state.tasks, exportDate: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calendario-${formatDate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Datos exportados', 'success');
}

export async function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const tasks = data.tasks || data.tareas || (Array.isArray(data) ? data : []);
      if (!tasks.length) { showToast('No se encontraron tareas', 'error'); return; }

      // Upload tasks via API
      let imported = 0;
      for (const t of tasks) {
        try {
          await api('POST', '/api/tasks', {
            cliente: t.cliente,
            tarea: t.tarea,
            responsable: t.responsable,
            assignedTo: t.assignedTo || null,
            semana: t.semana,
            vencimiento: t.vencimiento,
          });
          imported++;
        } catch (err) { /* skip duplicates */ }
      }

      await loadAllData();
      populateFilters();
      populateFormSelects();
      render();
      showToast(`Importadas ${imported} tareas`, 'success');
    } catch (e) { showToast('Error al leer archivo', 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}
