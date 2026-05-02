// Backup & restore admin view.
// Accessible from the user dropdown (admin only).

import { api } from '../api.js';
import { showToast, removeToast } from '../ui/toast.js';
import { showConfirm } from '../ui/dialogs.js';

// =================== RENDER ===================

export async function renderBackup() {
  document.getElementById('monthLabel').textContent = 'Backup & Restauración';
  const container = document.getElementById('viewBackup');
  container.innerHTML = '<div class="bk-loading">Cargando...</div>';

  try {
    const [backups, settings] = await Promise.all([
      api('GET', '/api/admin/backup/list').catch(() => []),
      api('GET', '/api/admin/backup/settings'),
    ]);
    container.innerHTML = _buildHTML(backups, settings);
  } catch (e) {
    container.innerHTML = `<div class="bk-error">${e.message}</div>`;
  }
}

// =================== HTML BUILDER ===================

function _fmt(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function _fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

function _buildHTML(backups, settings) {
  const statusClass = settings.last_backup_status === 'success'
    ? 'bk-status-ok'
    : settings.last_backup_status === 'error'
      ? 'bk-status-error'
      : 'bk-status-none';

  const statusIcon = settings.last_backup_status === 'success' ? '✅'
    : settings.last_backup_status === 'error' ? '❌' : '—';

  const bucketVal = _esc(settings.gcs_bucket || '');
  const freq = settings.frequency || 'monthly';
  const ret = settings.retention_days || 90;

  const rows = backups.length === 0
    ? `<tr><td colspan="3" class="bk-empty-row">
        <div class="bk-empty-inner">🗄️<br>No hay backups todavía<br>
        <small>Hacé tu primer backup con el botón de arriba</small></div>
      </td></tr>`
    : backups.map(b => `
      <tr>
        <td>
          <div class="bk-date">${_fmtDate(b.created_at)}</div>
          <div class="bk-id-label">${_esc(b.id)}</div>
        </td>
        <td><span class="bk-size">${_fmt(b.size_bytes)}</span></td>
        <td class="bk-row-actions">
          <button class="btn bk-btn-restore" onclick="onBkRestore('${_esc(b.id)}')" title="Restaurar base de datos a este punto">
            ↩ Restaurar
          </button>
          <button class="btn btn-danger bk-btn-delete" onclick="onBkDelete('${_esc(b.id)}')" title="Eliminar este backup">
            🗑
          </button>
        </td>
      </tr>`).join('');

  return `
<div class="bk-container">
  <div class="bk-page-header">
    <div>
      <h2 class="bk-title">🗄️ Backup &amp; Restauración</h2>
      <p class="bk-subtitle">Administrá los backups de la base de datos almacenados en Google Cloud Storage</p>
    </div>
  </div>

  <div class="bk-grid">

    <!-- ===== CONFIG CARD ===== -->
    <div class="bk-card">
      <h3 class="bk-card-title">⚙️ Configuración</h3>

      <div class="bk-last-status ${statusClass}">
        <span class="bk-status-icon">${statusIcon}</span>
        <div>
          <div class="bk-status-label">Último backup</div>
          <div class="bk-status-detail">${_fmtDate(settings.last_backup_at)} · ${_fmt(settings.last_backup_size)}</div>
        </div>
      </div>

      <div class="form-group">
        <label>Bucket de GCS</label>
        <input type="text" id="bkBucket" class="bk-input" value="${bucketVal}" placeholder="nombre-del-bucket">
      </div>

      <div class="form-group">
        <label>Frecuencia de backup automático</label>
        <select id="bkFrequency" class="filter-select" style="width:100%">
          <option value="manual"   ${freq==='manual'   ?'selected':''}>Manual (solo desde acá)</option>
          <option value="daily"    ${freq==='daily'    ?'selected':''}>Diario</option>
          <option value="weekly"   ${freq==='weekly'   ?'selected':''}>Semanal</option>
          <option value="monthly"  ${freq==='monthly'  ?'selected':''}>Mensual</option>
        </select>
        <div class="bk-hint">
          Para backups automáticos, configurá un <strong>Cloud Scheduler</strong> job que llame a:<br>
          <code>POST /api/admin/backup/trigger</code><br>
          con el header <code>X-Backup-Secret: &lt;tu secreto&gt;</code><br>
          (definí el secreto en la env var <code>BACKUP_SECRET</code>)
        </div>
      </div>

      <div class="form-group">
        <label>Retención de backups</label>
        <select id="bkRetention" class="filter-select" style="width:100%">
          <option value="30"  ${ret===30  ?'selected':''}>30 días</option>
          <option value="60"  ${ret===60  ?'selected':''}>60 días</option>
          <option value="90"  ${ret===90  ?'selected':''}>90 días</option>
          <option value="180" ${ret===180 ?'selected':''}>180 días</option>
          <option value="365" ${ret===365 ?'selected':''}>1 año</option>
        </select>
        <div class="bk-hint">Los backups más antiguos que este período se eliminan automáticamente al crear uno nuevo.</div>
      </div>

      <div class="bk-card-actions">
        <button class="btn btn-primary" onclick="onBkSave()">💾 Guardar configuración</button>
        <button class="btn bk-trigger-btn" id="bkTriggerBtn" onclick="onBkTrigger()">
          ↺ Hacer backup ahora
        </button>
      </div>
    </div>

    <!-- ===== LIST CARD ===== -->
    <div class="bk-card bk-list-card">
      <div class="bk-list-header">
        <h3 class="bk-card-title" style="margin:0">📋 Backups disponibles</h3>
        <span class="bk-count">${backups.length}</span>
      </div>

      <div class="bk-table-wrap">
        <table class="bk-table">
          <thead>
            <tr>
              <th>Fecha / ID</th>
              <th>Tamaño</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>

  </div>
</div>`;
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// =================== ACTIONS (window-scope for inline onclick) ===================

window.onBkSave = async function () {
  const bucket = document.getElementById('bkBucket').value.trim();
  const frequency = document.getElementById('bkFrequency').value;
  const retention_days = parseInt(document.getElementById('bkRetention').value, 10);
  if (!bucket) { showToast('El nombre del bucket es obligatorio', 'error'); return; }
  try {
    await api('PUT', '/api/admin/backup/settings', { gcs_bucket: bucket, frequency, retention_days, enabled: true });
    showToast('Configuración guardada', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
};

window.onBkTrigger = async function () {
  const btn = document.getElementById('bkTriggerBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Creando backup...'; }
  const t = showToast('Creando backup...', 'loading', 0);
  try {
    const result = await api('POST', '/api/admin/backup/trigger');
    removeToast(t);
    showToast(`✅ Backup creado · ${_fmt(result.size_bytes)}`, 'success', 5000);
    await renderBackup();
  } catch (e) {
    removeToast(t);
    showToast('Error al crear backup: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '↺ Hacer backup ahora'; }
  }
};

window.onBkRestore = async function (backupId) {
  const ok = await showConfirm(
    'Restaurar base de datos',
    `<strong>⚠️ Esta acción reemplazará todos los datos actuales con el backup seleccionado.</strong><br><br>
     Backup: <code>${_esc(backupId)}</code><br><br>
     ¿Estás seguro? Esta acción no se puede deshacer.`,
    { icon: '⚠️', confirmText: 'Sí, restaurar', cancelText: 'Cancelar', danger: true }
  );
  if (!ok) return;

  const t = showToast('Restaurando base de datos...', 'loading', 0);
  try {
    await api('POST', `/api/admin/backup/${encodeURIComponent(backupId)}/restore`);
    removeToast(t);
    showToast('Base de datos restaurada correctamente', 'success', 5000);
    await renderBackup();
  } catch (e) {
    removeToast(t);
    showToast('Error al restaurar: ' + e.message, 'error');
  }
};

window.onBkDelete = async function (backupId) {
  const ok = await showConfirm(
    'Eliminar backup',
    `¿Eliminar el backup <code>${_esc(backupId)}</code>? Esta acción no se puede deshacer.`,
    { icon: '🗑️', confirmText: 'Eliminar', cancelText: 'Cancelar', danger: true }
  );
  if (!ok) return;
  try {
    await api('DELETE', `/api/admin/backup/${encodeURIComponent(backupId)}`);
    showToast('Backup eliminado', 'success');
    await renderBackup();
  } catch (e) {
    showToast('Error al eliminar: ' + e.message, 'error');
  }
};
