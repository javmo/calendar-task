// Formatting / status helpers. Extracted literally from the monolith.

import { state } from '../state.js';
import { parseDate } from './dates.js';

export function getTaskStatus(task) {
  if (task.finalizada) return 'finalized';
  if (task.estado === 'en_revision') return 'en_revision';
  if (task.estado === 'devuelta') return 'devuelta';
  if (task.estado === 'aprobada') return 'finalized';
  if (task.completado && task.revisado && task.enviado) return 'ready';
  const vto = parseDate(task.vencimiento);
  if (!vto) return 'pending';
  const today = new Date(); today.setHours(0,0,0,0);
  if (vto < today) return 'overdue';
  return 'pending';
}

export function getEstadoLabel(estado) {
  const labels = {
    'pendiente': 'Pendiente',
    'en_revision': 'En Revisión',
    'aprobada': 'Aprobada',
    'devuelta': 'Devuelta',
  };
  return labels[estado] || estado || 'Pendiente';
}

export function getEstadoIcon(estado) {
  const icons = {
    'pendiente': '⏳',
    'en_revision': '🔍',
    'aprobada': '✅',
    'devuelta': '↩️',
  };
  return icons[estado] || '⏳';
}

export function getDeadlineClass(vencimiento) {
  if (!vencimiento) return 'dl-ok';
  const vto = parseDate(vencimiento);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.floor((vto - today) / 86400000);
  if (diff < 0) return 'dl-overdue';
  if (diff <= 1) return 'dl-urgent';
  if (diff <= 3) return 'dl-soon';
  return 'dl-ok';
}

export function getDeadlineText(vencimiento) {
  if (!vencimiento) return 'Sin fecha';
  const vto = parseDate(vencimiento);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.floor((vto - today) / 86400000);
  if (diff < 0) return `Vencida hace ${-diff}d`;
  if (diff === 0) return 'Vence HOY';
  if (diff === 1) return 'Vence mañana';
  return `Vence en ${diff}d`;
}

export function formatCommentWithMentions(text) {
  const safe = escapeHtml(text);
  const myEmail = state.currentUser?.email || '';
  const myName = state.currentUser?.responsableName || '';
  // Highlight @mentions
  return safe.replace(/@&quot;([^&]+)&quot;|@(\S+)/g, (match, quoted, word) => {
    const name = quoted || word;
    const isMe = name.toLowerCase() === myName.toLowerCase() ||
                 name.toLowerCase() === myEmail.toLowerCase() ||
                 name.toLowerCase() === (state.currentUser?.displayName || '').toLowerCase();
    return `<span class="mention-highlight${isMe ? ' is-me' : ''}">@${name}</span>`;
  });
}

export function formatTimeAgo(isoStr) {
  const d = new Date(isoStr + 'Z');
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Ahora';
  if (diff < 3600) return `Hace ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff/3600)}h`;
  if (diff < 604800) return `Hace ${Math.floor(diff/86400)}d`;
  return d.toLocaleDateString('es-AR');
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
