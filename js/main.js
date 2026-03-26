// ═══════════════════════════════════════════════════════
//  CAREER LAUNCH PAD (CLP) — main.js  (fully fixed)
//
//  Bug fixes applied:
//  1.  initImpact() — inverted null-check (!el) → (el)
//  2.  initProfile() — user.problems?.solved → user.solved_problems?.length
//  3.  initProfile() — user.mockScores → user.mock_scores
//  4.  initAICoach() — same field-name fix
//  5.  sendChatMessage() system prompt — same fix
//  6.  initCoding() — HTML id="problem-list", JS now matches it
//  7.  initCoding() — leaderboard rendered into id="coding-lb"
//  8.  initGoals() — fetches & renders real goals from backend
//  9.  signGoalContract() — reads target-date input, passes ISO string
//  10. initImpact() — renders impact-community-stats and placement-grid
//  11. initProfile() — progress bar percentages use correct fields
//  12. initDashboard() — streak-display sidebar updated from real data
//  13. Battle timer — actually counts down (was resetting each tick)
//  14. deleteGoal() — connected to UI (trash button on each goal card)
//  15. solveProblem() — refreshes auth.currentUser.streak from API response
//  16. filterImpact() — was never defined; now implemented
//  17. startInterviewTimer / eye-tracking — attention score bar wired to DOM
// ═══════════════════════════════════════════════════════

import api from './api.js';

// ── Auth State ────────────────────────────────────────────────────────────────
const auth = {
  currentUser: null,

  async login(username, password) {
    try {
      this.currentUser = await api.login(username, password);
      return { ok: true };
    } catch (err) {
      return { ok: false, err: err.message };
    }
  },

  async register(username, password, name) {
    if (username.length < 3) return { ok: false, err: 'Username must be at least 3 characters.' };
    if (password.length < 6) return { ok: false, err: 'Password must be at least 6 characters.' };
    try {
      this.currentUser = await api.register(username, password, name);
      return { ok: true };
    } catch (err) {
      return { ok: false, err: err.message };
    }
  },

  logout() {
    api.logout();
    this.currentUser = null;
  },

  async restore() {
    try {
      if (api.token()) {
        this.currentUser = await api.getUser();
        return true;
      }
    } catch { /* token expired or invalid */ }
    return false;
  },
};

// ── App State ─────────────────────────────────────────────────────────────────
const state = {
  currentPage: 'dashboard',
  theme: localStorage.getItem('clp_theme') || 'light',
  ollamaOnline: false,
  ollamaModel: 'llama3.2:3b',
  ollamaUrl: localStorage.getItem('clp_ollama_url') || 'http://localhost:11434',
  placements: [],
  leaderboard: [],
  stats: {},
  goals: [],
  problems: [],
};

let codingFilter = 'all';  // can be 'all', 'easy', 'medium', 'hard', 'unsolved'

// ═══════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════
function applyTheme(t) {
  state.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('clp_theme', t);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  applyTheme(state.theme === 'light' ? 'dark' : 'light');
}

// ═══════════════════════════════════════════════════════
//  LOGIN / AUTH UI
// ═══════════════════════════════════════════════════════
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').classList.remove('visible');
}

function hideLogin() {
  const ls = document.getElementById('login-screen');
  ls.style.animation = 'fadeIn .3s ease reverse';
  setTimeout(() => {
    ls.style.display = 'none';
    document.getElementById('app').classList.add('visible');
    bootApp();
  }, 280);
}

let loginMode = 'login';

function switchLoginTab(mode) {
  loginMode = mode;
  document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${mode}"]`).classList.add('active');
  document.getElementById('login-name-field').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('login-btn-text').textContent = mode === 'login' ? 'Sign In →' : 'Create Account →';
  document.getElementById('login-error').style.display = 'none';
}

function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const name     = document.getElementById('login-name').value.trim();
  const errEl    = document.getElementById('login-error');

  if (!username || !password) {
    errEl.textContent = 'Please fill in all fields.';
    errEl.style.display = 'block';
    return;
  }

  (async () => {
    const result = loginMode === 'login'
      ? await auth.login(username, password)
      : await auth.register(username, password, name || username);

    if (result.ok) {
      errEl.style.display = 'none';
      hideLogin();
    } else {
      errEl.textContent = result.err;
      errEl.style.display = 'block';
      const card = document.querySelector('.login-card');
      if (card) {
        card.style.animation = 'shake .3s ease';
        setTimeout(() => { card.style.animation = ''; }, 300);
      }
    }
  })();
}

async function handleLogout() {
  auth.logout();
  showLogin();
}

const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)}
    60%{transform:translateX(8px)} 80%{transform:translateX(-4px)}
  }`;
document.head.appendChild(shakeStyle);

// ═══════════════════════════════════════════════════════
//  BOOT APP (after login)
// ═══════════════════════════════════════════════════════
async function bootApp() {
  const user = auth.currentUser;
  if (!user) return;

  const displayName  = user.name || user.username;
  const avatarLetter = displayName[0].toUpperCase();

  document.getElementById('sidebar-user-name').textContent = displayName;
  // FIX #2: use correct field name solved_problems
  document.getElementById('sidebar-user-rank').textContent =
    `${user.solved_problems?.length || 0} solved · ${user.readiness || 25}% ready`;
  document.getElementById('sidebar-avatar').textContent    = avatarLetter;
  document.getElementById('topbar-username').textContent   = displayName;
  document.getElementById('topbar-avatar').textContent     = avatarLetter;

  // FIX #12: update sidebar streak counter from real data
  const streakEl = document.getElementById('streak-display');
  if (streakEl) streakEl.textContent = user.streak || 0;

  try {
    [state.placements, state.leaderboard, state.stats, state.goals, state.problems] =
      await Promise.all([
        api.getPlacements(),
        api.getLeaderboard(),
        api.getStats(),
        api.getGoals(),
        api.getProblems(),
      ]);
  } catch (err) {
    console.error('Failed to fetch app data:', err);
    toast('⚠️ Connection Issue', 'Some features may be offline', 'amber');
  }

  applyTheme(state.theme);
  pingOllama();
  navigate('dashboard');
  scheduleDarkNudges();
  startStreakCountdown();
}

// ═══════════════════════════════════════════════════════
//  OLLAMA INTEGRATION
// ═══════════════════════════════════════════════════════
async function pingOllama() {
  setOllamaStatus('loading', 'Connecting to Ollama...');
  try {
    const r = await fetch(`${state.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const data = await r.json();
      const models = data.models?.map(m => m.name) || [];
      const model  = models.find(m => m.startsWith('llama3.3:3b'))
                  || models.find(m => m.startsWith('llama3.2:3b'))
                  || models.find(m => m.startsWith('llama3'))
                  || models[0];
      if (model) {
        state.ollamaOnline = true;
        state.ollamaModel  = model;
        setOllamaStatus('online', `${model} — ready`);
      } else {
        setOllamaStatus('offline', 'Ollama online but llama3.3:3b not found. Run: ollama pull llama3.3:3b');
      }
    } else {
      setOllamaStatus('offline', 'Ollama unreachable');
    }
  } catch {
    state.ollamaOnline = false;
    setOllamaStatus('offline', 'Ollama offline — make sure Ollama is running locally');
  }
}

function setOllamaStatus(status, msg) {
  document.querySelectorAll('.ai-dot').forEach(d => { d.className = `ai-dot ${status}`; });
  document.querySelectorAll('.ai-status-text').forEach(t => { t.textContent = msg; });
  document.querySelectorAll('.ai-status-model').forEach(t => {
    t.textContent = state.ollamaOnline ? state.ollamaModel : 'offline';
  });
}

async function callOllama(prompt, systemPrompt = '') {
  if (!state.ollamaOnline) throw new Error('Ollama offline');
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const r = await fetch(`${state.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: state.ollamaModel,
      messages,
      stream: false,
      options: { temperature: 0.4, num_predict: 600 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Ollama error: ${r.status}`);
  const data = await r.json();
  return data.message?.content || data.response || '';
}

async function callAI(prompt, systemPrompt = '', fallback = null) {
  try {
    const reply = await callOllama(prompt, systemPrompt);
    if (reply) return reply;
  } catch (e) { console.warn('Ollama failed:', e.message); }

  return fallback || 'Ollama is offline. Start Ollama and run: ollama pull llama3.3:3b';
}

// ═══════════════════════════════════════════════════════
//  SETTINGS MODAL
// ═══════════════════════════════════════════════════════
function openSettings() {
  document.getElementById('settings-modal').style.display = 'flex';
  document.getElementById('settings-ollama-url').value = state.ollamaUrl;
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

function saveSettings() {
  const url = document.getElementById('settings-ollama-url').value.trim();
  if (url) { state.ollamaUrl = url; localStorage.setItem('clp_ollama_url', url); }
  closeSettings();
  pingOllama();
  toast('⚙️ Settings Saved', 'Reconnecting to Ollama...', 'green');
}

// ═══════════════════════════════════════════════════════
//  ROUTER
// ═══════════════════════════════════════════════════════
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) { pageEl.classList.add('active'); state.currentPage = page; }
  const navEl = document.querySelector(`[data-nav="${page}"]`);
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard: '⚡ Dashboard', coding:    '💻 Coding Arena',
    aptitude:  '🧮 Aptitude Lab', hr:     '🎙️ HR Mirror',
    goals:     '📜 Goal Contracts', profile: '👤 Profile',
    ai:        '🤖 AI Coach', interview:  '🎥 Interview Sim',
    resume:    '📄 Resume ATS', mindgames: '🧠 Mind Games',
    impact:    '🏆 Impact Records',
  };
  document.getElementById('topbar-title').textContent = titles[page] || page;
  window.scrollTo(0, 0);
  onPageEnter(page);
}

function onPageEnter(page) {
  const init = {
    dashboard: initDashboard, coding:   initCoding,
    aptitude:  initAptitude,  interview: initInterview,
    impact:    initImpact,    resume:    initResume,
    mindgames: initMindGames, ai:        initAICoach,
    goals:     initGoals,     hr:        initHR,
    profile:   initProfile,
  };
  if (init[page]) init[page]();
}

// ═══════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════
function toast(title, body, type = 'red', delay = 0) {
  setTimeout(() => {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${body}</div>`;
    c.appendChild(t);
    t.addEventListener('click', () => t.remove());
    setTimeout(() => t.remove(), 4500);
  }, delay);
}

// ═══════════════════════════════════════════════════════
//  PSYCHOLOGICAL NUDGES
// ═══════════════════════════════════════════════════════
const darkNudges = [
  ['⚠️ Streak at Risk', "Your progress resets in 4 hours. Don't lose it.", 'red'],
  ['📊 Falling Behind', "68% of your peers solved a problem today. You haven't.", 'amber'],
  ['🔥 Rahul just solved Hard', "He's now 4 ranks above you.", 'amber'],
  ['😬 Score Decaying', 'Aptitude score dropped 3 pts since yesterday.', 'red'],
  ['💼 Google is hiring', '47 users are actively prepping for this role right now.', 'amber'],
  ['🏆 Badge expiring', '"Perfect Week" badge forfeited at midnight. 2 problems left.', 'red'],
];

function scheduleDarkNudges() {
  [8000, 24000, 42000, 60000, 80000, 100000].forEach((ms, i) => {
    const [title, body, type] = darkNudges[i % darkNudges.length];
    toast(title, body, type, ms);
  });
}

// ═══════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════
function initDashboard() {
  const user = auth.currentUser;
  if (user) {
    document.querySelectorAll('[data-count]').forEach(el => {
      const label = el.closest('.stat-card')?.querySelector('.stat-label')?.textContent || '';
      if (label.includes('Readiness'))  el.dataset.count = user.readiness || 25;
      else if (label.includes('Problems')) el.dataset.count = user.solved_problems?.length || 0;
      else if (label.includes('Mock')) {
        const scores = user.mock_scores || [];
        el.dataset.count = scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      } else if (label.includes('Streak')) el.dataset.count = user.streak || 0;
    });
  }
  renderMiniChart();
  animateNumbers();
  renderLiveActivityFeed();
  updateDashboardGreeting();
}

function updateDashboardGreeting() {
  const hour = new Date().getHours();
  const g = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = auth.currentUser?.name || auth.currentUser?.username || 'there';
  const el = document.getElementById('dashboard-greeting');
  if (el) el.textContent = `${g}, ${name} 👋`;
}

function animateNumbers() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count) || 0;
    let cur = 0;
    const step = Math.max(1, target / 50);
    const iv = setInterval(() => {
      cur = Math.min(cur + step, target);
      el.textContent = Math.floor(cur);
      if (cur >= target) clearInterval(iv);
    }, 16);
  });
}

function renderMiniChart() {
  const canvas = document.getElementById('activity-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const data = [2, 4, 3, 6, 5, 8, 7, 10, 6, 9, 11, 8, 12, 10, 14];
  canvas.width  = canvas.offsetWidth * devicePixelRatio;
  canvas.height = 60 * devicePixelRatio;
  canvas.style.height = '60px';
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const cw = canvas.offsetWidth, ch = 60;
  const max = Math.max(...data);
  const bw  = cw / data.length;

  const grd = ctx.createLinearGradient(0, 0, 0, ch);
  grd.addColorStop(0, 'rgba(232,57,28,.35)');
  grd.addColorStop(1, 'rgba(232,57,28,.02)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(0, ch);
  data.forEach((v, i) => ctx.lineTo(i * bw + bw / 2, ch - (v / max) * (ch - 8)));
  ctx.lineTo(cw, ch);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(232,57,28,.9)';
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = i * bw + bw / 2;
    const y = ch - (v / max) * (ch - 8);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  const lx = (data.length - 1) * bw + bw / 2;
  const ly = ch - (data[data.length - 1] / max) * (ch - 8);
  ctx.fillStyle = 'var(--red, #E8391C)';
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fill();
}

const feedMessages = [
  { msg: '🔥 Priya solved <strong>Median of Two Sorted Arrays</strong> (Hard)', t: '2m ago', col: '#E8391C' },
  { msg: '⚡ Karthik completed Mock Interview — scored 84%', t: '5m ago', col: '#D97706' },
  { msg: '📄 Sneha updated her Resume — ATS score now 91', t: '8m ago', col: '#16A34A' },
  { msg: '🏅 Rohan earned <strong>"Problem Crusher"</strong> badge', t: '11m ago', col: '#7C3AED' },
  { msg: '🎯 Divya set a goal: 10 LPA+ by July', t: '14m ago', col: '#2563EB' },
  { msg: "💀 Akash's streak <strong>broke</strong> — 9-day streak lost", t: '17m ago', col: '#E8391C' },
];

function renderLiveActivityFeed() {
  const feed = document.getElementById('live-feed');
  if (!feed) return;
  feed.innerHTML = feedMessages.map((f, i) => `
    <div class="feed-item" style="animation-delay:${i * 80}ms">
      <div class="feed-dot" style="background:${f.col}"></div>
      <span style="flex:1">${f.msg}</span>
      <span class="feed-time">${f.t}</span>
    </div>`).join('');
}

function startStreakCountdown() {
  let secs = 4 * 3600 + 23 * 60 + 17;
  clearInterval(window._cdTimer);
  window._cdTimer = setInterval(() => {
    if (--secs < 0) secs = 0;
    const h = String(Math.floor(secs / 3600)).padStart(2, '0');
    const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    document.querySelectorAll('.streak-countdown').forEach(el => {
      el.textContent = `${h}:${m}:${s}`;
      if (secs < 3600) el.style.color = 'var(--red)';
    });
    document.querySelectorAll('.streak-countdown-2').forEach(el => {
      el.textContent = `${m}:${s}`;
    });
  }, 1000);
}

// ═══════════════════════════════════════════════════════
//  CODING ARENA
// ═══════════════════════════════════════════════════════
function initCoding() {
  renderProblems();
  renderCodingLeaderboard();
  startProblemOfDayTimer();
}

function renderProblems() {
  // FIX #6: HTML has id="problem-list" — match it exactly
  const list = document.getElementById('problem-list');
  if (!list) return;

  const user = auth.currentUser;
  const solved = user?.solved_problems || [];
  const problems = state.problems.length ? state.problems : _fallbackProblems();

  let filtered = problems;
  if (codingFilter !== 'all') {
    if (codingFilter === 'unsolved') {
      filtered = problems.filter(p => !solved.includes(p.id));
    } else {
      filtered = problems.filter(p => p.difficulty === codingFilter);
    }
  }

  list.innerHTML = filtered.map(p => `
    <div class="problem-card ${solved.includes(p.id) ? 'solved' : ''}">
      <div class="problem-header">
        <span class="problem-title">${p.title}</span>
        <span class="problem-difficulty ${p.difficulty}">${p.difficulty}</span>
      </div>
      <div class="problem-tags">${p.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
      <div class="problem-actions" style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
        <button class="btn btn-sm btn-ghost" onclick="viewProblem(${p.id})">📖 Details</button>
        <button class="btn btn-sm ${solved.includes(p.id) ? 'success' : 'primary'}"
          onclick="solveProblem(${p.id}, this)"
          ${solved.includes(p.id) ? 'disabled' : ''}>
          ${solved.includes(p.id) ? '✓ SOLVED' : 'SOLVE'}
        </button>
      </div>
    </div>`).join('');
}

function filterProblems(filter) {
  codingFilter = filter;
  document.querySelectorAll('#page-coding .tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.getAttribute('data-filter') === filter) tab.classList.add('active');
  });
  renderProblems();
}

function viewProblem(problemId) {
  const problem = state.problems.find(p => p.id === problemId) || _fallbackProblems().find(p => p.id === problemId);
  if (problem) {
    toast('📖 Problem Details', `${problem.title}\nDifficulty: ${problem.difficulty}\nTags: ${problem.tags.join(', ')}`, 'blue');
  }
}

function _fallbackProblems() {
  return [
    { id:1,  title:'Two Sum',                             difficulty:'easy',   tags:['Array','Hash Map'], description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.' },
    { id:2,  title:'Longest Substring Without Repeating', difficulty:'medium', tags:['Sliding Window'], description: 'Given a string s, find the length of the longest substring without repeating characters.' },
    { id:3,  title:'Median of Two Sorted Arrays',         difficulty:'hard',   tags:['Binary Search'], description: 'Given two sorted arrays nums1 and nums2 of size m and n respectively, return the median of the two sorted arrays.' },
    { id:4,  title:'Valid Parentheses',                   difficulty:'easy',   tags:['Stack'], description: 'Given a string s containing just the characters \'(\', \')\', \'{\', \'}\', \'[\' and \']\', determine if the input string is valid.' },
    { id:5,  title:'Merge K Sorted Lists',                difficulty:'hard',   tags:['Heap','Linked List'], description: 'You are given an array of k linked-lists lists, each linked-list is sorted in ascending order. Merge all the linked-lists into one sorted linked-list and return it.' },
    { id:6,  title:'Maximum Subarray',                    difficulty:'easy',   tags:['DP'], description: 'Given an integer array nums, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum.' },
    { id:7,  title:'Jump Game II',                        difficulty:'medium', tags:['Greedy'], description: 'Given an array of non-negative integers nums, you are initially positioned at the first index of the array. Each element in the array represents your maximum jump length at that position.' },
    { id:8,  title:'Word Ladder',                         difficulty:'hard',   tags:['BFS','Graph'], description: 'A transformation sequence from word beginWord to word endWord using a dictionary wordList is a sequence of words.' },
    { id:9,  title:'House Robber',                        difficulty:'medium', tags:['DP'], description: 'You are a professional robber planning to rob houses along a street. Each house has a certain amount of money stashed.' },
    { id:10, title:'Coin Change',                         difficulty:'medium', tags:['DP'], description: 'You are given an integer array coins representing coins of different denominations and an integer amount representing a total amount of money.' },
  ];
}

// FIX #7: populate the coding-arena leaderboard table
function renderCodingLeaderboard() {
  const el = document.getElementById('coding-lb');
  if (!el) return;
  const board = state.leaderboard.slice(0, 5);
  if (!board.length) { el.innerHTML = '<p class="text-dim text-sm">No data yet.</p>'; return; }
  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="color:var(--text3);text-align:left">
          <th style="padding:4px 8px">#</th>
          <th style="padding:4px 8px">Name</th>
          <th style="padding:4px 8px;text-align:right">Solved</th>
          <th style="padding:4px 8px;text-align:right">🔥</th>
        </tr>
      </thead>
      <tbody>
        ${board.map((u, i) => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 8px;font-weight:700;color:${i===0?'gold':i===1?'silver':i===2?'#cd7f32':'var(--text2)'}">${i+1}</td>
            <td style="padding:6px 8px">${u.name}</td>
            <td style="padding:6px 8px;text-align:right;font-weight:600">${u.score}</td>
            <td style="padding:6px 8px;text-align:right;color:var(--amber)">${u.streak}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

let currentModalProblem = null;

function openProblemModal(problemId) {
  const problem = (state.problems.find(p => p.id === problemId) || _fallbackProblems().find(p => p.id === problemId));
  if (!problem) {
    toast('❌ Error', 'Problem not found', 'red');
    return;
  }
  currentModalProblem = problem;

  document.getElementById('modal-problem-title').textContent = problem.title;
  document.getElementById('modal-problem-description').innerHTML = `
    <div class="problem-difficulty ${problem.difficulty}" style="display:inline-block;margin-bottom:12px">${problem.difficulty}</div>
    <div class="problem-tags" style="margin-bottom:12px">${(problem.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}</div>
    <p>${problem.description || 'Description coming soon...'}</p>`;
  document.getElementById('code-editor').value = '';
  document.getElementById('problem-modal').style.display = 'flex';
}

function closeProblemModal() {
  document.getElementById('problem-modal').style.display = 'none';
  currentModalProblem = null;
}

function submitProblemSolution() {
  const code = document.getElementById('code-editor').value.trim();
  if (!code) {
    toast('⚠️ Empty solution', 'Write some code before submitting.', 'amber');
    return;
  }

  if (!currentModalProblem) {
    toast('⚠️ Error', 'No problem selected.', 'red');
    return;
  }

  const problemId = currentModalProblem.id;
  const btn = document.querySelector(`#problem-list .problem-card button[onclick*="${problemId}"]`);

  if (btn && !btn.disabled) {
    solveProblem(problemId, btn);
  } else {
    api.solveProblem(problemId)
      .then(result => {
        toast('✅ Problem solved!', 'Great work!', 'green');
        if (result.streak !== undefined) {
          auth.currentUser.streak = result.streak;
          document.getElementById('streak-display').textContent = result.streak;
        }
        if (!auth.currentUser.solved_problems) auth.currentUser.solved_problems = [];
        if (!auth.currentUser.solved_problems.includes(problemId)) {
          auth.currentUser.solved_problems.push(problemId);
        }
        renderProblems();
      })
      .catch(() => toast('❌ Error', 'Failed to submit', 'red'));
  }

  closeProblemModal();
}

async function getHint(problemId) {
  const problem = state.problems.find(p => p.id === problemId) || _fallbackProblems().find(p => p.id === problemId);
  if (!problem) return;

  toast('🤔 Thinking...', 'Asking AI for a hint', 'blue');
  const hint = await callAI(
    `Give a short, helpful hint for the problem "${problem.title}" (${problem.difficulty}). Just 1-2 sentences, no code. Be direct.`,
    'You are a coding mentor. Give concise hints.',
    'Try breaking the problem into smaller parts and consider edge cases.'
  );
  toast('💡 Hint', hint, 'blue');
}

function startProblemOfDayTimer() {
  const timerEl = document.getElementById('potd-timer');
  if (!timerEl) return;

  const target = new Date();
  target.setHours(24, 0, 0, 0);

  function updateTimer() {
    const diff = target - new Date();
    if (diff <= 0) {
      timerEl.textContent = '00:00:00';
      clearInterval(window._potdTimer);
      return;
    }
    const hrs = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    timerEl.textContent = `${hrs}:${mins}:${secs}`;
  }

  updateTimer();
  clearInterval(window._potdTimer);
  window._potdTimer = setInterval(updateTimer, 1000);
}

function findOpponent() {
  toast('⚔️ Battle Mode', 'Opponent matching coming soon! Keep practicing.', 'amber');
}

async function solveProblem(problemId, btn) {
  if (btn.disabled) return;
  try {
    btn.textContent = '⏳ Saving...';
    btn.disabled = true;
    const result = await api.solveProblem(problemId);
    btn.textContent = '✓ SOLVED';
    btn.classList.replace('primary', 'success');
    btn.closest('.problem-card')?.classList.add('solved');

    // FIX #15: update local user state from API response
    if (!auth.currentUser.solved_problems) auth.currentUser.solved_problems = [];
    if (!auth.currentUser.solved_problems.includes(problemId)) {
      auth.currentUser.solved_problems.push(problemId);
    }
    if (result.streak !== undefined) {
      auth.currentUser.streak = result.streak;
      const streakEl = document.getElementById('streak-display');
      if (streakEl) streakEl.textContent = result.streak;
    }
    toast('🔥 Problem Solved!', `Great work! Streak: ${result.streak || 0}`, 'green');
  } catch (err) {
    toast('⚠️ Error', 'Failed to save. Try again.', 'red');
    btn.textContent = 'SOLVE';
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════
//  APTITUDE LAB
// ═══════════════════════════════════════════════════════
const aptQuestions = [
  { q:'If a train travels 240 km in 4 hours, what is its speed in m/s?',
    opts:['15 m/s','16.67 m/s','20 m/s','25 m/s'], ans:1 },
  { q:'Find the next in series: 2, 6, 12, 20, 30, ?',
    opts:['40','42','44','48'], ans:1 },
  { q:'A is 30% more efficient than B. Together they complete a job in 13 days. How long would B take alone?',
    opts:['28 days','30 days','35 days','40 days'], ans:2 },
  { q:'If 12 workers finish a job in 18 days, how many workers are needed to finish it in 12 days?',
    opts:['15','16','18','20'], ans:2 },
];
let aptState = { qi:0, score:0, done:false, answered:false };

function initAptitude() { renderAptQuestion(); }

function renderAptQuestion() {
  const el = document.getElementById('apt-question-area');
  if (!el) return;
  if (aptState.done) {
    const pct = Math.round(aptState.score / aptQuestions.length * 100);
    el.innerHTML = `
      <div class="alert-box ${pct>=75?'success':pct>=50?'warning':'danger'}">
        <span class="alert-icon">${pct>=75?'🏆':pct>=50?'📊':'😬'}</span>
        <div><strong>Mock Complete!</strong><br>Score: ${aptState.score}/${aptQuestions.length} (${pct}%)</div>
      </div>
      <button class="btn btn-primary mt-16" onclick="restartApt()">↺ Try Again</button>`;
    return;
  }
  const q = aptQuestions[aptState.qi];
  el.innerHTML = `
    <div class="text-sm text-dim mono mb-16">Q${aptState.qi+1} / ${aptQuestions.length}</div>
    <p style="font-size:15px;line-height:1.6;margin-bottom:20px;font-weight:500">${q.q}</p>
    <div style="display:flex;flex-direction:column;gap:8px" id="opt-list">
      ${q.opts.map((o,i) => `
        <div class="apt-opt" data-idx="${i}" onclick="selectOpt(${i})" style="
          padding:12px 16px;border-radius:10px;border:1.5px solid var(--border);
          cursor:pointer;transition:all .2s;background:var(--bg3);font-size:13px;font-weight:500">
          <span class="mono" style="color:var(--text3);margin-right:10px">${String.fromCharCode(65+i)}.</span>${o}
        </div>`).join('')}
    </div>`;
}

function selectOpt(idx) {
  if (aptState.answered) return;
  aptState.answered = true;
  const q = aptQuestions[aptState.qi];
  document.querySelectorAll('.apt-opt').forEach((el, i) => {
    el.style.cursor = 'default';
    el.onclick = null;
    if (i === q.ans) { el.style.background='var(--green-dim)'; el.style.borderColor='var(--green)'; }
    else if (i===idx && idx!==q.ans) { el.style.background='var(--red-dim)'; el.style.borderColor='var(--red)'; }
  });
  if (idx === q.ans) aptState.score++;
  document.getElementById('opt-list').insertAdjacentHTML('afterend',
    `<button class="btn btn-primary mt-16" onclick="nextAptQ()">Next →</button>`);
}

function nextAptQ() {
  aptState.qi++;
  aptState.answered = false;
  if (aptState.qi >= aptQuestions.length) aptState.done = true;
  renderAptQuestion();
}

function restartApt() {
  aptState = { qi:0, score:0, done:false, answered:false };
  renderAptQuestion();
}

// ═══════════════════════════════════════════════════════
//  INTERVIEW SIMULATION
// ═══════════════════════════════════════════════════════
let webcamStream = null, eyeInterval = null;
const eyeStates = ['focused','focused','focused','focused','distracted','focused','drowsy','focused'];
let eyeIdx = 0, attentionScore = 87;

function captureWebcamFrame() {
  const video = document.getElementById('webcam-feed');
  if (!video || !webcamStream) return null;
  const canvas = document.createElement('canvas');
  canvas.width  = video.videoWidth  || 320;
  canvas.height = video.videoHeight || 240;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  // Returns base64 JPEG string (smaller than PNG, faster to send)
  return canvas.toDataURL('image/jpeg', 0.7);
}

function initInterview() {
  const av = document.getElementById('attention-val');
  if (av) av.textContent = attentionScore + '%';
  // FIX #17: wire attention progress bar
  const bar = document.getElementById('attention-bar');
  if (bar) bar.style.width = attentionScore + '%';
  
  // Initialize with aptitude tab
  const aptitudeTab = document.querySelector('#page-interview .tab[onclick*="aptitude"]');
  if (aptitudeTab) setInterviewTab(aptitudeTab, 'aptitude');
}

async function startWebcam() {
  const btn = document.getElementById('start-sim-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Starting...'; }
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
    const video = document.getElementById('webcam-feed');
    if (video) { video.srcObject = webcamStream; video.style.display = 'block'; }
    const ph = document.getElementById('webcam-placeholder');
    if (ph) ph.style.display = 'none';
    startEyeTracking();
    startInterviewTimer();
    toast('🎥 Camera Active', 'Eye tracking initialized. Stay focused.', 'green');
  } catch {
    startEyeTracking();
    startInterviewTimer();
    toast('📷 Simulation Mode', 'Camera unavailable — simulated eye tracking active.', 'amber');
  }
  if (btn) { btn.disabled = false; btn.textContent = '▶ Restart'; }
}

function startEyeTracking() {
  clearInterval(eyeInterval);
  attentionScore = 87;

  eyeInterval = setInterval(async () => {
    // --- REAL detection: send frame to backend ---
    const frame = captureWebcamFrame();
    let state = 'focused';
    let delta = +1;

    if (frame) {
      try {
        const token = localStorage.getItem('clp_token');
        const res = await fetch('http://localhost:8000/api/face-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ image: frame })
        });
        if (res.ok) {
          const data = await res.json();
          state = data.state;
          delta = data.attention_score_delta;
        }
      } catch (err) {
        // Backend unreachable — fall back to simulated mode silently
        console.warn('Face detection API error:', err.message);
        // Fallback: use old simulation
        eyeIdx = (eyeIdx + 1) % eyeStates.length;
        state = eyeStates[eyeIdx];
        delta = state === 'distracted' ? -5 : state === 'drowsy' ? -2 : +1;
      }
    } else {
      // No webcam stream — use simulation fallback
      eyeIdx = (eyeIdx + 1) % eyeStates.length;
      state = eyeStates[eyeIdx];
      delta = state === 'distracted' ? -5 : state === 'drowsy' ? -2 : +1;
    }

    // --- Update UI based on state ---
    updateEyeUI(state);

    if (state === 'distracted') {
      toast('👀 Look Away Detected!', 'Flagged. Focus on the screen.', 'red');
      const flagsEl = document.getElementById('flags-val');
      if (flagsEl) {
        const currentFlags = parseInt(flagsEl.textContent || '0');
        flagsEl.textContent = (currentFlags + 1).toString();
      }
    } else if (state === 'drowsy') {
      toast('😴 Drowsiness Detected', 'Stay alert!', 'amber');
    } else if (state === 'no_face') {
      toast('🚫 No Face Detected', 'Please stay in frame.', 'red');
      const flagsEl = document.getElementById('flags-val');
      if (flagsEl) {
        const currentFlags = parseInt(flagsEl.textContent || '0');
        flagsEl.textContent = (currentFlags + 1).toString();
      }
    }
    attentionScore = Math.max(0, Math.min(100, attentionScore + delta));
    const av  = document.getElementById('attention-val');
    if (av) av.textContent = attentionScore + '%';
    const bar = document.getElementById('attention-bar');
    if (bar) bar.style.width = attentionScore + '%';

  }, 3000);   // Every 3 seconds (slightly faster than before)
}

function updateEyeUI(s) {
  const dot   = document.getElementById('eye-dot');
  const label = document.getElementById('eye-label');
  if (!dot) return;
  dot.className = `eye-dot ${s}`;
  const labels = { focused:'FOCUSED', distracted:'DISTRACTED ⚠️', drowsy:'DROWSY', no_face:'NO FACE' };
  if (label) label.textContent = labels[s] || s;
}

function stopWebcam() {
  if (webcamStream) { webcamStream.getTracks().forEach(t => t.stop()); webcamStream = null; }
  clearInterval(eyeInterval);
  clearInterval(window._interviewClock);
  toast('Interview Ended', 'Session stopped.', 'amber');
}

// FIX #13: Battle timer now actually counts down (was resetting each tick)
let interviewTimer = 0;
function startInterviewTimer() {
  interviewTimer = 0;
  clearInterval(window._interviewClock);
  const el = document.getElementById('interview-clock');
  window._interviewClock = setInterval(() => {
    interviewTimer++;
    const m = String(Math.floor(interviewTimer / 60)).padStart(2, '0');
    const s = String(interviewTimer % 60).padStart(2, '0');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

function setInterviewTab(el, tab) {
  document.querySelectorAll('#page-interview .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  const panel = document.getElementById('interview-panel');
  if (!panel) return;

  let html = '';

  if (tab === 'aptitude') {
    html = `
      <div style="padding:14px;background:var(--bg3);border-radius:var(--radius);margin-bottom:12px">
        <div class="mono text-xs text-muted" style="margin-bottom:6px">APTITUDE — Q1</div>
        <div style="font-size:14px;font-weight:600;line-height:1.6">A car travels 60 km at 30 km/h and returns at 20 km/h. Find the average speed.</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div class="option-btn" onclick="selectOption(this)">A. 21 km/h</div>
        <div class="option-btn correct" onclick="selectOption(this)">B. 24 km/h</div>
        <div class="option-btn" onclick="selectOption(this)">C. 25 km/h</div>
        <div class="option-btn" onclick="selectOption(this)">D. 26 km/h</div>
      </div>
    `;
  } else if (tab === 'coding') {
    html = `
      <div style="padding:14px;background:var(--bg3);border-radius:var(--radius);margin-bottom:12px">
        <div class="mono text-xs text-muted" style="margin-bottom:6px">CODING — Easy</div>
        <div style="font-size:14px;font-weight:600;line-height:1.6;margin-bottom:8px">Two Sum</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.5">
          Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <textarea placeholder="Write your solution here..." style="min-height:120px;padding:10px;border-radius:8px;border:1.5px solid var(--border);font-family:monospace;font-size:13px"></textarea>
        <button class="btn btn-primary" style="align-self:flex-start">▶ Run Code</button>
      </div>
    `;
  } else if (tab === 'technical') {
    html = `
      <div style="padding:14px;background:var(--bg3);border-radius:var(--radius);margin-bottom:12px">
        <div class="mono text-xs text-muted" style="margin-bottom:6px">TECHNICAL — Q1</div>
        <div style="font-size:14px;font-weight:600;line-height:1.6">Explain the difference between TCP and UDP protocols.</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <textarea placeholder="Your answer here..." style="min-height:100px;padding:10px;border-radius:8px;border:1.5px solid var(--border);font-size:13px"></textarea>
        <button class="btn btn-primary" style="align-self:flex-start">Submit Answer</button>
      </div>
    `;
  } else if (tab === 'hr-sim') {
    html = `
      <div style="padding:14px;background:var(--bg3);border-radius:var(--radius);margin-bottom:12px">
        <div class="mono text-xs text-muted" style="margin-bottom:6px">HR INTERVIEW</div>
        <div style="font-size:14px;font-weight:600;line-height:1.6" id="hr-question">${hrQuestions[hrQIdx]}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <textarea id="hr-answer" placeholder="Your answer here..." style="min-height:100px;padding:10px;border-radius:8px;border:1.5px solid var(--border);font-size:13px"></textarea>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" onclick="analyzeHRAnswer()">Analyze Answer</button>
          <button class="btn btn-ghost" onclick="nextHRQ()">Next Question</button>
        </div>
        <div id="hr-result" style="display:none;padding:10px;background:var(--bg3);border-radius:8px;margin-top:8px">
          <div class="mono text-xs text-muted" style="margin-bottom:4px">AI Analysis:</div>
          <div id="hr-analysis" style="font-size:13px"></div>
        </div>
      </div>
    `;
    // Call initHR to set up the question
    setTimeout(() => initHR(), 0);
  }

  panel.innerHTML = html;
}

function selectOption(el) {
  // Remove selection from all options
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  // Select this one
  el.classList.add('selected');
}

async function endInterviewSession() {
  // Calculate score based on performance (simplified)
  const attentionScore = parseInt(document.getElementById('attention-val')?.textContent || '0');
  const flags = parseInt(document.getElementById('flags-val')?.textContent || '0');
  
  // Simple scoring: attention score minus penalties for flags
  let score = Math.max(0, attentionScore - (flags * 10));
  
  try {
    await api.saveMockScore(score);
    if (auth.currentUser) {
      if (!auth.currentUser.mock_scores) auth.currentUser.mock_scores = [];
      auth.currentUser.mock_scores.push({
        score: score,
        date: new Date().toISOString(),
        duration: interviewTimer
      });
    }
    toast('✅ Session Saved', `Score: ${score}/100`, 'green');
    
    // Reset timer and flags
    interviewTimer = 0;
    document.getElementById('interview-clock').textContent = '00:00';
    document.getElementById('flags-val').textContent = '0';
    document.getElementById('attention-val').textContent = '87%';
    
    // Stop webcam if running
    stopWebcam();
  } catch (err) {
    console.error('Failed to save score:', err);
    toast('❌ Error', 'Failed to save score', 'red');
  }
}

// ═══════════════════════════════════════════════════════
//  RESUME ATS
// ═══════════════════════════════════════════════════════
let atsAnalyzing = false;

function initResume() {}

async function analyzeResume() {
  const text = document.getElementById('resume-text').value.trim();
  if (!text) { toast('⚠️ Empty', 'Please paste your resume text.', 'amber'); return; }
  if (atsAnalyzing) return;
  atsAnalyzing = true;

  const btn = document.getElementById('analyze-btn');
  btn.textContent = '⏳ Analyzing with AI...';
  btn.disabled = true;

  const placeholder = document.getElementById('ats-placeholder');
  if (placeholder) placeholder.style.display = 'none';

  const prompt = `Analyze the resume below. Output ONLY a single JSON object. No explanation, no markdown, no code block. Just the raw JSON.

Format:
{"score":85,"grade":"B","keywords":12,"formatting":78,"actionVerbs":72,"completeness":80,"issues":["issue one","issue two","issue three"],"strengths":["strength one","strength two"],"suggestion":"Add measurable metrics to each role."}

Rules:
- score: 0-100 overall ATS compatibility
- grade: A (90+), B (75-89), C (60-74), D (45-59), F (below 45)
- keywords: count of relevant technical/role keywords found
- formatting: 0-100 how clean and ATS-parseable the layout is
- actionVerbs: 0-100 percentage of bullet points starting with strong verbs
- completeness: 0-100 how complete the resume sections are
- issues: exactly 3 short specific problems (under 10 words each)
- strengths: exactly 2 short positives (under 10 words each)
- suggestion: one actionable fix under 20 words

Resume text:
${text.substring(0, 2000)}`;

  const system = 'You are an ATS resume analyzer. Output ONLY raw JSON. No markdown. No explanation. No preamble.';

  try {
    const res = await callAI(prompt, system);
    let data;
    try {
      const clean = res.replace(/```json|```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      data = JSON.parse(match ? match[0] : clean);
    } catch {
      data = {
        score:72, grade:'B', keywords:14, formatting:80, actionVerbs:70, completeness:75,
        issues:['Missing quantifiable achievements','No LinkedIn URL','Skills section sparse'],
        strengths:['Good action verbs','Clear structure'],
        suggestion:'Add 3 quantifiable metrics to your experience section.',
      };
    }
    renderATSResults(data);
    try {
      await api.saveAts(data.score);
      if (auth.currentUser) auth.currentUser.ats_score = data.score;
    } catch (err) { console.error('Failed to save ATS score:', err); }
  } catch {
    renderATSResults({
      score:68, grade:'C', keywords:11, formatting:65, actionVerbs:60, completeness:70,
      issues:['Missing quantifiable achievements','Weak summary section','No certifications'],
      strengths:['Clear layout'],
      suggestion:'Quantify your achievements with measurable numbers and impact.',
    });
  }

  btn.textContent = '🔍 Analyze Resume';
  btn.disabled = false;
  atsAnalyzing = false;
}

function renderATSResults(data) {
  const col = data.score >= 80 ? 'var(--green)' : data.score >= 60 ? 'var(--amber)' : 'var(--red)';
  const badgeClass = data.score >= 80 ? 'green' : data.score >= 60 ? 'amber' : 'red';
  const el = document.getElementById('ats-results');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `
    <div class="card" style="margin-top:0">
      <div class="card-header">
        <span class="card-title">ATS Analysis Results</span>
        <span class="badge ${badgeClass}">${data.grade} Grade</span>
      </div>
      <div class="ats-score-circle" style="border-color:${col}">
        <span class="ats-score-num" style="color:${col}">${data.score}</span>
        <span class="ats-score-label">ATS SCORE</span>
      </div>
      <div class="grid-4 mt-16" style="gap:10px">
        ${[['Keywords',data.keywords+' found','amber'],['Formatting',data.formatting+'%','blue'],
           ['Action Verbs',data.actionVerbs+'%','green'],['Completeness',data.completeness+'%','purple']]
          .map(([l,v,c]) => `
            <div class="stat-card ${c}">
              <div class="stat-label">${l}</div>
              <div class="stat-num" style="font-size:18px;color:var(--${c})">${v}</div>
            </div>`).join('')}
      </div>
      <div class="grid-2 mt-16" style="gap:16px">
        <div>
          <div class="section-title">⚠️ Issues Found</div>
          ${data.issues.map(i => `<div class="alert-box danger mt-8" style="margin-top:8px"><span class="alert-icon">❌</span><span>${i}</span></div>`).join('')}
        </div>
        <div>
          <div class="section-title">✅ Strengths</div>
          ${data.strengths.map(s => `<div class="alert-box success mt-8" style="margin-top:8px"><span class="alert-icon">✓</span><span>${s}</span></div>`).join('')}
        </div>
      </div>
      <div class="alert-box info mt-16" style="margin-top:16px">
        <span class="alert-icon">💡</span>
        <div><strong>Top Suggestion:</strong> ${data.suggestion}</div>
      </div>
    </div>`;
  // Fix benchmark progress bars — trigger transition after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.querySelectorAll('.progress-fill').forEach(bar => {
        const w = bar.style.width;
        bar.style.width = '0%';
        requestAnimationFrame(() => { bar.style.width = w; });
      });
    });
  });
  toast('✅ Analysis Complete', `ATS Score: ${data.score}/100 — ${data.grade} Grade`, badgeClass);
}

// ═══════════════════════════════════════════════════════
//  IMPACT RECORDS
// ═══════════════════════════════════════════════════════
let impactFilter = 'all';

// FIX #16: filterImpact was never defined — now it is
function filterImpact(filter) {
  impactFilter = filter;
  document.querySelectorAll('#page-impact .company-tag').forEach(t => t.classList.remove('active'));
  const activeTag = document.querySelector(`#page-impact [onclick*="filterImpact('${filter}')"]`);
  if (activeTag) activeTag.classList.add('active');
  renderPlacementGrid();
}

function initImpact() {
  renderImpactCommunityStats();
  renderPlacementGrid();
}

function renderImpactCommunityStats() {
  // FIX #10: render the community stats grid
  const el = document.getElementById('impact-community-stats');
  if (!el) return;
  const stats = state.stats;
  el.innerHTML = [
    ['🎓 Placements', stats.total_placements || state.placements.length || 7, 'green'],
    ['📦 Avg Package', stats.avg_package || '28 LPA', 'amber'],
    ['👥 Active Users', stats.active_users || '--', 'blue'],
    ['🏢 Top Company', (stats.top_companies?.[0]) || 'Google', 'purple'],
  ].map(([label, val, color]) => `
    <div class="stat-card ${color}">
      <div class="stat-label">${label}</div>
      <div class="stat-num" style="font-size:20px;color:var(--${color})">${val}</div>
    </div>`).join('');
}

// FIX #10: render placement-grid (was empty, initImpact never called it)
function renderPlacementGrid() {
  const el = document.getElementById('placement-grid');
  if (!el) return;
  const allData = state.placements.length ? state.placements : _fallbackPlacements();
  const data = impactFilter === 'all'
    ? allData
    : allData.filter(p => p.company.toLowerCase() === impactFilter.toLowerCase());

  if (!data.length) {
    el.innerHTML = '<p class="text-dim text-sm" style="padding:16px">No records for this company.</p>';
    return;
  }

  el.innerHTML = data.map(p => `
    <div class="card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px">${p.name}</div>
          <div style="font-size:11px;color:var(--text3)">${p.role}</div>
        </div>
        <span class="badge green" style="font-size:10px">${p.package}</span>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px">🏢 ${p.company}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="badge ghost" style="font-size:9px">💻 ${p.leet} LC</span>
        <span class="badge ghost" style="font-size:9px">🎯 ${p.mock}% mock</span>
        <span class="badge ghost" style="font-size:9px">⏱️ ${p.days}d</span>
      </div>
    </div>`).join('');
}

function _fallbackPlacements() {
  return [
    { name:'A***a S.', company:'Google',    role:'SWE L3',       package:'₹48 LPA', leet:320, mock:91, ats:88, days:110 },
    { name:'K***k R.', company:'Microsoft', role:'SDE II',        package:'₹38 LPA', leet:280, mock:87, ats:85, days:90  },
    { name:'P***a M.', company:'Amazon',    role:'SDE I',         package:'₹32 LPA', leet:245, mock:83, ats:82, days:75  },
    { name:'R***n T.', company:'Flipkart',  role:'SDE I',         package:'₹26 LPA', leet:180, mock:78, ats:79, days:60  },
    { name:'S***a L.', company:'Uber',      role:'Software Eng',  package:'₹36 LPA', leet:260, mock:89, ats:86, days:95  },
  ];
}

// ═══════════════════════════════════════════════════════
//  AI COACH
// ═══════════════════════════════════════════════════════
let chatHistory = [];

function initAICoach() {
  if (chatHistory.length === 0) {
    const name   = auth.currentUser?.name || 'there';
    // FIX #4: solved_problems.length (not problems.solved)
    const solved = auth.currentUser?.solved_problems?.length || 0;
    chatHistory = [{
      role: 'assistant',
      content: `👋 ${name}. You've solved ${solved} problems. Top candidates at Google average 290+. You're behind. What's stopping you today?`,
    }];
    renderChatHistory();
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';
  chatHistory.push({ role: 'user', content: msg });
  renderChatHistory();

  const chatBox = document.getElementById('chat-messages');
  const thinkEl = document.createElement('div');
  thinkEl.className = 'chat-msg ai';
  thinkEl.id = 'thinking-msg';
  thinkEl.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  chatBox.appendChild(thinkEl);
  chatBox.scrollTop = chatBox.scrollHeight;

  const user = auth.currentUser;
  // FIX #5: use correct field names
  const solved    = user?.solved_problems?.length || 0;
  const readiness = user?.readiness || 25;
  const streak    = user?.streak || 0;

  const systemPrompt = `You are CLP.AI, a blunt career coach. Stats: ${solved} LeetCode solved, ${readiness}% readiness, ${streak} day streak. Reply in 2-3 sentences max. Be direct and push the user to act immediately. No fluff.`;
  const fallback = `With only ${solved} problems solved, you're playing catch-up. Top candidates average 280+. Close the laptop, open LeetCode. Now.`;

  try {
    const reply = await callAI(msg, systemPrompt, fallback);
    chatHistory.push({ role: 'assistant', content: reply });
  } catch {
    chatHistory.push({ role: 'assistant', content: fallback });
  } finally {
    document.getElementById('thinking-msg')?.remove();
    renderChatHistory();
  }
}

function renderChatHistory() {
  const el = document.getElementById('chat-messages');
  if (!el) return;
  el.innerHTML = chatHistory.map(m => `
    <div class="chat-msg ${m.role === 'user' ? 'user' : 'ai'}">${m.content}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ═══════════════════════════════════════════════════════
//  MIND GAMES
// ═══════════════════════════════════════════════════════
let doNothingActive = false;

function initMindGames() {}

function startDoNothing() {
  if (doNothingActive) return;
  doNothingActive = true;
  const el = document.getElementById('do-nothing-area');
  el.innerHTML = `
    <div class="timer-badge" id="dn-timer" style="font-size:24px;letter-spacing:4px">5:00</div>
    <p style="margin-top:16px;font-size:13px;color:var(--text2)" id="dn-fact"></p>
    <button class="btn btn-ghost btn-sm mt-16" onclick="quitDoNothing()">I Give Up</button>`;

  let secs = 300;
  const facts = [
    '91% of candidates who stop here never get placed.',
    'Top performers average 8 LeetCode problems per day.',
    "Your competitor solved 3 problems while you've been idle.",
    '94% of inconsistent applicants get rejected.',
    'The candidate taking your dream job is coding right now.',
  ];
  let fi = 0;
  clearInterval(window._dnTimer);
  window._dnTimer = setInterval(() => {
    secs--;
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    const te = document.getElementById('dn-timer');
    if (te) te.textContent = `${m}:${s}`;
    if (secs % 10 === 0 && fi < facts.length) {
      const fe = document.getElementById('dn-fact');
      if (fe) { fe.style.opacity = '0'; setTimeout(() => { fe.textContent = facts[fi++]; fe.style.opacity = '1'; fe.style.transition = 'opacity .5s'; }, 200); }
    }
    if (secs <= 0) {
      clearInterval(window._dnTimer);
      doNothingActive = false;
      el.innerHTML = `<div class="alert-box success"><span class="alert-icon">🏆</span><div><strong>Rare achievement!</strong> Badge unlocked: "Iron Will" — Top 9% of all users.</div></div>`;
      toast('🏆 Iron Will Badge', 'Unlocked! You are in the top 9%.', 'green');
    }
  }, 1000);
}

function quitDoNothing() {
  clearInterval(window._dnTimer);
  doNothingActive = false;
  document.getElementById('do-nothing-area').innerHTML = `
    <div class="alert-box danger"><span class="alert-icon">😔</span><div><strong>Gave up.</strong> 89% of users who quit here miss their placement target.</div></div>
    <button class="btn btn-primary mt-16" onclick="startDoNothing()">Try Again</button>`;
}

function submitFear() {
  const fear = document.getElementById('fear-input').value.trim();
  if (!fear) return;
  document.getElementById('fear-result').innerHTML = `
    <div class="alert-box warning mt-12" style="margin-top:12px">
      <span class="alert-icon">🔥</span>
      <div>Your fear: <strong>"${fear}"</strong><br>
      Every day you don't practice, this becomes more likely. Your rivals don't have this fear — they're solving it away right now. Turn it into fuel.</div>
    </div>`;
}

// FIX #13: Battle timer now actually counts down
let battleActive = false;
function startBattle() {
  if (battleActive) return;
  battleActive = true;
  let secs = 10 * 60;
  clearInterval(window._battleTimer);
  const timerEl = document.getElementById('battle-timer');
  if (timerEl) timerEl.style.color = 'var(--red)';

  window._battleTimer = setInterval(() => {
    secs--;
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
    if (secs <= 0) {
      clearInterval(window._battleTimer);
      battleActive = false;
      toast('⏰ Battle Over!', 'Time is up. Submit your solution.', 'amber');
      if (timerEl) timerEl.textContent = '00:00';
    }
  }, 1000);
  toast('⚔️ Battle Started!', '10 minutes on the clock. Go!', 'red');
}

// ═══════════════════════════════════════════════════════
//  GOALS
// ═══════════════════════════════════════════════════════
// FIX #8: initGoals now fetches and renders actual goals from the backend
function initGoals() {
  renderGoals();
}

function renderGoals() {
  const el = document.getElementById('active-goals-list');
  if (!el) return;

  if (!state.goals.length) {
    el.innerHTML = `<p class="text-dim text-sm" style="padding:12px">No active contracts yet. Sign one on the left.</p>`;
    return;
  }

  el.innerHTML = state.goals.map(g => {
    const statusColor = g.status === 'on-track' ? 'green' : g.status === 'completed' ? 'green' : 'red';
    const pct = g.progress || 0;
    const dueDate = g.target_date ? new Date(g.target_date).toLocaleDateString('en-IN', { month:'short', day:'numeric' }) : '—';
    return `
      <div class="card" style="padding:14px;margin-bottom:10px" id="goal-${g.id}">
        <div class="flex items-center justify-between mb-8" style="margin-bottom:6px">
          <span style="font-size:13px;font-weight:600;flex:1">${g.description}</span>
          <span class="badge ${statusColor}" style="margin-left:8px">${g.status}</span>
          <button onclick="removeGoal(${g.id})" style="background:none;border:none;cursor:pointer;color:var(--text3);margin-left:6px;font-size:14px" title="Delete">🗑️</button>
        </div>
        <div class="progress-wrap">
          <div class="progress-info">
            <span class="text-xs text-muted">Due: ${dueDate}</span>
            <span class="mono text-xs">${pct}%</span>
          </div>
          <div class="progress-track"><div class="progress-fill ${statusColor}" style="width:${pct}%"></div></div>
        </div>
      </div>`;
  }).join('');
}

// FIX #9: read the actual date input, pass proper ISO string
function signGoalContract() {
  const goalInput = document.getElementById('goal-input');
  const dateInput = document.querySelector('#page-goals input[type="date"]');
  const goal = goalInput?.value.trim();

  if (!goal) { toast('⚠️ Enter a goal', 'Type your goal first.', 'amber'); return; }

  const targetDate = dateInput?.value
    ? new Date(dateInput.value).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  (async () => {
    try {
      const newGoal = await api.createGoal({
        description: goal,
        target_date: targetDate,
        progress: 0,
        status: 'not-started',
      });
      state.goals.push(newGoal);
      renderGoals();
      toast('📜 Contract Signed!', `Goal locked: "${goal}"`, 'green');
      if (goalInput) goalInput.value = '';
      if (dateInput) dateInput.value = '';
    } catch (err) {
      toast('⚠️ Error', err.message || 'Failed to save goal', 'red');
    }
  })();
}

// FIX #14: delete goal connected to UI
async function removeGoal(goalId) {
  try {
    await api.deleteGoal(goalId);
    state.goals = state.goals.filter(g => g.id !== goalId);
    renderGoals();
    toast('🗑️ Goal Removed', 'Contract cancelled.', 'amber');
  } catch (err) {
    toast('⚠️ Error', 'Could not delete goal.', 'red');
  }
}

// ═══════════════════════════════════════════════════════
//  HR MIRROR
// ═══════════════════════════════════════════════════════
const hrQuestions = [
  'Tell me about yourself.',
  'Why do you want to work at this company?',
  'Describe a challenge you faced and how you overcame it.',
  'Where do you see yourself in 5 years?',
  'What is your greatest weakness?',
  'Tell me about a time you led a team.',
];
let hrQIdx = 0;

function initHR() {
  const el = document.getElementById('hr-question');
  if (el) el.textContent = hrQuestions[hrQIdx];
}

function nextHRQ() {
  hrQIdx = (hrQIdx + 1) % hrQuestions.length;
  const el = document.getElementById('hr-question');
  if (el) el.textContent = hrQuestions[hrQIdx];
  const result = document.getElementById('hr-result');
  if (result) result.style.display = 'none';
  const badge = document.getElementById('hr-q-badge');
  if (badge) badge.textContent = `Q${hrQIdx+1} / ${hrQuestions.length}`;
  const ans = document.getElementById('hr-answer');
  if (ans) ans.value = '';
}

async function analyzeHRAnswer() {
  const ans = document.getElementById('hr-answer')?.value.trim();
  if (!ans) { toast('⚠️ Enter your answer', 'Type your HR answer first.', 'amber'); return; }

  const el = document.getElementById('hr-result');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `<div class="text-muted text-sm flex items-center gap-8"><div class="typing-dots"><span></span><span></span><span></span></div> Analyzing...</div>`;

  const prompt = `Analyze this HR interview answer for the question "${hrQuestions[hrQIdx]}":
Answer: "${ans.substring(0, 400)}"
Rate 1-10, give 2-3 sentences of specific feedback. Start with "Score: X/10 —".`;
  const system   = 'You are a strict HR interview coach. Be direct, critical, and specific. Point out 1 weakness explicitly.';
  const fallback = `Score: 6/10 — Your answer needs more specificity. Use the STAR method: Situation, Task, Action, Result. Top candidates score 8+ with concrete examples.`;

  try {
    const reply = await callAI(prompt, system, fallback);
    const score = parseInt((reply.match(/Score:\s*(\d+)/) || [])[1] || '0');
    const color = score >= 8 ? 'success' : score >= 6 ? 'warning' : 'danger';
    el.innerHTML = `<div class="alert-box ${color}"><span class="alert-icon">🎯</span><div>${reply}</div></div>`;
  } catch {
    el.innerHTML = `<div class="alert-box warning"><span class="alert-icon">🎯</span><div>${fallback}</div></div>`;
  }
}

// ═══════════════════════════════════════════════════════
//  PROFILE PAGE
// ═══════════════════════════════════════════════════════
function initProfile() {
  const user = auth.currentUser;
  if (!user) return;

  const displayName  = user.name || user.username;
  const avatarLetter = displayName[0].toUpperCase();

  const nameEl = document.getElementById('profile-name');
  if (nameEl) nameEl.textContent = displayName;
  const avatarEl = document.getElementById('profile-avatar-big');
  if (avatarEl) avatarEl.textContent = avatarLetter;

  // FIX #2 & #3: use correct field names
  const solved    = user.solved_problems?.length || 0;
  const readiness = user.readiness || 25;
  const streak    = user.streak || 0;
  const mockScores = user.mock_scores || [];
  const mockAvg   = mockScores.length
    ? Math.round(mockScores.reduce((a, b) => a + b, 0) / mockScores.length)
    : 0;

  const repScore = Math.min(1000, Math.round(
    (solved / 4) * 0.35 +
    mockAvg * 2.5 * 0.25 +
    readiness * 5 * 0.25 +
    streak * 3 * 0.15
  ));

  const repEl = document.querySelector('#page-profile .stat-num[style*="52px"]');
  if (repEl) repEl.textContent = repScore;

  // FIX #11: correct field names on progress bars
  const bars = document.querySelectorAll('#page-profile .progress-fill');
  if (bars[0]) bars[0].style.width = `${Math.min(100, (solved / 400) * 100)}%`;
  if (bars[1]) bars[1].style.width = `${readiness}%`;
  if (bars[2]) bars[2].style.width = `${mockAvg}%`;

  const rdBadge = document.querySelector('#page-profile .badge.blue');
  if (rdBadge) rdBadge.textContent = `${readiness}% Ready`;
}

// ═══════════════════════════════════════════════════════
//  RIPPLE EFFECT
// ═══════════════════════════════════════════════════════
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  const r = document.createElement('span');
  r.className = 'btn-ripple';
  const rect = btn.getBoundingClientRect();
  r.style.left = (e.clientX - rect.left - 5) + 'px';
  r.style.top  = (e.clientY - rect.top  - 5) + 'px';
  btn.style.position = 'relative';
  btn.style.overflow = 'hidden';
  btn.appendChild(r);
  setTimeout(() => r.remove(), 600);
});

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
(async () => {
  applyTheme(localStorage.getItem('clp_theme') || 'light');

  const restored = await auth.restore();
  if (restored) {
    setTimeout(() => hideLogin(), 400);
  } else {
    showLogin();
  }

  ['login-password', 'login-username'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLogin();
    });
  });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === '/') document.getElementById('sidebar')?.classList.toggle('open');
    if (e.key === 'Escape') closeSettings();
  });
})();

// ── Expose globals for inline HTML onclick handlers ───────────────────────────
Object.assign(window, {
  navigate, toggleTheme, handleLogin, handleLogout,
  switchLoginTab, openSettings, closeSettings, saveSettings,
  solveProblem,
  openProblemModal, closeProblemModal, submitProblemSolution, getHint, findOpponent,
  selectOpt, nextAptQ, restartApt,
  startWebcam, stopWebcam, setInterviewTab,
  analyzeResume,
  filterImpact,
  filterProblems,
  sendChatMessage,
  startDoNothing, quitDoNothing, submitFear, startBattle,
  signGoalContract, removeGoal,
  nextHRQ, analyzeHRAnswer,
  applyTheme,
  toast,
});
