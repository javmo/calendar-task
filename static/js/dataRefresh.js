// dataRefresh.js — Keeps the app data in sync with the server.
//
// - Polls every 60s for fresh tasks, unread counts, and mentions.
// - Re-fetches immediately when the browser tab becomes visible again
//   (if it was hidden for more than 30 seconds).
// - Exposes refreshData() for on-demand use by other modules.

import { state } from './state.js';
import { api } from './api.js';
import { render } from './router.js';
import { populateFilters, populateFormSelects } from './views/list.js';

const POLL_INTERVAL = 60_000;   // 60 seconds
const VISIBILITY_THRESHOLD = 30_000; // 30 seconds

let _pollTimer = null;
let _hiddenAt = null;
let _refreshing = false;

/**
 * Silently refresh core data from the server and re-render.
 * Skips if a refresh is already in progress.
 */
export async function refreshData() {
  if (_refreshing || !state.currentUser) return;
  _refreshing = true;
  try {
    const [tasks, unreadCounts, mentions] = await Promise.all([
      api('GET', '/api/tasks'),
      api('GET', '/api/unread-counts').catch(() => state.unreadCounts),
      api('GET', '/api/mentions').catch(() => state.mentions),
    ]);

    state.tasks = tasks;
    state.unreadCounts = unreadCounts;
    state.mentions = mentions;

    populateFilters();
    populateFormSelects();
    render();
  } catch (e) {
    // Silent fail — don't bother the user with transient network errors
    console.warn('Background refresh failed:', e.message);
  } finally {
    _refreshing = false;
  }
}

function _onVisibilityChange() {
  if (document.hidden) {
    _hiddenAt = Date.now();
  } else {
    // Tab became visible again
    if (_hiddenAt && Date.now() - _hiddenAt > VISIBILITY_THRESHOLD) {
      refreshData();
    }
    _hiddenAt = null;
    // Reset the poll timer so the next poll is a full interval from now
    _restartPollTimer();
  }
}

function _restartPollTimer() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(refreshData, POLL_INTERVAL);
}

/**
 * Start the background refresh system.
 * Call once after the user is authenticated and initial data is loaded.
 */
export function startDataRefresh() {
  _restartPollTimer();
  document.addEventListener('visibilitychange', _onVisibilityChange);
}

/**
 * Stop the background refresh system (e.g. on logout).
 */
export function stopDataRefresh() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  document.removeEventListener('visibilitychange', _onVisibilityChange);
  _hiddenAt = null;
}
