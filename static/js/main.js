// main.js — bootstrap del frontend.
// Importa el bridge (que a su vez importa todos los módulos y los expone
// en window para el HTML legacy con onclick=). Después registra los
// listeners globales y arranca el flujo de autenticación.

import './legacy-bridge.js';

import { initFirebase, closeUserMenu } from './auth.js';
import { closeModal } from './tasks/taskModal.js';
import { closeHistory } from './tasks/history.js';
import { closeClientDetail, closeClientEdit, closeBillingDetail } from './views/clientes.js';
import { closeDialog } from './ui/dialogs.js';
import { addTask } from './tasks/taskModal.js';
import { changeMonth } from './views/month.js';
import { closeSummaryPanel } from './views/summary.js';

// =================== KEYBOARD SHORTCUTS ===================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeClientDetail(); closeBillingDetail(); closeClientEdit(); closeHistory(); closeDialog(false); }
  if (e.key === 'Enter' && document.getElementById('dialogOverlay').classList.contains('active')) {
    e.preventDefault();
    const confirmBtn = document.getElementById('dialogActions').querySelector('.btn-primary,.btn-danger');
    if (confirmBtn) confirmBtn.click();
    return;
  }
  if (e.key === 'n' && e.ctrlKey) { e.preventDefault(); addTask(); }
  if (!document.querySelector('.modal-overlay.active')) {
    if (e.key === 'ArrowLeft') changeMonth(-1);
    if (e.key === 'ArrowRight') changeMonth(1);
  }
});

// =================== USER MENU OUTSIDE CLICK ===================
document.addEventListener('click', e => {
  if (!e.target.closest('.user-menu')) closeUserMenu();
});

// =================== SUMMARY PANEL OUTSIDE CLICK ===================
document.addEventListener('click', e => {
  // Replicates legacy behaviour: close if click is not inside the FAB wrapper.
  if (!e.target.closest('.summary-fab')) {
    closeSummaryPanel();
  }
});

// =================== INIT ===================
initFirebase();
