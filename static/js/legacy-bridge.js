// legacy-bridge.js
// Re-exposes all handler functions on `window` so that inline onclick=
// attributes in index.html (legacy HTML style) keep working.
// Importing this file for its side effects is the first thing main.js does.

import { state } from './state.js';
import { api } from './api.js';

import * as auth from './auth.js';
import * as router from './router.js';

import * as dialogs from './ui/dialogs.js';
import * as toast from './ui/toast.js';
import * as mentions from './ui/mentions.js';

import * as month from './views/month.js';
import * as week from './views/week.js';
import * as list from './views/list.js';
import * as myCal from './views/myCal.js';
import * as users from './views/users.js';
import * as clientes from './views/clientes.js';
import * as vtos from './views/vtos.js';
import * as fiscal from './views/fiscal.js';
import * as assign from './views/assign.js';
import * as review from './views/review.js';
import * as summary from './views/summary.js';
import * as taskTypesView from './views/taskTypes.js';

import * as taskActions from './tasks/taskActions.js';
import * as taskModal from './tasks/taskModal.js';
import * as taskDetail from './tasks/taskDetail.js';
import * as history from './tasks/history.js';
import * as io from './tasks/io.js';
import { refreshData } from './dataRefresh.js';

Object.assign(window, {
  // state + api
  state, api,

  // auth
  login: auth.login,
  logout: auth.logout,
  showProfileEdit: auth.showProfileEdit,
  saveProfile: auth.saveProfile,
  skipProfile: auth.skipProfile,
  toggleUserMenu: auth.toggleUserMenu,
  closeUserMenu: auth.closeUserMenu,
  checkDevMode: auth.checkDevMode,

  // router
  hideLoading: router.hideLoading,
  showSetup: router.showSetup,
  showLogin: router.showLogin,
  showLoginError: router.showLoginError,
  skipSetup: router.skipSetup,
  showApp: router.showApp,
  setView: router.setView,
  render: router.render,

  // dialogs / toast
  showConfirm: dialogs.showConfirm,
  showPromptDialog: dialogs.showPromptDialog,
  closeDialog: dialogs.closeDialog,
  showToast: toast.showToast,
  removeToast: toast.removeToast,

  // mentions
  onCommentInput: mentions.onCommentInput,
  showMentionDropdown: mentions.showMentionDropdown,
  closeMentionDropdown: mentions.closeMentionDropdown,
  insertMention: mentions.insertMention,
  onCommentKeydown: mentions.onCommentKeydown,
  onTdpCommentKeydown: mentions.onTdpCommentKeydown,
  onTdpCommentInput: mentions.onTdpCommentInput,
  showTdpMentionDropdown: mentions.showTdpMentionDropdown,
  closeTdpMentionDropdown: mentions.closeTdpMentionDropdown,
  insertTdpMention: mentions.insertTdpMention,

  // month / week / list
  renderMonth: month.renderMonth,
  changeMonth: month.changeMonth,
  goToday: month.goToday,
  renderWeek: week.renderWeek,
  getFilteredTasks: list.getFilteredTasks,
  populateFilters: list.populateFilters,
  populateFormSelects: list.populateFormSelects,
  renderLegend: list.renderLegend,
  updateStats: list.updateStats,
  renderList: list.renderList,
  onFilterMesChange: list.onFilterMesChange,
  clearAllFilters: list.clearAllFilters,
  hasActiveFilters: list.hasActiveFilters,
  sortBy: list.sortBy,
  toggleTaskSelect: list.toggleTaskSelect,
  toggleSelectAll: list.toggleSelectAll,
  clearListSelection: list.clearListSelection,
  renderFinalized: list.renderFinalized,
  toggleFinalized: list.toggleFinalized,

  // myCal
  renderMyCalendar: myCal.renderMyCalendar,
  toggleMyCalGroup: myCal.toggleMyCalGroup,
  onDragStart: myCal.onDragStart,
  onDragEnd: myCal.onDragEnd,
  onDragOver: myCal.onDragOver,
  onDragLeave: myCal.onDragLeave,
  onDrop: myCal.onDrop,
  onCardDragOver: myCal.onCardDragOver,
  onCardDragLeave: myCal.onCardDragLeave,
  onSchedCardClick: myCal.onSchedCardClick,
  removeSchedule: myCal.removeSchedule,

  // users admin
  renderUsers: users.renderUsers,
  updateUserRole: users.updateUserRole,
  updateUserResponsable: users.updateUserResponsable,

  // clientes
  renderClientes: clientes.renderClientes,
  onClientSearch: clientes.onClientSearch,
  showClientDetail: clientes.showClientDetail,
  closeClientDetail: clientes.closeClientDetail,
  renderCeCategorias: clientes.renderCeCategorias,
  getSelectedCategorias: clientes.getSelectedCategorias,
  onCeCatChange: clientes.onCeCatChange,
  onCeRecurChange: clientes.onCeRecurChange,
  updateCeGenerateSection: clientes.updateCeGenerateSection,
  renderCeBitacora: clientes.renderCeBitacora,
  toggleCeBitacora: clientes.toggleCeBitacora,
  addClient: clientes.addClient,
  editClientFromDetail: clientes.editClientFromDetail,
  generateClientTasks: clientes.generateClientTasks,
  saveClientEdit: clientes.saveClientEdit,
  deleteClient: clientes.deleteClient,
  closeClientEdit: clientes.closeClientEdit,

  // vencimientos
  renderVencimientos: vtos.renderVencimientos,
  cargarSugerencias: vtos.cargarSugerencias,
  aceptarSugerencia: vtos.aceptarSugerencia,
  aceptarTodasSugerencias: vtos.aceptarTodasSugerencias,
  aceptarSugerenciasVacias: vtos.aceptarSugerenciasVacias,
  descartarSugerencias: vtos.descartarSugerencias,
  onVtoInputChange: vtos.onVtoInputChange,
  loadVtoPeriodo: vtos.loadVtoPeriodo,
  saveVencimientos: vtos.saveVencimientos,
  aplicarVencimientos: vtos.aplicarVencimientos,

  // fiscal
  renderFiscal: fiscal.renderFiscal,
  toggleFiscalSelectAll: fiscal.toggleFiscalSelectAll,
  toggleFiscalClient: fiscal.toggleFiscalClient,
  generateFiscalPeriod: fiscal.generateFiscalPeriod,

  // assign
  renderAssign: assign.renderAssign,
  setAssignMode: assign.setAssignMode,
  selectAssignUser: assign.selectAssignUser,
  toggleAssignTask: assign.toggleAssignTask,
  toggleAllAssign: assign.toggleAllAssign,
  toggleGroupAssignCb: assign.toggleGroupAssignCb,
  executeBulkReassign: assign.executeBulkReassign,
  executeBulkUnassign: assign.executeBulkUnassign,

  // review dashboard
  renderReview: review.renderReview,

  // floating summary
  toggleSummaryPanel: summary.toggleSummaryPanel,
  closeSummaryPanel: summary.closeSummaryPanel,
  renderSummaryPanel: summary.renderSummaryPanel,
  isMyTask: summary.isMyTask,
  navigateToTask: summary.navigateToTask,
  updateSummaryBadges: summary.updateSummaryBadges,

  // task actions
  isAdmin: taskActions.isAdmin,
  toggleStatus: taskActions.toggleStatus,
  finalizeTask: taskActions.finalizeTask,
  deleteTask: taskActions.deleteTask,
  deleteSelectedTasks: taskActions.deleteSelectedTasks,
  restoreTask: taskActions.restoreTask,
  submitForReview: taskActions.submitForReview,
  undoSubmitReview: taskActions.undoSubmitReview,
  approveTask: taskActions.approveTask,
  returnTask: taskActions.returnTask,

  // task modal
  addTask: taskModal.addTask,
  editTask: taskModal.editTask,
  saveTask: taskModal.saveTask,
  saveTaskBulk: taskModal.saveTaskBulk,
  updateRecurrenceSection: taskModal.updateRecurrenceSection,
  closeModal: taskModal.closeModal,
  deleteFromModal: taskModal.deleteFromModal,
  finalizeFromModal: taskModal.finalizeFromModal,
  toggleStatusFromModal: taskModal.toggleStatusFromModal,
  submitForReviewFromModal: taskModal.submitForReviewFromModal,
  undoSubmitFromModal: taskModal.undoSubmitFromModal,
  restoreFromModal: taskModal.restoreFromModal,

  // task detail
  loadTdpHistory: taskDetail.loadTdpHistory,
  renderTdpHistoryEntries: taskDetail.renderTdpHistoryEntries,
  addTdpComment: taskDetail.addTdpComment,

  // history modal
  openHistory: history.openHistory,
  closeHistory: history.closeHistory,
  addComment: history.addComment,
  getUnreadCount: history.getUnreadCount,
  historyBtnHtml: history.historyBtnHtml,
  unreadDotHtml: history.unreadDotHtml,

  // import/export
  exportJSON: io.exportJSON,
  importJSON: io.importJSON,

  // data refresh
  refreshData,

  // task types admin view
  renderTaskTypes: taskTypesView.renderTaskTypes,
  onTtSearch: taskTypesView.onTtSearch,
  onTtCatFilter: taskTypesView.onTtCatFilter,
  onTtShowInactive: taskTypesView.onTtShowInactive,
  openTtCreateModal: taskTypesView.openTtCreateModal,
  openTtEditModal: taskTypesView.openTtEditModal,
  closeTtEditModal: taskTypesView.closeTtEditModal,
  saveTtEdit: taskTypesView.saveTtEdit,
  openTtRenameModal: taskTypesView.openTtRenameModal,
  closeTtRenameModal: taskTypesView.closeTtRenameModal,
  saveTtRename: taskTypesView.saveTtRename,
  openTtMergeModal: taskTypesView.openTtMergeModal,
  closeTtMergeModal: taskTypesView.closeTtMergeModal,
  saveTtMerge: taskTypesView.saveTtMerge,
  toggleTtActivo: taskTypesView.toggleTtActivo,
  deleteTt: taskTypesView.deleteTt,
});
