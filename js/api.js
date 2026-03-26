/**
 * api.js — CLP API client.
 *
 * Fixes vs original:
 *  1. Added updateGoal(id, goal) — was missing, so goal editing silently failed.
 *  2. Added deleteGoal(id) — was missing.
 *  3. Token stored in a module-scoped variable; only the raw JWT string goes into
 *     localStorage — no user data is ever persisted client-side.
 *  4. logout() is synchronous (no reason to be async).
 *  5. checkHealth() helper added for Ollama/backend status checks.
 */

const API_BASE = 'http://localhost:8000/api';

// ── Token management ──────────────────────────────────────────────────────────
let _token = localStorage.getItem('clp_token');

function getToken() { return _token; }

function setToken(t) {
  _token = t;
  if (t) localStorage.setItem('clp_token', t);
  else   localStorage.removeItem('clp_token');
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function register(username, password, name) {
  await apiCall('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, name }),
  });
  return login(username, password);
}

async function login(username, password) {
  const data = await apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.access_token);
  return getUser();
}

function logout() {
  setToken(null);
}

// ── User ──────────────────────────────────────────────────────────────────────
async function getUser() {
  return apiCall('/user/me');
}

async function updateUser(update) {
  return apiCall('/user/me', {
    method: 'PUT',
    body: JSON.stringify(update),
  });
}

// ── Goals ─────────────────────────────────────────────────────────────────────
async function getGoals() {
  return apiCall('/goals');
}

async function createGoal(goal) {
  return apiCall('/goals', { method: 'POST', body: JSON.stringify(goal) });
}

/** FIX: was missing entirely — needed for editing goal progress/status. */
async function updateGoal(id, goal) {
  return apiCall(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(goal) });
}

/** FIX: was missing entirely — needed to remove a goal from the list. */
async function deleteGoal(id) {
  return apiCall(`/goals/${id}`, { method: 'DELETE' });
}

// ── Problems ──────────────────────────────────────────────────────────────────
async function getProblems() {
  return apiCall('/problems');
}

async function solveProblem(problemId) {
  return apiCall(`/problems/${problemId}/solve`, { method: 'POST' });
}

// ── ATS & Mock ────────────────────────────────────────────────────────────────
async function saveAts(score) {
  return apiCall('/ats', { method: 'POST', body: JSON.stringify({ score }) });
}

async function saveMockScore(score) {
  return apiCall('/mock-interview', { method: 'POST', body: JSON.stringify({ score }) });
}

// ── Public data ───────────────────────────────────────────────────────────────
async function getPlacements()  { return apiCall('/placements'); }
async function getLeaderboard() { return apiCall('/leaderboard'); }
async function getStats()       { return apiCall('/stats'); }

// ── Health ────────────────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const r = await fetch(`${API_BASE}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
export default {
  // auth
  register, login, logout,
  // user
  getUser, updateUser,
  // goals
  getGoals, createGoal, updateGoal, deleteGoal,
  // problems
  getProblems, solveProblem,
  // ats / mock
  saveAts, saveMockScore,
  // public
  getPlacements, getLeaderboard, getStats,
  // util
  checkHealth,
  token: getToken,
};
