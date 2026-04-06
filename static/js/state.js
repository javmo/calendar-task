// Central state object.
// Extracted literally from the original static/index.html monolith.

export const state = {
  tasks: [],
  users: [],
  clientes: [],
  vencimientos: {},
  vtoPeriodo: '',
  schedule: [],
  currentUser: null,
  firebaseUser: null,
  currentView: 'month',
  currentDate: new Date(),
  weekStart: null,
  myCalWeekStart: null,
  editingId: null,
  editingClientId: null,
  sortCol: 'vencimiento',
  sortDir: 1,
  finalizedCollapsed: false,
  devMode: false,
  clientSearch: '',
  selectedTasks: new Set(),
  unreadCounts: {},
  mentions: [],
};

// Mutable auth token holder. Legacy code treats this as a simple `let`;
// wrap it in an object so modules can share the latest value.
export const authTokenRef = { value: null };
