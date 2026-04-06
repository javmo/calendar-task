// Users (admin) view.
// Extracted literally from legacy-inline.js.

import { state } from '../state.js';
import { api } from '../api.js';
import { formatDateFull } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';

// =================== RENDER: USERS (admin) ===================
export function renderUsers() {
  document.getElementById('monthLabel').textContent = 'Gestión de Usuarios';

  let h = `<table class="users-table"><thead><tr>
    <th>Usuario</th><th>Email</th><th>Nombre Responsable</th><th>Rol</th><th>Registrado</th>
  </tr></thead><tbody>`;

  state.users.forEach(u => {
    const isMe = u.email === state.currentUser?.email;
    h += `<tr>`;
    h += `<td>${u.photoURL ? `<img class="user-avatar" src="${u.photoURL}">` : ''}${u.displayName || '-'}</td>`;
    h += `<td style="font-size:12px;color:var(--text-muted)">${u.email}</td>`;
    h += `<td><input value="${u.responsableName || ''}" onchange="updateUserResponsable('${u.email}', this.value)" placeholder="Sin asignar" style="width:140px"></td>`;
    h += `<td><select onchange="updateUserRole('${u.email}', this.value)" ${isMe?'disabled':''}><option value="user" ${u.role==='user'?'selected':''}>Usuario</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select></td>`;
    h += `<td style="font-size:11px;color:var(--text-muted)">${u.createdAt ? formatDateFull(u.createdAt.split('T')[0]) : '-'}</td>`;
    h += `</tr>`;
  });

  h += `</tbody></table>`;
  document.getElementById('viewUsers').innerHTML = h;
}

export async function updateUserRole(email, role) {
  try {
    await api('PUT', `/api/users/${encodeURIComponent(email)}`, { role });
    const u = state.users.find(x => x.email === email);
    if (u) u.role = role;
    showToast('Rol actualizado', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function updateUserResponsable(email, name) {
  try {
    await api('PUT', `/api/users/${encodeURIComponent(email)}`, { responsableName: name });
    const u = state.users.find(x => x.email === email);
    if (u) u.responsableName = name;
    if (email === state.currentUser?.email) state.currentUser.responsableName = name;
    showToast('Nombre actualizado', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
