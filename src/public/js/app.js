// RelayPulse Operator Console Client Application (100% Dynamic)

let currentUser = null;
let currentLeads = [];
let currentCampaigns = [];
let currentStats = null;
let currentEvents = [];
let selectedLeadProfile = null;
let authMode = 'login'; // 'login' | 'signup'

// ===================================================
// Initialization & Lifecycle
// ===================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initFilters();
  initModals();
  initAuthForm();
  await checkAuthAndInitialize();
});

// ===================================================
// Authentication & Session Management
// ===================================================
function getAuthToken() {
  return localStorage.getItem('relaypulse_token');
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem('relaypulse_token', token);
  } else {
    localStorage.removeItem('relaypulse_token');
  }
}

async function fetchWithAuth(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include HTTP-only cookie
  });

  if (response.status === 401 && !url.includes('/api/auth/')) {
    // Session expired or unauthenticated
    currentUser = null;
    setAuthToken(null);
    showAuthOverlay();
    throw new Error('Session expired. Please sign in again.');
  }

  return response;
}

async function checkAuthAndInitialize() {
  try {
    const res = await fetchWithAuth('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) {
        currentUser = data.data;
        onAuthSuccess(currentUser);
        return;
      }
    }
    showAuthOverlay();
  } catch {
    showAuthOverlay();
  }
}

function onAuthSuccess(user) {
  hideAuthOverlay();
  updateUserNav(user);

  // Check onboarding flag: if user hasn't seen it yet, trigger popup!
  if (!user.hasSeenOnboarding) {
    openOnboardingModal();
  }

  loadAllData();
}

function updateUserNav(user) {
  const nameEl = document.getElementById('nav-user-name');
  const avatarEl = document.getElementById('nav-avatar');
  if (nameEl) nameEl.innerText = user.name || user.email;
  if (avatarEl) avatarEl.innerText = (user.name || user.email).charAt(0).toUpperCase();
}

function showAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function hideAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function setAuthMode(mode) {
  authMode = mode;
  const loginBtn = document.getElementById('btn-toggle-login');
  const signupBtn = document.getElementById('btn-toggle-signup');
  const nameGroup = document.getElementById('group-name');
  const submitBtn = document.getElementById('auth-submit-btn');
  const errorBox = document.getElementById('auth-error-box');

  if (errorBox) errorBox.classList.remove('visible');

  if (mode === 'signup') {
    loginBtn?.classList.remove('active');
    signupBtn?.classList.add('active');
    if (nameGroup) nameGroup.style.display = 'block';
    if (submitBtn) submitBtn.innerText = 'Create Account & Enter Console';
  } else {
    signupBtn?.classList.remove('active');
    loginBtn?.classList.add('active');
    if (nameGroup) nameGroup.style.display = 'none';
    if (submitBtn) submitBtn.innerText = 'Sign In to Console';
  }
}

function initAuthForm() {
  const authForm = document.getElementById('auth-form');
  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('auth-error-box');
    const submitBtn = document.getElementById('auth-submit-btn');

    if (errorBox) errorBox.classList.remove('visible');

    const email = document.getElementById('auth-email')?.value.trim();
    const password = document.getElementById('auth-password')?.value;
    const name = document.getElementById('auth-name')?.value.trim();

    if (!email || !password) {
      showAuthError('Please provide both email and password.');
      return;
    }

    if (authMode === 'signup' && !name) {
      showAuthError('Please enter your full name.');
      return;
    }

    try {
      if (submitBtn) submitBtn.disabled = true;

      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const payload = authMode === 'signup' ? { name, email, password } : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Authentication failed');
      }

      setAuthToken(data.data.token);
      currentUser = data.data.user;
      onAuthSuccess(currentUser);
      showToast(`Welcome ${currentUser.name}!`, 'success');
    } catch (err) {
      showAuthError(err.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function showAuthError(msg) {
  const errorBox = document.getElementById('auth-error-box');
  if (errorBox) {
    errorBox.innerText = msg;
    errorBox.classList.add('visible');
  }
}

async function handleLogout() {
  try {
    await fetchWithAuth('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Logout note:', err);
  } finally {
    currentUser = null;
    setAuthToken(null);
    showToast('Signed out successfully', 'info');
    showAuthOverlay();
  }
}

// ===================================================
// Onboarding Modal Controls
// ===================================================
function openOnboardingModal() {
  const modal = document.getElementById('modal-onboarding');
  if (modal) modal.classList.add('active');
}

async function dismissOnboarding() {
  const modal = document.getElementById('modal-onboarding');
  if (modal) modal.classList.remove('active');

  // Persist that the user has completed onboarding in the database
  try {
    await fetchWithAuth('/api/auth/onboarding-complete', { method: 'PATCH' });
    if (currentUser) currentUser.hasSeenOnboarding = true;
  } catch (err) {
    console.error('Failed to update onboarding state:', err);
  }
}

// ===================================================
// Navigation Tabs & Modals
// ===================================================
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');

      if (targetId === 'tab-events') {
        loadEvents();
      } else if (targetId === 'tab-campaigns') {
        loadCampaigns();
      }
    });
  });
}

function initFilters() {
  const searchInput = document.getElementById('search-input');
  const statusFilter = document.getElementById('status-filter');
  const intentFilter = document.getElementById('intent-filter');

  let debounceTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadLeads, 300);
  });

  statusFilter?.addEventListener('change', loadLeads);
  intentFilter?.addEventListener('change', loadLeads);
}

function initModals() {
  document.querySelectorAll('.close-modal').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  // Create Lead Form Submit
  const createLeadForm = document.getElementById('create-lead-form');
  createLeadForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(createLeadForm);
    const payload = {
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      company: formData.get('company'),
      role: formData.get('role'),
      companySize: formData.get('companySize'),
      painPoints: formData.get('painPoints') || null,
      engagementNotes: formData.get('engagementNotes') || null,
      campaignId: formData.get('campaignId') || null,
      autoQualify: formData.get('autoQualify') === 'on',
    };

    try {
      const res = await fetchWithAuth('/api/leads', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create lead');

      showToast(`Lead ${payload.firstName} created successfully!`, 'success');
      document.getElementById('modal-create-lead')?.classList.remove('active');
      createLeadForm.reset();
      loadAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Inbound Reply Form Submit
  const replyForm = document.getElementById('webhook-reply-form');
  replyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(replyForm);
    const leadId = formData.get('leadId');
    const message = formData.get('message');
    const channel = formData.get('channel') || 'email';

    await sendSimulatedReply(leadId, message, channel);
  });
}

// ===================================================
// One-Click Sample Workspace Data Loader
// ===================================================
async function loadSampleWorkspaceData() {
  try {
    showToast('Loading sample RevOps workspace data...', 'info');
    const res = await fetchWithAuth('/api/workspace/sample-data', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to seed sample data');

    showToast('Sample data seeded successfully!', 'success');
    await loadAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===================================================
// 100% Dynamic Data Fetching
// ===================================================
async function loadAllData() {
  await Promise.all([loadStats(), loadLeads(), loadCampaigns()]);
}

async function loadStats() {
  try {
    const res = await fetchWithAuth('/api/events/stats/summary');
    const data = await res.json();
    if (data.success) {
      currentStats = data.data;
      renderStats(data.data);
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function renderStats(stats) {
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val !== undefined && val !== null ? val : '0';
  };

  setEl('stat-total-leads', stats.totalLeads);
  setEl('stat-in-sequence', stats.inSequence);
  setEl('stat-hot-leads', stats.hotLeads);
  setEl('stat-replied-booked', `${stats.replied} / ${stats.booked}`);
  setEl('stat-avg-score', `${stats.averageScore}/100`);
  setEl('stat-conversion-rate', `${stats.conversionRate}%`);
}

async function loadLeads() {
  try {
    const search = document.getElementById('search-input')?.value || '';
    const status = document.getElementById('status-filter')?.value || '';
    const intent = document.getElementById('intent-filter')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    if (intent) params.append('intentTier', intent);
    params.append('limit', '50');

    const res = await fetchWithAuth(`/api/leads?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      currentLeads = data.data;
      renderLeadsTable(data.data);
    }
  } catch (err) {
    console.error('Failed to load leads:', err);
  }
}

function renderLeadsTable(leads) {
  const tbody = document.getElementById('leads-table-body');
  const container = document.getElementById('leads-table-container');
  if (!tbody) return;

  if (leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 0;">
          <div class="empty-state">
            <div class="empty-state-icon">👥</div>
            <h3>No Prospects In Workspace</h3>
            <p>You don't have any leads matching your criteria. Create a prospect or load realistic sample data.</p>
            <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
              <button class="btn btn-primary btn-sm" onclick="loadSampleWorkspaceData()">⚡ Load Sample Workspace Data</button>
              <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-create-lead').classList.add('active')">+ New Lead</button>
            </div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = leads
    .map((lead) => {
      const scoreClass = lead.score >= 80 ? 'score-high' : lead.score >= 50 ? 'score-med' : 'score-low';
      const stepsCount = 3;
      let stepDots = '';
      for (let i = 1; i <= stepsCount; i++) {
        const cls = i < lead.currentStep ? 'completed' : i === lead.currentStep ? 'active' : '';
        stepDots += `<div class="step-dot ${cls}">${i}</div>`;
      }

      return `
      <tr>
        <td>
          <div style="font-weight: 600; color: #fff;">${escapeHtml(lead.firstName)} ${escapeHtml(lead.lastName)}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(lead.email)}</div>
        </td>
        <td>
          <div style="font-weight: 500;">${escapeHtml(lead.company)}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(lead.role)} • ${lead.companySize}</div>
        </td>
        <td>
          <span class="badge badge-${lead.status}">${formatStatus(lead.status)}</span>
        </td>
        <td>
          <div class="score-indicator">
            <span style="font-weight: 700; width: 26px;">${lead.score}</span>
            <div class="score-bar-bg">
              <div class="score-bar-fill ${scoreClass}" style="width: ${lead.score}%"></div>
            </div>
            <span class="badge badge-${lead.intentTier}">${lead.intentTier}</span>
          </div>
        </td>
        <td>
          <div class="step-stepper" title="Step ${lead.currentStep} of ${stepsCount}">
            ${stepDots}
          </div>
          ${lead.nextActionAt ? `<div style="font-size: 0.7rem; color: #60a5fa; margin-top: 2px;">Next: ${formatTime(lead.nextActionAt)}</div>` : ''}
        </td>
        <td>
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="openLeadProfile('${lead.id}')" title="Inspect Full Dossier">
              🔍 Inspect
            </button>
            <button class="btn btn-primary btn-sm" onclick="triggerQualify('${lead.id}')" title="Run AI Qualification">
              ⚡ Qualify
            </button>
            <button class="btn btn-secondary btn-sm" onclick="triggerAdvance('${lead.id}')" title="Advance Sequence Step" ${lead.status === 'unsubscribed' || lead.status === 'replied' || lead.status === 'booked' ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
              ⏩ Step
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openSimulateReply('${lead.id}')" title="Simulate Inbound Reply">
              💬 Reply
            </button>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');
}

async function loadCampaigns() {
  try {
    const res = await fetchWithAuth('/api/campaigns');
    const data = await res.json();
    if (data.success) {
      currentCampaigns = data.data;
      renderCampaigns(data.data);
      populateCampaignSelect(data.data);
    }
  } catch (err) {
    console.error('Failed to load campaigns:', err);
  }
}

function renderCampaigns(campaigns) {
  const container = document.getElementById('campaigns-list');
  if (!container) return;

  if (campaigns.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎯</div>
        <h3>No Outbound Campaigns Active</h3>
        <p>No sequence campaigns have been defined yet. Load sample data to start with the high-velocity RevOps sequence.</p>
        <button class="btn btn-primary btn-sm" onclick="loadSampleWorkspaceData()">⚡ Load Sample Data</button>
      </div>
    `;
    return;
  }

  container.innerHTML = campaigns
    .map(
      (camp) => `
    <div style="background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <div>
          <h3 style="font-size: 1.15rem; font-weight: 700; color: #fff;">${escapeHtml(camp.name)}</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">${escapeHtml(camp.description || '')}</p>
          <div style="font-size: 0.75rem; color: #60a5fa; margin-top: 0.35rem;">🎯 Target Persona: ${escapeHtml(camp.targetPersona || 'General ICP')}</div>
        </div>
        <span class="badge badge-qualified">ACTIVE</span>
      </div>

      <h4 style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-dim); margin-bottom: 0.75rem; letter-spacing: 0.05em;">Outbound Sequence Steps (${camp.steps.length})</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
        ${camp.steps
          .map(
            (step) => `
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <span style="font-weight: 700; color: #60a5fa; font-size: 0.85rem;">Step #${step.stepNumber}</span>
              <span class="badge" style="background: rgba(255,255,255,0.05);">${step.channel.toUpperCase()} (${step.delayHours}h delay)</span>
            </div>
            <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.25rem;">${escapeHtml(step.name)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(step.goal)}</div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `
    )
    .join('');
}

function populateCampaignSelect(campaigns) {
  const select = document.getElementById('lead-campaign-select');
  if (!select) return;
  select.innerHTML = '<option value="">Default High-Velocity Campaign</option>' + campaigns.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

async function loadEvents() {
  try {
    const res = await fetchWithAuth('/api/events?limit=50');
    const data = await res.json();
    if (data.success) {
      currentEvents = data.data;
      renderEvents(data.data);
    }
  } catch (err) {
    console.error('Failed to load events:', err);
  }
}

function renderEvents(events) {
  const container = document.getElementById('events-stream');
  if (!container) return;

  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📜</div>
        <h3>Audit Ledger Empty</h3>
        <p>No actions have occurred yet. Run AI qualification or simulate an inbound prospect reply to inspect real-time audit logs.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = events
    .map((evt) => {
      const actorColor = evt.actor === 'ai_engine' ? '#8b5cf6' : evt.actor === 'webhook' ? '#06b6d4' : evt.actor === 'operator' ? '#3b82f6' : '#9ca3af';
      return `
      <div class="timeline-item">
        <div class="timeline-item-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="badge" style="background: rgba(255,255,255,0.06); border: 1px solid ${actorColor}; color: ${actorColor};">
              ${evt.actor.toUpperCase()}
            </span>
            <span class="timeline-summary">${escapeHtml(evt.summary)}</span>
          </div>
          <span class="timeline-meta">${new Date(evt.createdAt).toLocaleTimeString()}</span>
        </div>
        <div class="timeline-payload">${escapeHtml(JSON.stringify(evt.payload, null, 2))}</div>
      </div>
    `;
    })
    .join('');
}

// ===================================================
// Interactive Actions (Qualify, Advance, Inspect, Reply)
// ===================================================
async function triggerQualify(leadId) {
  try {
    showToast('Running AI lead qualification...', 'info');
    const res = await fetchWithAuth(`/api/leads/${leadId}/qualify`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Qualification failed');

    showToast(`Qualified: ${data.data.firstName} scored ${data.data.score}/100 [${data.data.intentTier.toUpperCase()}]`, 'success');
    loadAllData();
    if (selectedLeadProfile && selectedLeadProfile.lead.id === leadId) {
      openLeadProfile(leadId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function triggerAdvance(leadId) {
  try {
    const key = `ui_advance_${leadId}_${Date.now()}`;
    showToast('Advancing sequence step & generating copy...', 'info');
    const res = await fetchWithAuth('/api/sequences/advance', {
      method: 'POST',
      headers: {
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ leadId, force: true }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to advance sequence');

    const step = data.data.step;
    showToast(`Step #${step.stepNumber} [${step.name}] dispatched!`, 'success');
    loadAllData();
    if (selectedLeadProfile && selectedLeadProfile.lead.id === leadId) {
      openLeadProfile(leadId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openLeadProfile(leadId) {
  try {
    const res = await fetchWithAuth(`/api/leads/${leadId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Could not load lead profile');

    selectedLeadProfile = data.data;
    const { lead, campaign, sequenceExecutions, inboundReplies, activityLogs } = data.data;

    const modalBody = document.getElementById('lead-profile-body');
    if (!modalBody) return;

    modalBody.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
        <div>
          <h2 style="font-size: 1.35rem; font-weight: 700; color: #fff;">${escapeHtml(lead.firstName)} ${escapeHtml(lead.lastName)}</h2>
          <div style="font-size: 0.9rem; color: var(--text-muted);">${escapeHtml(lead.role)} @ <strong>${escapeHtml(lead.company)}</strong> (${lead.companySize} employees)</div>
          <div style="font-size: 0.8rem; color: #60a5fa; margin-top: 0.2rem;">📧 ${escapeHtml(lead.email)}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.85rem; font-weight: 800; color: ${lead.score >= 80 ? '#10b981' : lead.score >= 50 ? '#f59e0b' : '#ef4444'};">
            ${lead.score}<span style="font-size: 0.9rem; color: var(--text-dim);">/100</span>
          </div>
          <div style="display: flex; gap: 0.35rem; justify-content: flex-end; margin-top: 0.25rem;">
            <span class="badge badge-${lead.status}">${lead.status}</span>
            <span class="badge badge-${lead.intentTier}">${lead.intentTier}</span>
          </div>
        </div>
      </div>

      <!-- Qualification Summary -->
      <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1.25rem;">
        <div style="font-weight: 700; font-size: 0.85rem; color: #93c5fd; text-transform: uppercase; margin-bottom: 0.35rem;">⚡ AI Qualification Reasoning</div>
        <p style="font-size: 0.85rem; color: #f3f4f6;">${escapeHtml(lead.qualificationSummary || 'Not yet qualified by AI engine. Click Qualify to generate score & intent tier.')}</p>
        ${lead.painPoints ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;"><strong>Identified Pain Points:</strong> ${escapeHtml(lead.painPoints)}</div>` : ''}
        ${lead.engagementNotes ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;"><strong>Notes / Touchpoints:</strong> ${escapeHtml(lead.engagementNotes)}</div>` : ''}
      </div>

      <!-- Sequence Outreach History -->
      <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 0.75rem;">📨 Outreach Sequence Executions (${sequenceExecutions.length})</h4>
      ${sequenceExecutions.length === 0 ? '<div style="color: var(--text-dim); font-size: 0.85rem; margin-bottom: 1.25rem;">No sequence steps sent yet.</div>' : `
        <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem;">
          ${sequenceExecutions.map(exec => `
            <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-dim); margin-bottom: 0.35rem;">
                <span style="font-weight: 700; color: #60a5fa;">Step #${exec.stepNumber}: ${escapeHtml(exec.stepName)} (${exec.channel.toUpperCase()})</span>
                <span>${new Date(exec.sentAt).toLocaleString()}</span>
              </div>
              <div style="font-weight: 600; font-size: 0.9rem; color: #fff; margin-bottom: 0.5rem;">Subject: ${escapeHtml(exec.subject)}</div>
              <div style="background-color: var(--bg-primary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.825rem; white-space: pre-wrap; color: #d1d5db;">${escapeHtml(exec.body)}</div>
            </div>
          `).join('')}
        </div>
      `}

      <!-- Inbound Replies -->
      <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 0.75rem;">💬 Inbound Prospect Replies (${inboundReplies.length})</h4>
      ${inboundReplies.length === 0 ? '<div style="color: var(--text-dim); font-size: 0.85rem; margin-bottom: 1.25rem;">No inbound replies received yet.</div>' : `
        <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem;">
          ${inboundReplies.map(rep => `
            <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.35rem;">
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                  <span class="badge badge-${rep.detectedIntent === 'meeting_request' ? 'booked' : rep.detectedIntent === 'unsubscribe' ? 'unsubscribed' : 'replied'}">
                    ${rep.detectedIntent.toUpperCase()}
                  </span>
                  <span style="color: var(--text-muted); font-size: 0.75rem;">Sentiment: ${rep.sentiment}</span>
                </div>
                <span style="color: var(--text-dim);">${new Date(rep.processedAt).toLocaleString()}</span>
              </div>
              <div style="font-style: italic; font-size: 0.875rem; color: #f3f4f6; margin-bottom: 0.5rem; background: rgba(0,0,0,0.25); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);">
                "${escapeHtml(rep.message)}"
              </div>
              <div style="font-size: 0.8rem; color: #60a5fa;"><strong>AI Action:</strong> ${escapeHtml(rep.aiRecommendedAction)}</div>
            </div>
          `).join('')}
        </div>
      `}

      <!-- Lead Audit Trail -->
      <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 0.75rem;">📜 Audit Trail (${activityLogs.length})</h4>
      <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
        ${activityLogs.map(log => `
          <div style="font-size: 0.8rem; padding: 0.5rem 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); border-left: 3px solid #3b82f6;">
            <div style="display: flex; justify-content: space-between; color: var(--text-dim); margin-bottom: 0.15rem;">
              <span>[${log.actor.toUpperCase()}] ${log.eventType}</span>
              <span>${new Date(log.createdAt).toLocaleTimeString()}</span>
            </div>
            <div style="color: #fff; font-weight: 500;">${escapeHtml(log.summary)}</div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('modal-lead-profile')?.classList.add('active');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openSimulateReply(leadId) {
  if (currentLeads.length === 0) {
    showToast('Please create or load leads first before simulating replies.', 'error');
    return;
  }

  const targetId = leadId || currentLeads[0].id;
  const select = document.getElementById('reply-lead-select');
  if (select) {
    select.innerHTML = currentLeads.map((l) => `<option value="${l.id}" ${l.id === targetId ? 'selected' : ''}>${escapeHtml(l.firstName)} ${escapeHtml(l.lastName)} (${escapeHtml(l.company)})</option>`).join('');
  }

  document.getElementById('modal-simulate-reply')?.classList.add('active');
}

function applyPresetReply(type) {
  const textarea = document.getElementById('reply-message-text');
  if (!textarea) return;

  if (type === 'demo') {
    textarea.value = "Sounds very interesting! Can we book a 15-minute demo this Thursday at 2 PM EST? Here is my calendar link or send yours over.";
  } else if (type === 'pricing') {
    textarea.value = "Hi, could you send over your pricing breakdown for a 50-person outbound sales team? Also do you offer annual billing discounts?";
  } else if (type === 'crm') {
    textarea.value = "Does RelayPulse integrate natively with Salesforce and HubSpot, and how does it handle duplicate lead records?";
  } else if (type === 'unsub') {
    textarea.value = "Please unsubscribe me from your emails and do not contact me again.";
  }
}

async function sendSimulatedReply(leadId, message, channel) {
  try {
    const key = `webhook_reply_${leadId}_${Date.now()}`;
    showToast('Routing inbound reply through AI intent classifier...', 'info');

    const res = await fetchWithAuth('/api/webhooks/reply', {
      method: 'POST',
      headers: {
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ leadId, message, channel }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to process reply');

    const analysis = data.data.analysis;
    showToast(`Reply Processed! Intent: ${analysis.intent.toUpperCase()} (${analysis.sentiment})`, 'success');
    document.getElementById('modal-simulate-reply')?.classList.remove('active');
    loadAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===================================================
// UI Utilities
// ===================================================
function formatStatus(status) {
  return (status || '').replace('_', ' ');
}

function formatTime(isoStr) {
  try {
    const date = new Date(isoStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + (date.getMonth() + 1) + '/' + date.getDate();
  } catch {
    return isoStr;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}
