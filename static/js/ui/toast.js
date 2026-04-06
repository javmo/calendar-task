// Toast notifications. Extracted literally from legacy-inline.js.

const TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️', loading: '' };

export function showToast(msg, type = 'success', duration = 3000) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icon = type === 'loading' ? '<span class="toast-spinner"></span>' : TOAST_ICONS[type] || '';
  t.innerHTML = `${icon} ${msg}`;
  c.appendChild(t);
  if (duration > 0) {
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, duration);
  }
  return t;
}

export function removeToast(el) {
  if (el && el.parentNode) { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }
}
