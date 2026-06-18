// ============================================================
// Leaderboard (configurable)
// ============================================================

let _activeTab   = null
let _lbUser      = null
let _configOpen  = false
let _allMetrics  = null
let _allLiftLogs = []

// Available metric options
const METRIC_OPTIONS = [
  { id: 'vertical_jump', label: 'Vertical Jump',      unit: 'in',  higherBetter: true  },
  { id: 'ncm_jump',      label: 'NCM Jump',            unit: 'in',  higherBetter: true  },
  { id: 'cmj',           label: 'CMJ',                 unit: 'in',  higherBetter: true  },
  { id: 'broad_jump',    label: 'Broad Jump',          unit: 'in',  higherBetter: true  },
  { id: 'sprint_10yd',   label: '10yd Sprint',         unit: 'sec', higherBetter: false },
  { id: 'accel_10yd',    label: '10yd Acceleration',   unit: 'sec', higherBetter: false },
  { id: 'fly_10',        label: 'Fly 10',              unit: 'sec', higherBetter: false },
  { id: 'sprint_40yd',   label: '40yd Sprint',         unit: 'sec', higherBetter: false },
  { id: 'sprint_60yd',   label: '60yd Dash',           unit: 'sec', higherBetter: false },
  { id: 'sprint_20yd',   label: '20yd Dash',           unit: 'sec', higherBetter: false },
  { id: 'body_weight',   label: 'Body Weight',         unit: 'lbs', higherBetter: null  },
]

const PRESET_LIFTS = ['Back Squat','Bench Press','Deadlift','Overhead Press','Power Clean']

// Load config from localStorage or use defaults
function getLBConfig() {
  return lsGet('p3_lb_config') || { ...DEFAULT_LEADERBOARD_CONFIG }
}

// Build active tab list from config
function buildTabs(config) {
  const tabs = []
  config.metrics.forEach(id => {
    const m = METRIC_OPTIONS.find(o => o.id === id)
    if (m) tabs.push({ ...m, isLift: false })
  })
  config.lifts.forEach(name => {
    tabs.push({ id: 'lift__' + name, label: name + ' (Est. 1RM)', unit: 'lbs', higherBetter: true, isLift: true, liftName: name })
  })
  return tabs
}

async function initPage(user) {
  _lbUser = user
  _allMetrics  = await getMetrics()
  _allLiftLogs = await getLiftLogs()
  const config = getLBConfig()
  const tabs   = buildTabs(config)
  _activeTab   = tabs[0]?.id || null
  renderLeaderboard(user, tabs)
}

async function getLiftLogs() {
  if (DEMO_MODE) return []
  const { data } = await window._supabase
    .from('workout_logs')
    .select('logged_date, actual_weight, actual_reps, athlete_id, exercise:exercises!exercise_id(name), athlete:profiles!athlete_id(full_name, gender)')
    .not('actual_weight', 'is', null)
    .order('logged_date', { ascending: true })
  return (data || []).map(r => ({
    athlete_id:    r.athlete_id,
    exercise_name: r.exercise?.name || '',
    date:          r.logged_date,
    weight:        r.actual_weight,
    reps:          r.actual_reps || 1,
    athlete:       r.athlete,
  }))
}

// Collect all athlete metrics logged via dashboard/kiosk (stored in localStorage)
function getLocalAthleteMetrics() {
  const results = []
  Object.keys(localStorage).forEach(key => {
    const match = key.match(/^p3_metrics_(.+)_(\d{4}-\d{2}-\d{2})$/)
    if (!match) return
    const athleteId = match[1]
    const date      = match[2]
    const metrics   = lsGet(key) || {}
    Object.entries(metrics).forEach(([metricType, data]) => {
      if (data?.value != null) {
        results.push({
          id:            `ls_${athleteId}_${date}_${metricType}`,
          athlete_id:    athleteId,
          metric_type:   metricType,
          value:         data.value,
          unit:          data.unit,
          recorded_date: date,
        })
      }
    })
  })
  return results
}

// Collect all lift logs for the leaderboard (all-time bests)
function getLocalLiftHistory() {
  const results = []

  // Most-recent session per exercise (p3_lift_history_*) — legacy / compatibility
  Object.keys(localStorage).forEach(key => {
    const match = key.match(/^p3_lift_history_(.+)$/)
    if (!match) return
    const athleteId = match[1]
    const history   = lsGet(key) || {}
    Object.entries(history).forEach(([exerciseName, record]) => {
      if (!record?.sets) return
      const displayName = exerciseName.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      record.sets.forEach(s => {
        if (!s.weight) return
        results.push({
          athlete_id:    athleteId,
          exercise_name: displayName,
          date:          record.date,
          weight:        parseFloat(s.weight),
          reps:          parseInt(s.reps) || 1,
        })
      })
    })
  })

  // Full session log (p3_lift_log_*) — captures every session including historical PRs
  Object.keys(localStorage).forEach(key => {
    const match = key.match(/^p3_lift_log_(.+)$/)
    if (!match) return
    const athleteId = match[1]
    ;(lsGet(key) || []).forEach(e => {
      if (!e.weight) return
      results.push({
        athlete_id:    athleteId,
        exercise_name: e.exercise_name,
        date:          e.date,
        weight:        parseFloat(e.weight),
        reps:          parseInt(e.reps) || 1,
      })
    })
  })

  return results
}

async function getMetrics() {
  if (DEMO_MODE) return [...DEMO_METRICS, ...DEMO_METRIC_HISTORY, ...getLocalAthleteMetrics()]
  const { data } = await window._supabase
    .from('performance_metrics')
    .select('*, athlete:profiles!athlete_id(full_name)')
    .order('recorded_date', { ascending: false })
  return data || []
}

// ── Render ────────────────────────────────────────────────────

function renderLeaderboard(user, tabs) {
  const trainer = isTrainer(user)

  document.getElementById('page-content').innerHTML = `
    <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div>
        <h1>Leaderboard</h1>
        <p>Team rankings across performance metrics and lifts.</p>
      </div>
      ${trainer ? `
        <button onclick="toggleConfig()" id="config-btn"
          style="display:flex;align-items:center;gap:7px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.35);color:#f97316;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.15s;white-space:nowrap;"
          onmouseover="this.style.background='rgba(249,115,22,0.18)'"
          onmouseout="this.style.background='rgba(249,115,22,0.1)'">
          ⚙ Edit Leaderboard
        </button>` : ''}
    </div>

    <!-- Config panel (hidden by default) -->
    <div id="config-panel" style="display:none;"></div>

    <!-- Tabs -->
    <div id="tab-bar" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px;">
      ${renderTabBar(tabs)}
    </div>

    <!-- Board content -->
    <div id="board-content">
      ${tabs.length ? renderBoard(_allMetrics, _activeTab, tabs) : emptyConfigured()}
    </div>
  `
}

function renderTabBar(tabs) {
  return tabs.map(t => `
    <button onclick="switchTab('${t.id}', this)" class="tab-btn ${t.id === _activeTab ? 'active' : ''}"
      style="flex-shrink:0;">
      ${t.label}
    </button>`).join('')
}

function switchTab(tabId, btn) {
  _activeTab = tabId
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  const config = getLBConfig()
  const tabs   = buildTabs(config)
  document.getElementById('board-content').innerHTML = renderBoard(_allMetrics, tabId, tabs)
}

function emptyConfigured() {
  return `<div class="empty-state"><p>No leaderboard categories configured yet. Click ⚙ Configure to set them up.</p></div>`
}

// ── Board renderer ────────────────────────────────────────────

function renderBoard(metrics, tabId, tabs) {
  const tab = tabs.find(t => t.id === tabId)
  if (!tab) return emptyConfigured()

  let rows = []

  if (tab.isLift) {
    // Lift 1RM rankings
    const liftData = DEMO_MODE ? [...DEMO_LIFT_HISTORY, ...getLocalLiftHistory()] : _allLiftLogs
    const bests = getBestLiftPerAthlete(tab.liftName, liftData)
    rows = bests.map(b => ({
      athlete_id:   b.athlete_id,
      value:        b.estimated1RM,
      recorded_date: b.date,
      _subtitle:    `${b.weight} lbs × ${b.reps} reps`,
      athlete:      DEMO_MODE ? getAthleteById(b.athlete_id) : b.athlete,
    }))
  } else {
    // Standard metric rankings
    const filtered = metrics.filter(m => m.metric_type === tabId)
    const bests = {}
    filtered.forEach(m => {
      const prev = bests[m.athlete_id]
      if (!prev) { bests[m.athlete_id] = m; return }
      if (tab.higherBetter === true  && m.value > prev.value) bests[m.athlete_id] = m
      if (tab.higherBetter === false && m.value < prev.value) bests[m.athlete_id] = m
      if (tab.higherBetter === null  && new Date(m.recorded_date) > new Date(prev.recorded_date)) bests[m.athlete_id] = m
    })
    rows = Object.values(bests)
    if (tab.higherBetter === true)  rows.sort((a, b) => b.value - a.value)
    if (tab.higherBetter === false) rows.sort((a, b) => a.value - b.value)
    if (tab.higherBetter === null)  rows.sort((a, b) => new Date(b.recorded_date) - new Date(a.recorded_date))
    if (DEMO_MODE) rows = rows.map(r => ({ ...r, athlete: getAthleteById(r.athlete_id) }))
  }

  if (!rows.length) return `<div class="empty-state"><p>No ${tab.label} data recorded yet.</p></div>`

  const maleRows   = rows.filter(r => r.athlete?.gender === 'male')
  const femaleRows = rows.filter(r => r.athlete?.gender === 'female')
  const otherRows  = rows.filter(r => !['male','female'].includes(r.athlete?.gender))

  const footer = `
    <div style="margin-top:14px;text-align:right;font-size:12px;color:#52525b;">
      ${tab.isLift ? '↑ Higher estimated 1RM is better  ·  Epley formula: weight × (1 + reps/30)' :
        tab.higherBetter === true  ? '↑ Higher is better' :
        tab.higherBetter === false ? '↓ Lower is better (faster)' : 'Showing latest recorded value'}
    </div>`

  const sections = [
    ...( maleRows.length   ? [renderGenderSection('Male',   maleRows,   tab)] : [] ),
    ...( femaleRows.length ? [renderGenderSection('Female', femaleRows, tab)] : [] ),
    ...( otherRows.length  ? [renderGenderSection('Other',  otherRows,  tab)] : [] ),
  ]

  return sections.join('') + footer
}

function renderGenderSection(label, rows, tab) {
  const icon = label === 'Male' ? '♂' : label === 'Female' ? '♀' : '·'
  return `
    <div style="margin-bottom:28px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:13px;color:${label === 'Male' ? '#60a5fa' : label === 'Female' ? '#f472b6' : '#a1a1aa'};">${icon}</span>
        <span style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;">${label}</span>
        <div style="flex:1;height:1px;background:#1c1c1f;"></div>
        <span style="font-size:11px;color:#3f3f46;">${rows.length} athlete${rows.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${rows.map((row, i) => renderRow(row, i + 1, tab)).join('')}
      </div>
    </div>
  `
}

function renderRow(row, rank, tab) {
  const name  = row.athlete?.full_name || row.athlete_id
  const init  = initials(name)
  const isTop = rank <= 3
  const sessions = DEMO_SESSION_COUNTS[row.athlete_id] || '—'
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank

  return `
    <a href="profile.html?id=${row.athlete_id}" style="text-decoration:none;">
      <div class="board-row ${isTop ? 'top-row' : ''}" style="cursor:pointer;">
        <div class="rank-badge rank-${rank <= 3 ? rank : 'other'}">${medal}</div>
        <div class="avatar">${init}</div>
        <div style="flex:1;min-width:0;">
          <div class="athlete-name">${name}</div>
          <div class="athlete-sessions">
            ${row._subtitle ? row._subtitle + '  ·  ' : ''}${sessions} sessions
          </div>
        </div>
        <div style="text-align:right;">
          <div class="metric-value" style="${isTop ? 'color:#f97316;' : ''}">${row.value}</div>
          <div class="metric-unit">${tab.unit}</div>
        </div>
        <div style="text-align:right;min-width:80px;">
          <div style="font-size:12px;color:#71717a;">${fmtDate(row.recorded_date)}</div>
        </div>
      </div>
    </a>
  `
}

// ── Configure Panel ───────────────────────────────────────────

function toggleConfig() {
  _configOpen = !_configOpen
  const panel = document.getElementById('config-panel')
  const btn   = document.getElementById('config-btn')
  if (_configOpen) {
    panel.style.display = 'block'
    panel.innerHTML = buildConfigPanel(getLBConfig())
    btn.textContent = '✕ Close'
    btn.style.color = '#f97316'
    btn.style.borderColor = 'rgba(249,115,22,0.3)'
  } else {
    panel.style.display = 'none'
    btn.textContent = '⚙ Configure'
    btn.style.color = '#a1a1aa'
    btn.style.borderColor = '#2a2a2f'
  }
}

function buildConfigPanel(config) {
  const allLifts = [...new Set([...PRESET_LIFTS, ...config.lifts])]

  return `
    <div style="background:#111113;border:1px solid rgba(249,115,22,0.25);border-radius:14px;padding:20px;margin-bottom:24px;">
      <div style="font-size:14px;font-weight:700;color:white;margin-bottom:16px;">⚙ Configure Leaderboard</div>

      <!-- Metric checkboxes -->
      <div style="margin-bottom:18px;">
        <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Performance Metrics</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${METRIC_OPTIONS.map(m => `
            <label style="display:flex;align-items:center;gap:7px;background:#1c1c1f;border:1px solid ${config.metrics.includes(m.id) ? '#f97316' : '#2a2a2f'};border-radius:8px;padding:7px 12px;cursor:pointer;transition:border-color 0.15s;">
              <input type="checkbox" id="lbm_${m.id}" ${config.metrics.includes(m.id) ? 'checked' : ''}
                onchange="updateLBConfig()" style="accent-color:#f97316;width:14px;height:14px;">
              <span style="font-size:13px;color:#d4d4d8;font-weight:500;">${m.label}</span>
            </label>`).join('')}
        </div>
      </div>

      <!-- Lift checkboxes -->
      <div style="margin-bottom:18px;">
        <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Lift Rankings (Estimated 1RM)</div>
        <div id="lift-checkboxes" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          ${allLifts.map(name => `
            <label style="display:flex;align-items:center;gap:7px;background:#1c1c1f;border:1px solid ${config.lifts.includes(name) ? '#f97316' : '#2a2a2f'};border-radius:8px;padding:7px 12px;cursor:pointer;transition:border-color 0.15s;">
              <input type="checkbox" id="lbl_${name.replace(/\s+/g,'_')}" value="${name.replace(/"/g,'&quot;')}" ${config.lifts.includes(name) ? 'checked' : ''}
                onchange="updateLBConfig()" style="accent-color:#f97316;width:14px;height:14px;">
              <span style="font-size:13px;color:#d4d4d8;font-weight:500;">${name}</span>
            </label>`).join('')}
        </div>
        <!-- Add custom lift -->
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="custom-lift-input" class="form-input" placeholder="Add custom lift…" style="max-width:220px;padding:7px 12px;font-size:13px;">
          <button onclick="addCustomLift()" class="btn-ghost" style="padding:7px 14px;font-size:13px;">+ Add</button>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;">
        <button onclick="saveAndApplyLBConfig()" class="btn-primary" style="padding:10px 28px;">Apply Changes</button>
      </div>
    </div>
  `
}

function addCustomLift() {
  const input = document.getElementById('custom-lift-input')
  const name  = input?.value.trim()
  if (!name) { showToast('Enter a lift name first.', 'error'); return }

  const config    = getLBConfig()
  const allLifts  = [...new Set([...PRESET_LIFTS, ...config.lifts, name])]
  const container = document.getElementById('lift-checkboxes')

  // Append new checkbox
  const wrap = document.createElement('label')
  wrap.style.cssText = 'display:flex;align-items:center;gap:7px;background:#1c1c1f;border:1px solid #f97316;border-radius:8px;padding:7px 12px;cursor:pointer;'
  wrap.innerHTML = `
    <input type="checkbox" id="lbl_${name.replace(/\s+/g,'_')}" value="${name.replace(/"/g,'&quot;')}" checked
      onchange="updateLBConfig()" style="accent-color:#f97316;width:14px;height:14px;">
    <span style="font-size:13px;color:#d4d4d8;font-weight:500;">${escapeHtml(name)}</span>
  `
  container.appendChild(wrap)
  input.value = ''
  updateLBConfig()
}

function updateLBConfig() {
  // Update border color on checked items
  document.querySelectorAll('#config-panel input[type=checkbox]').forEach(cb => {
    const label = cb.closest('label')
    if (label) label.style.borderColor = cb.checked ? '#f97316' : '#2a2a2f'
  })
}

function saveAndApplyLBConfig() {
  const metrics = METRIC_OPTIONS
    .filter(m => document.getElementById(`lbm_${m.id}`)?.checked)
    .map(m => m.id)

  const checkedLifts = [...new Set([...PRESET_LIFTS,
    ...Array.from(document.querySelectorAll('#lift-checkboxes input[type=checkbox]'))
            .map(cb => cb.value || cb.id.replace('lbl_','').replace(/_/g,' '))])]
  const lifts = checkedLifts.filter(name => {
    const cbId = 'lbl_' + name.replace(/\s+/g,'_')
    return document.getElementById(cbId)?.checked
  })

  if (!metrics.length && !lifts.length) {
    showToast('Select at least one item.', 'error'); return
  }

  const config = { metrics, lifts }
  lsSet('p3_lb_config', config)

  const tabs = buildTabs(config)
  _activeTab = tabs[0]?.id || null

  document.getElementById('tab-bar').innerHTML = renderTabBar(tabs)
  document.getElementById('board-content').innerHTML = tabs.length
    ? renderBoard(_allMetrics, _activeTab, tabs)
    : emptyConfigured()

  toggleConfig()
  showToast('Leaderboard updated!', 'success')
}
