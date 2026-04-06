// Custom dialog (confirm + prompt). Extracted literally from legacy-inline.js.

let _dialogResolve = null;

export function showConfirm(title, message, { icon = '⚠️', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
  return new Promise(resolve => {
    _dialogResolve = resolve;
    document.getElementById('dialogIcon').textContent = icon;
    document.getElementById('dialogTitle').textContent = title;
    document.getElementById('dialogMessage').innerHTML = message;
    document.getElementById('dialogInput').style.display = 'none';
    document.getElementById('dialogActions').innerHTML =
      `<button class="btn" onclick="closeDialog(false)">${cancelText}</button>` +
      `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" onclick="closeDialog(true)">${confirmText}</button>`;
    document.getElementById('dialogOverlay').classList.add('active');
    // Focus confirm button
    document.getElementById('dialogActions').querySelector('.btn-primary,.btn-danger')?.focus();
  });
}

export function showPromptDialog(title, message, { icon = '✏️', placeholder = '', defaultValue = '', confirmText = 'Guardar', cancelText = 'Cancelar' } = {}) {
  return new Promise(resolve => {
    _dialogResolve = resolve;
    document.getElementById('dialogIcon').textContent = icon;
    document.getElementById('dialogTitle').textContent = title;
    document.getElementById('dialogMessage').innerHTML = message;
    const input = document.getElementById('dialogInput');
    input.style.display = '';
    input.placeholder = placeholder;
    input.value = defaultValue;
    document.getElementById('dialogActions').innerHTML =
      `<button class="btn" onclick="closeDialog(null)">${cancelText}</button>` +
      `<button class="btn btn-primary" onclick="closeDialog(document.getElementById('dialogInput').value)">${confirmText}</button>`;
    document.getElementById('dialogOverlay').classList.add('active');
    setTimeout(() => input.focus(), 100);
  });
}

export function closeDialog(value) {
  document.getElementById('dialogOverlay').classList.remove('active');
  if (_dialogResolve) { _dialogResolve(value); _dialogResolve = null; }
}
