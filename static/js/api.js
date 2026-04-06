// API helper. Extracted literally from the monolith.
// All network traffic goes through this function.

import { state, authTokenRef } from './state.js';

export async function api(method, path, body = null) {
  if (state.firebaseUser) {
    authTokenRef.value = await state.firebaseUser.getIdToken();
  }
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (authTokenRef.value) opts.headers['Authorization'] = `Bearer ${authTokenRef.value}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error del servidor' }));
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json();
}
