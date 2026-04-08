// Firebase auth + user menu + profile setup/edit.
// Extracted literally from legacy-inline.js.

import { FIREBASE_CONFIG } from './constants.js';
import { state, authTokenRef } from './state.js';
import { api } from './api.js';
import { showToast, removeToast } from './ui/toast.js';
import { showPromptDialog } from './ui/dialogs.js';
import { hideLoading, showSetup, showLogin, showLoginError, showApp, render } from './router.js';
import { populateFilters, populateFormSelects, renderLegend } from './views/list.js';
import { startDataRefresh, stopDataRefresh } from './dataRefresh.js';

export async function loadAllData() {
  const loadingToast = showToast('Cargando datos...', 'loading', 0);
  try {
    const [tasks, users, clientes] = await Promise.all([
      api('GET', '/api/tasks'),
      api('GET', '/api/users'),
      api('GET', '/api/clientes'),
    ]);
    state.tasks = tasks;
    state.users = users;
    state.clientes = clientes;

    // Load vencimientos list
    try {
      const vtosList = await api('GET', '/api/vencimientos');
      state.vencimientos = {};
      vtosList.forEach(v => { state.vencimientos[v.periodo] = v; });
    } catch(e) { console.warn('Vtos load:', e); }

    if (state.currentUser) {
      state.schedule = await api('GET', '/api/schedule');
      // Load unread comment counts and mentions
      try {
        state.unreadCounts = await api('GET', '/api/unread-counts');
      } catch(e) { console.warn('Unread counts load:', e); state.unreadCounts = {}; }
      try {
        state.mentions = await api('GET', '/api/mentions');
      } catch(e) { console.warn('Mentions load:', e); state.mentions = []; }
    }
    removeToast(loadingToast);
  } catch (e) {
    removeToast(loadingToast);
    console.error('Error loading data:', e);
    showToast('Error cargando datos: ' + e.message, 'error');
  }
}

// =================== FIREBASE AUTH ===================
export function initFirebase() {
  const isConfigured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';

  if (!isConfigured) {
    // Check if backend is in dev mode (no Firebase SA)
    checkDevMode();
    return;
  }

  firebase.initializeApp(FIREBASE_CONFIG);
  firebase.auth().onAuthStateChanged(handleAuthState);
  hideLoading();
}

export async function checkDevMode() {
  try {
    const me = await api('GET', '/api/me');
    // If we get here, backend is in dev mode (no auth required)
    state.devMode = true;
    state.currentUser = me;
    hideLoading();
    await loadAllData();
    showApp();
    startDataRefresh();
  } catch (e) {
    // Backend requires auth, show setup screen
    hideLoading();
    showSetup();
  }
}

export async function handleAuthState(firebaseUser) {
  if (firebaseUser) {
    state.firebaseUser = firebaseUser;
    authTokenRef.value = await firebaseUser.getIdToken();

    try {
      state.currentUser = await api('GET', '/api/me');

      if (!state.currentUser.responsableName) {
        await loadAllData();
        showProfileSetup();
        startDataRefresh();
      } else {
        await loadAllData();
        showApp();
        startDataRefresh();
      }
    } catch (e) {
      showLoginError('Error al iniciar sesión: ' + e.message);
      showLogin();
    }
  } else {
    stopDataRefresh();
    state.firebaseUser = null;
    state.currentUser = null;
    authTokenRef.value = null;
    showLogin();
  }
}

export function login() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(e => {
    showLoginError(e.message);
  });
}

export function logout() {
  closeUserMenu();
  stopDataRefresh();
  if (state.devMode) {
    showSetup();
    document.getElementById('app').style.display = 'none';
    return;
  }
  firebase.auth().signOut();
}

export function showProfileSetup() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // Populate responsable name suggestions from existing tasks
  const names = [...new Set(state.tasks.map(t => t.responsable))].sort();
  const dl = document.getElementById('responsableOptions');
  dl.innerHTML = names.map(n => `<option value="${n}">`).join('');

  document.getElementById('profileSetup').classList.add('active');
  populateFilters();
  populateFormSelects();
  renderLegend();
  updateUserMenu();
  render();
}

export async function saveProfile() {
  const name = document.getElementById('setupResponsable').value.trim();
  if (!name) { showToast('Ingresá un nombre', 'error'); return; }

  try {
    state.currentUser = await api('PUT', `/api/users/${encodeURIComponent(state.currentUser.email)}`, {
      responsableName: name,
    });
    document.getElementById('profileSetup').classList.remove('active');
    showToast('Perfil guardado', 'success');
    updateUserMenu();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

export function skipProfile() {
  document.getElementById('profileSetup').classList.remove('active');
}

export async function showProfileEdit() {
  closeUserMenu();
  const name = await showPromptDialog('Editar perfil', 'Ingresa tu nombre de responsable', {
    icon: '⚙️', placeholder: 'Ej: MECHI, PERSONA...', defaultValue: state.currentUser?.responsableName || ''
  });
  if (name !== null && name.trim()) {
    try {
      state.currentUser = await api('PUT', `/api/users/${encodeURIComponent(state.currentUser.email)}`, {
        responsableName: name.trim(),
      });
      updateUserMenu();
      showToast('Perfil actualizado', 'success');
      render();
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
  }
}

// =================== USER MENU ===================
export function updateUserMenu() {
  const u = state.currentUser;
  if (!u) return;

  document.getElementById('userName').textContent = u.displayName || u.email.split('@')[0];
  if (u.photoURL) {
    document.getElementById('userAvatar').src = u.photoURL;
  }
  document.getElementById('udName').textContent = u.displayName || '';
  document.getElementById('udEmail').textContent = u.email;
  document.getElementById('udRole').textContent = u.role === 'admin' ? '🛡️ Administrador' : '👤 Usuario';

  // Show admin features
  const isAdmin = u.role === 'admin';
  document.getElementById('btnNewTask').style.display = isAdmin ? '' : 'none';
  document.getElementById('btnUsersView').style.display = isAdmin ? '' : 'none';
  document.getElementById('btnUsersTab').style.display = isAdmin ? '' : 'none';
  document.getElementById('btnVtosTab').style.display = isAdmin ? '' : 'none';
  document.getElementById('btnAssignTab').style.display = isAdmin ? '' : 'none';
  document.getElementById('btnReviewTab').style.display = isAdmin ? '' : 'none';
  document.getElementById('btnFiscalTab').style.display = isAdmin ? '' : 'none';
}

export function toggleUserMenu() {
  document.getElementById('userDropdown').classList.toggle('open');
}
export function closeUserMenu() {
  document.getElementById('userDropdown').classList.remove('open');
}
