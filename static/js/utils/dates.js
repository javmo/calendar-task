// Date helpers. Extracted literally from the monolith.

export function parseDate(s) { if (!s) return null; const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
export function formatDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function formatDateShort(s) { const d = parseDate(s); if (!d) return ''; return `${d.getDate()}/${d.getMonth()+1}`; }
export function formatDateFull(s) { const d = parseDate(s); if (!d) return ''; return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; }
export function isToday(d) { const t = new Date(); return d.getDate()===t.getDate() && d.getMonth()===t.getMonth() && d.getFullYear()===t.getFullYear(); }
export function getWeekStart(d) { const dd = new Date(d); const day = dd.getDay(); dd.setDate(dd.getDate() - day + (day===0 ? -6 : 1)); dd.setHours(0,0,0,0); return dd; }
export function getDaysInMonth(y,m) { return new Date(y, m+1, 0).getDate(); }
