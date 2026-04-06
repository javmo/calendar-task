// @mention autocomplete. Extracted literally from legacy-inline.js.
// Handles two independent mention UIs:
//   - history modal (mentionDropdown + historyCommentInput)
//   - task detail panel (tdpMentionDropdown + tdpCommentInput)
// Both reuse the same set of module-level state variables (as in the monolith).

import { state } from '../state.js';
import { escapeHtml } from '../utils/format.js';
import { addComment } from '../tasks/history.js';
import { addTdpComment } from '../tasks/taskDetail.js';

// ---- Shared mention state ----
export let mentionActive = false;
export let mentionQuery = '';
export let mentionStart = -1;
export let mentionSelectedIdx = 0;

// ========== HISTORY MODAL MENTIONS ==========
export function onCommentInput(input) {
  const val = input.value;
  const cursor = input.selectionStart;

  // Find @ before cursor
  const before = val.substring(0, cursor);
  const atIdx = before.lastIndexOf('@');

  if (atIdx >= 0 && (atIdx === 0 || before[atIdx - 1] === ' ')) {
    const query = before.substring(atIdx + 1);
    if (!query.includes(' ') || query.startsWith('"')) {
      mentionActive = true;
      mentionStart = atIdx;
      mentionQuery = query.replace(/^"/, '');
      mentionSelectedIdx = 0;
      showMentionDropdown(mentionQuery);
      return;
    }
  }
  closeMentionDropdown();
}

export function showMentionDropdown(query) {
  const dropdown = document.getElementById('mentionDropdown');
  const q = query.toLowerCase();
  const matches = state.users.filter(u => {
    if (!u.responsableName && !u.displayName) return false;
    const name = (u.responsableName || u.displayName || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  }).slice(0, 8);

  if (matches.length === 0) { closeMentionDropdown(); return; }

  let h = '';
  matches.forEach((u, i) => {
    const name = u.responsableName || u.displayName || u.email;
    const role = u.role === 'admin' ? '👑' : '👤';
    h += `<div class="mention-option${i === mentionSelectedIdx ? ' active' : ''}" onmousedown="insertMention('${escapeHtml(name)}')">`;
    h += `<span>${role}</span>`;
    h += `<span class="mo-name">${name}</span>`;
    h += `<span class="mo-email">${u.email}</span>`;
    h += `</div>`;
  });
  dropdown.innerHTML = h;
  dropdown.classList.add('visible');
}

export function closeMentionDropdown() {
  mentionActive = false;
  const dropdown = document.getElementById('mentionDropdown');
  if (dropdown) dropdown.classList.remove('visible');
}

export function insertMention(name) {
  const input = document.getElementById('historyCommentInput');
  const val = input.value;
  const needsQuotes = name.includes(' ');
  const mentionText = needsQuotes ? `@"${name}" ` : `@${name} `;
  input.value = val.substring(0, mentionStart) + mentionText + val.substring(input.selectionStart);
  input.focus();
  const newCursor = mentionStart + mentionText.length;
  input.setSelectionRange(newCursor, newCursor);
  closeMentionDropdown();
}

export function onCommentKeydown(e) {
  if (mentionActive) {
    const dropdown = document.getElementById('mentionDropdown');
    const options = dropdown.querySelectorAll('.mention-option');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionSelectedIdx = Math.min(mentionSelectedIdx + 1, options.length - 1);
      options.forEach((o, i) => o.classList.toggle('active', i === mentionSelectedIdx));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionSelectedIdx = Math.max(mentionSelectedIdx - 1, 0);
      options.forEach((o, i) => o.classList.toggle('active', i === mentionSelectedIdx));
      return;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && options.length > 0) {
      e.preventDefault();
      const active = options[mentionSelectedIdx];
      if (active) active.onmousedown();
      return;
    }
    if (e.key === 'Escape') {
      closeMentionDropdown();
      return;
    }
  }
  if (e.key === 'Enter' && !mentionActive) addComment();
}

// ========== TASK DETAIL PANEL MENTIONS (tdp) ==========
export function onTdpCommentKeydown(e) {
  // Reuse mention logic with tdp-specific dropdown
  if (mentionActive) {
    const dropdown = document.getElementById('tdpMentionDropdown');
    const options = dropdown.querySelectorAll('.mention-option');
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionSelectedIdx = Math.min(mentionSelectedIdx+1, options.length-1); options.forEach((o,i) => o.classList.toggle('active', i===mentionSelectedIdx)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); mentionSelectedIdx = Math.max(mentionSelectedIdx-1, 0); options.forEach((o,i) => o.classList.toggle('active', i===mentionSelectedIdx)); return; }
    if ((e.key === 'Enter' || e.key === 'Tab') && options.length > 0) { e.preventDefault(); options[mentionSelectedIdx]?.onmousedown(); return; }
    if (e.key === 'Escape') { closeTdpMentionDropdown(); return; }
  }
  if (e.key === 'Enter' && !mentionActive) addTdpComment();
}

export function onTdpCommentInput(input) {
  const val = input.value, cursor = input.selectionStart;
  const before = val.substring(0, cursor);
  const atIdx = before.lastIndexOf('@');
  if (atIdx >= 0 && (atIdx === 0 || before[atIdx-1] === ' ')) {
    const query = before.substring(atIdx + 1);
    if (!query.includes(' ') || query.startsWith('"')) {
      mentionActive = true; mentionStart = atIdx; mentionQuery = query.replace(/^"/, ''); mentionSelectedIdx = 0;
      showTdpMentionDropdown(mentionQuery, input);
      return;
    }
  }
  closeTdpMentionDropdown();
}

export function showTdpMentionDropdown(query, input) {
  const dropdown = document.getElementById('tdpMentionDropdown');
  const q = query.toLowerCase();
  const matches = state.users.filter(u => {
    const name = (u.responsableName || u.displayName || '').toLowerCase();
    return name.includes(q) || (u.email||'').toLowerCase().includes(q);
  }).slice(0, 8);
  if (!matches.length) { closeTdpMentionDropdown(); return; }
  let h = '';
  matches.forEach((u, i) => {
    const name = u.responsableName || u.displayName || u.email;
    h += `<div class="mention-option${i===mentionSelectedIdx?' active':''}" onmousedown="insertTdpMention('${escapeHtml(name)}')"><span>${u.role==='admin'?'👑':'👤'}</span><span class="mo-name">${name}</span><span class="mo-email">${u.email}</span></div>`;
  });
  dropdown.innerHTML = h;
  dropdown.classList.add('visible');
}

export function closeTdpMentionDropdown() {
  mentionActive = false;
  const d = document.getElementById('tdpMentionDropdown');
  if (d) d.classList.remove('visible');
}

export function insertTdpMention(name) {
  const input = document.getElementById('tdpCommentInput');
  const val = input.value;
  const needsQ = name.includes(' ');
  const txt = needsQ ? `@"${name}" ` : `@${name} `;
  input.value = val.substring(0, mentionStart) + txt + val.substring(input.selectionStart);
  input.focus();
  const c = mentionStart + txt.length;
  input.setSelectionRange(c, c);
  closeTdpMentionDropdown();
}
