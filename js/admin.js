// ============================================================
// Admin Panel (Trainer Only)
// ============================================================

let _adminUser         = null
let _exerciseCount     = 1
let _editingWorkoutId  = null
let _editingGroupId    = null
let _adminAthletes     = []
let _openGroupStatsId  = null

// Program overview state
let _programView  = 'list'   // 'list' | 'detail'
let _adminProgWeekOffset = 0  // week offset for Program Workout scheduler
let _activeMc     = null
let _activeMcWeek = 1
let _newMcWeeks   = 4
let _expandedCell = null     // { week, day } — open exercise panel
let _mcExCount    = 0

const MC_DAY_KEYS  = ['mon','tue','wed','thu','fri']
const MC_DAY_ABBR  = ['Mon','Tue','Wed','Thu','Fri']
const INTENSITY_OPTS = [
  { key: 'rest', label: 'Rest', color: '#52525b' },
  { key: 'low',  label: 'Low',  color: '#3b82f6' },
  { key: 'med',  label: 'Med',  color: '#f59e0b' },
  { key: 'high', label: 'High', color: '#f97316' },
]

async function initPage(user) {
  _adminUser     = user
  const athletes = await getAthletes()
  _adminAthletes = athletes
  const metrics  = DEMO_MODE ? DEMO_METRICS : await fetchMetrics()
  renderAdmin(user, athletes, metrics)

  // Handle deep-link from "Edit Workout" button on dashboard
  const params   = new URLSearchParams(window.location.search)
  const tabParam = params.get('tab')
  const editId   = params.get('edit')
  if (tabParam) switchTab(tabParam)
  if (editId)   loadWorkoutForEdit(editId)

  // Auto-refresh athletes/group-stats panels when athletes save logs from another tab
  window.addEventListener('storage', e => {
    if (!e.key) return
    const isLiftLog   = e.key.startsWith('p3_lift_log_')
    const isMetric    = e.key.startsWith('p3_metrics_')
    const isAttend    = e.key === 'p3_attendance'
    if (!isLiftLog && !isMetric && !isAttend) return
    // Refresh the Athletes panel (group stats) if it's currently visible
    const athletesPanel = document.getElementById('panel_athletes')
    if (athletesPanel && athletesPanel.style.display !== 'none') {
      athletesPanel.innerHTML = renderAthletes(_adminAthletes)
    }
    // Refresh the prog-week-nav so new workouts appear instantly
    refreshProgWeekNav()
  })
}

async function getAthletes() {
  if (DEMO_MODE) {
    const local = lsGet('p3_demo_athletes') || []
    return [...DEMO_ATHLETES, ...local]
  }
  const { data } = await window._supabase
    .from('profiles').select('*').eq('role', 'athlete').order('full_name')
  return data || []
}

async function fetchMetrics() {
  const { data } = await window._supabase
    .from('performance_metrics')
    .select('*, athlete:profiles!athlete_id(full_name)')
    .order('recorded_date', { ascending: false })
  return data || []
}

// ── Main render ───────────────────────────────────────────────

function renderAdmin(_user, athletes, metrics) {
  _exerciseCount = 1

  document.getElementById('page-content').innerHTML = `
    <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div>
        <h1>Admin Panel</h1>
        <p>Program workouts, track athletes, and manage your roster.</p>
      </div>
      <a href="kiosk.html" target="_blank"
        style="display:inline-flex;align-items:center;gap:7px;padding:10px 18px;background:#1c1c1f;border:1px solid #27272a;border-radius:10px;color:#a1a1aa;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap;transition:all 0.15s;"
        onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
        onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">
        📲 Open Rack Station
      </a>
    </div>

    <div class="admin-tabs-bar" style="display:flex;gap:0;margin-bottom:28px;border-bottom:1px solid #1c1c1f;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
      ${[
        { id: 'overview',     label: '📊 Overview'        },
        { id: 'program',      label: '📋 Program Workout' },
        { id: 'programs',     label: '📅 Programs'        },
        { id: 'athletes',     label: '👥 Athletes'        },
        { id: 'leaderboard',  label: '🏆 Leaderboard'     },
      ].map(t => `
        <button id="tab_${t.id}" onclick="switchTab('${t.id}')"
          class="admin-tab"
          style="background:none;border:none;font-size:14px;font-weight:600;padding:10px 18px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color 0.15s,border-color 0.15s;white-space:nowrap;color:#71717a;">
          ${t.label}
        </button>`).join('')}
    </div>

    <div id="panel_overview">${renderOverview(athletes, metrics)}</div>
    <div id="panel_program"      style="display:none;">${renderProgramForm(athletes)}</div>
    <div id="panel_programs"     style="display:none;"></div>
    <div id="panel_athletes"     style="display:none;">${renderAthletes(athletes)}</div>
    <div id="panel_leaderboard"  style="display:none;">${renderLeaderboardConfig()}</div>
  `

  const s = document.createElement('style')
  s.textContent = `.admin-tab.active { color:white !important; border-bottom-color:#f97316 !important; }`
  document.head.appendChild(s)

  switchTab('overview')
}

function switchTab(id) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'))
  const btn = document.getElementById(`tab_${id}`)
  if (btn) btn.classList.add('active')
  ;['overview','program','programs','athletes','leaderboard'].forEach(a => {
    const el = document.getElementById(`panel_${a}`)
    if (el) el.style.display = a === id ? 'block' : 'none'
  })
  if (id === 'programs')    renderProgramsPanel()
  if (id === 'leaderboard') document.getElementById('panel_leaderboard').innerHTML = renderLeaderboardConfig()
}

// ── Overview ──────────────────────────────────────────────────

function renderOverview(athletes, metrics) {
  if (!athletes.length) return `<div class="empty-state"><p>No athletes added yet.</p></div>`

  return `
    <div class="section-label">${athletes.length} Athletes</div>
    ${athletes.map(a => {
      const m = metrics.filter(x => x.athlete_id === a.id)
      const bw = m.find(x => x.metric_type === 'body_weight')?.value
      const vj = m.find(x => x.metric_type === 'vertical_jump')?.value
      const sp = m.find(x => x.metric_type === 'sprint_40yd')?.value
      const sess = DEMO_SESSION_COUNTS[a.id] || 0
      return `
        <a href="profile.html?id=${a.id}" style="text-decoration:none;display:block;">
          <div class="athlete-row" style="cursor:pointer;transition:border-color 0.15s;"
            onmouseover="this.style.borderColor='rgba(249,115,22,0.3)'"
            onmouseout="this.style.borderColor='#27272a'">
            <div class="avatar">${initials(a.full_name)}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:15px;font-weight:600;color:white;">${a.full_name}</div>
              <div style="font-size:12px;color:#71717a;">${a.email} · ${sess} sessions</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              ${bw ? statPill(bw, 'lbs', 'Weight') : ''}
              ${vj ? statPill(vj, 'in',  'Jump')   : ''}
              ${sp ? statPill(sp, 's',   '40yd')   : ''}
              <span style="font-size:11px;color:#52525b;white-space:nowrap;">View Profile →</span>
            </div>
          </div>
        </a>`
    }).join('')}
  `
}

function statPill(val, unit, label) {
  return `<div class="stat-pill">
    <div class="val">${val}<span style="font-size:10px;color:#71717a;"> ${unit}</span></div>
    <div class="lbl">${label}</div>
  </div>`
}

// ── Program Workout ───────────────────────────────────────────

// Return the workout visible to a given assignee on a given date.
// assignTo = '' (none) | athlete_id | 'group:GROUP_ID'
function getWorkoutForAssigneeOnDate(assignTo, date, all) {
  if (!assignTo) return null
  if (assignTo.startsWith('group:')) {
    const groupId = assignTo.slice(6)
    return all.find(w => w.scheduled_date === date && w.group_id === groupId) || null
  }
  // Individual athlete: athlete-specific → their groups → all-athletes fallback
  const myGroupIds = getGroups()
    .filter(g => g.athlete_ids.includes(assignTo))
    .map(g => g.id)
  return all.find(w => w.scheduled_date === date && w.athlete_id === assignTo)
      || all.find(w => w.scheduled_date === date && w.group_id && myGroupIds.includes(w.group_id))
      || all.find(w => w.scheduled_date === date && !w.athlete_id && !w.group_id)
      || null
}

function buildProgWeekNav() {
  const dates    = getWeekDatesForOffset(_adminProgWeekOffset)
  const all      = [...DEMO_WORKOUTS, ...(lsGet('p3_demo_workouts') || [])]
  const fmt      = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const wkLabel  = _adminProgWeekOffset === 0 ? 'This Week'
                 : _adminProgWeekOffset < 0
                   ? `${Math.abs(_adminProgWeekOffset)} Week${Math.abs(_adminProgWeekOffset) > 1 ? 's' : ''} Ago`
                   : `${_adminProgWeekOffset} Week${_adminProgWeekOffset > 1 ? 's' : ''} Ahead`

  const assignTo        = document.getElementById('w-athlete')?.value || ''
  const currentInputDate = document.getElementById('w-date')?.value   || ''

  // Resolve label for the subtitle
  const subLabel = (() => {
    if (!assignTo) return null
    if (assignTo.startsWith('group:')) {
      const g = getGroups().find(x => x.id === assignTo.slice(6))
      return g ? `👥 ${g.name}` : null
    }
    const a = _adminAthletes.find(x => x.id === assignTo)
    return a ? a.full_name : null
  })()

  const dayCells = dates.map((date, i) => {
    const wx       = assignTo ? getWorkoutForAssigneeOnDate(assignTo, date, all) : null
    const isActive = currentInputDate === date
    const isToday  = date === TODAY
    const dateNum  = new Date(date + 'T00:00:00').getDate()
    return `
      <button onclick="selectProgramDate('${date}')"
        style="flex:1;padding:9px 4px;border-radius:11px;cursor:pointer;text-align:center;min-width:0;
          background:${isActive ? '#f97316' : isToday ? 'rgba(249,115,22,0.06)' : '#18181b'};
          border:2px solid ${isActive ? '#f97316' : isToday ? 'rgba(249,115,22,0.3)' : '#27272a'};
          transition:all 0.15s;"
        onmouseover="if('${date}'!=='${currentInputDate}')this.style.borderColor='rgba(249,115,22,0.4)'"
        onmouseout="if('${date}'!=='${currentInputDate}')this.style.borderColor='${isToday ? 'rgba(249,115,22,0.3)' : '#27272a'}'">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;
          color:${isActive ? 'rgba(255,255,255,0.75)' : '#71717a'}">${MC_DAY_ABBR[i]}</div>
        <div style="font-size:17px;font-weight:900;line-height:1.2;margin:2px 0;
          color:${isActive ? 'white' : isToday ? '#f97316' : '#d4d4d8'}">${dateNum}</div>
        <div style="font-size:9px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 3px;
          color:${isActive ? 'rgba(255,255,255,0.65)' : wx ? '#22c55e' : '#3f3f46'}">
          ${wx ? '✓ ' + wx.title : (assignTo ? '+  Add' : '—')}
        </div>
      </button>`
  }).join('')

  return `
    <div id="prog-week-nav" style="background:#111113;border:1px solid ${assignTo ? 'rgba(249,115,22,0.25)' : '#27272a'};border-radius:14px;padding:14px;margin-bottom:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <button onclick="changeAdminProgWeek(-1)"
          style="display:flex;align-items:center;gap:5px;background:#18181b;border:1px solid #27272a;color:#a1a1aa;border-radius:9px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;"
          onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
          onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">← Prev</button>
        <div style="text-align:center;">
          <div style="font-size:14px;font-weight:700;color:${_adminProgWeekOffset === 0 ? '#f97316' : 'white'};">${wkLabel}</div>
          <div style="font-size:11px;color:#52525b;margin-top:1px;">${fmt(dates[0])} – ${fmt(dates[4])}</div>
          ${subLabel
            ? `<div style="font-size:11px;font-weight:700;color:#f97316;margin-top:4px;">📋 ${subLabel}</div>`
            : `<div style="font-size:11px;color:#3f3f46;margin-top:4px;">Select an athlete to view their schedule</div>`}
        </div>
        <button onclick="changeAdminProgWeek(1)"
          style="display:flex;align-items:center;gap:5px;background:#18181b;border:1px solid #27272a;color:#a1a1aa;border-radius:9px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;"
          onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
          onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">Next →</button>
      </div>
      <div style="display:flex;gap:5px;">${dayCells}</div>
    </div>`
}

function changeAdminProgWeek(delta) {
  _adminProgWeekOffset += delta
  refreshProgWeekNav()
  // If the current date input is outside the new week, move to Monday of new week
  const dates     = getWeekDatesForOffset(_adminProgWeekOffset)
  const dateInput = document.getElementById('w-date')
  if (dateInput && !dates.includes(dateInput.value)) {
    dateInput.value = dates[0]
  }
}

function selectProgramDate(date) {
  const dateInput = document.getElementById('w-date')
  if (dateInput) dateInput.value = date
  refreshProgWeekNav()

  // Auto-load an existing workout for this date + selected assignee
  if (!_editingWorkoutId) {
    const all      = [...DEMO_WORKOUTS, ...(lsGet('p3_demo_workouts') || [])]
    const assignTo = document.getElementById('w-athlete')?.value || ''
    const existing = getWorkoutForAssigneeOnDate(assignTo, date, all)
    if (existing) {
      showToast(`Loading "${existing.title}" for editing…`, 'success')
      loadWorkoutForEdit(existing.id)
    }
  }
}

function refreshProgWeekNav() {
  const el = document.getElementById('prog-week-nav')
  if (!el) return
  const tmp = document.createElement('div')
  tmp.innerHTML = buildProgWeekNav()
  el.replaceWith(tmp.firstElementChild)
}

function renderProgramForm(athletes) {
  return `
    <div style="max-width:700px;">
      ${buildProgWeekNav()}
      <div class="section-label">Workout Details</div>
      <div class="card" style="margin-bottom:20px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
          <div>
            <label class="form-label">Date</label>
            <input type="date" id="w-date" class="form-input" value="${TODAY}">
          </div>
          <div>
            <label class="form-label">Assign To</label>
            <select id="w-athlete" class="form-select" onchange="refreshProgWeekNav()">
              <option value="">All Athletes</option>
              ${(() => {
                const groups = getGroups()
                const groupOpts = groups.length
                  ? `<optgroup label="─── Groups ───">
                      ${groups.map(g => `<option value="group:${g.id}">👥 ${g.name} (${g.athlete_ids.length})</option>`).join('')}
                     </optgroup>`
                  : ''
                const athleteOpts = `<optgroup label="─── Individual Athletes ───">
                  ${athletes.map(a => `<option value="${a.id}">${a.full_name}</option>`).join('')}
                </optgroup>`
                return groupOpts + athleteOpts
              })()}
            </select>
          </div>
        </div>
        <div style="margin-bottom:14px;">
          <label class="form-label">Workout Title</label>
          <input type="text" id="w-title" class="form-input" placeholder="e.g. Lower Body Power">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label class="form-label">Description (optional)</label>
            <input type="text" id="w-desc" class="form-input" placeholder="Brief summary">
          </div>
          <div>
            <label class="form-label">Trainer Notes (optional)</label>
            <input type="text" id="w-notes" class="form-input" placeholder="Rest protocols, cues, etc.">
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div class="section-label" style="margin:0;">Exercises</div>
        <button onclick="addExerciseRow()" class="btn-ghost" style="display:flex;align-items:center;gap:6px;">
          ${plusIcon()} Add Exercise
        </button>
      </div>

      <div id="exercise-list">
        ${buildExerciseRow(1)}
      </div>

      <div style="margin-top:20px;display:flex;justify-content:flex-end;">
        <button onclick="saveWorkout()" class="btn-primary" style="padding:13px 36px;font-size:15px;">
          Save Workout
        </button>
      </div>
    </div>
  `
}

function buildExerciseRow(num) {
  return `
    <div id="ex_row_${num}" style="background:#1c1c1f;border:1px solid #2a2a2f;border-radius:12px;padding:14px;margin-bottom:6px;transition:border-color 0.15s;">

      <!-- Row 1: group + name + suggest -->
      <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:10px;">
        <div style="width:68px;flex-shrink:0;">
          <label class="form-label">Group</label>
          <select id="ex_${num}_group" class="form-select" style="padding:9px 6px;font-size:13px;text-align:center;">
            <option value="">—</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
            <option value="E">E</option>
            <option value="F">F</option>
          </select>
        </div>
        <div style="flex:1;">
          <label class="form-label">Exercise Name</label>
          <input type="text" id="ex_${num}_name" class="form-input" placeholder="e.g. Back Squat"
            oninput="updateSuggestionHeader(${num});autoSetTrackAs(${num})" autocomplete="off">
        </div>
        <button onclick="toggleSuggestion(${num})" id="suggest_btn_${num}"
          style="height:40px;padding:0 14px;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.25);border-radius:10px;color:#f97316;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background 0.15s;"
          onmouseover="this.style.background='rgba(249,115,22,0.15)'"
          onmouseout="this.style.background='rgba(249,115,22,0.08)'">
          💡 Suggest
        </button>
      </div>

      <!-- Row 2: sets / reps / weight / % 1RM / notes / delete -->
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
        <div style="width:72px;">
          <label class="form-label">Sets</label>
          <input type="number" id="ex_${num}_sets" class="form-input" placeholder="4" min="1" style="text-align:center;">
        </div>
        <div style="width:72px;">
          <label class="form-label">Reps</label>
          <input type="number" id="ex_${num}_reps" class="form-input" placeholder="5" min="1" style="text-align:center;">
        </div>
        <div style="width:110px;">
          <label class="form-label">Fixed Wt (lbs)</label>
          <input type="number" id="ex_${num}_weight" class="form-input" placeholder="225" min="0" step="2.5">
        </div>
        <div style="flex:0 0 auto;">
          <label class="form-label" style="white-space:nowrap;">% of 1RM Range</label>
          <div style="display:flex;align-items:center;gap:4px;">
            <input type="number" id="ex_${num}_pct_min" class="form-input" placeholder="70" min="1" max="100" style="width:66px;text-align:center;">
            <span style="color:#71717a;font-size:14px;flex-shrink:0;">–</span>
            <input type="number" id="ex_${num}_pct_max" class="form-input" placeholder="80" min="1" max="100" style="width:66px;text-align:center;">
            <span style="color:#71717a;font-size:11px;flex-shrink:0;">%</span>
          </div>
        </div>
        <div style="flex:2;min-width:140px;">
          <label class="form-label">Notes / Coaching Cue</label>
          <input type="text" id="ex_${num}_notes" class="form-input" placeholder="e.g. Pause at bottom">
        </div>
        ${num > 1
          ? `<button onclick="removeExerciseRow(${num})" class="btn-danger" style="height:40px;padding:0 12px;align-self:flex-end;flex-shrink:0;">${trashIcon()}</button>`
          : `<div style="width:38px;align-self:flex-end;flex-shrink:0;"></div>`}
      </div>

      <!-- Row 3: profile tracking -->
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid #242428;flex-wrap:wrap;">
        <span style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.07em;white-space:nowrap;">Track in Profile:</span>
        <select id="ex_${num}_track_as" class="form-select" style="font-size:12px;padding:6px 10px;min-width:170px;flex-shrink:0;">
          <option value="lift">Lift Progress</option>
          <option value="metric">Performance Metric</option>
          <option value="none">Do not track</option>
        </select>
        <span style="font-size:11px;color:#3f3f46;font-style:italic;">When logged, data will update the athlete's profile automatically.</span>
      </div>
    </div>
  `
}

function addExerciseRow() {
  _exerciseCount++
  const list = document.getElementById('exercise-list')
  const wrapper = document.createElement('div')
  wrapper.innerHTML = buildExerciseRow(_exerciseCount)
  while (wrapper.firstChild) list.appendChild(wrapper.firstChild)
}

function removeExerciseRow(num) {
  document.getElementById(`ex_row_${num}`)?.remove()
  document.getElementById(`suggest_${num}`)?.remove()
}

async function saveWorkout() {
  const title    = document.getElementById('w-title')?.value.trim()
  const date     = document.getElementById('w-date')?.value
  const assignTo = document.getElementById('w-athlete')?.value || ''
  const athlete  = assignTo.startsWith('group:') ? null : (assignTo || null)
  const groupId  = assignTo.startsWith('group:') ? assignTo.slice(6) : null
  const desc     = document.getElementById('w-desc')?.value.trim()
  const notes    = document.getElementById('w-notes')?.value.trim()

  if (!title) { showToast('Please enter a workout title.', 'error'); return }
  if (!date)  { showToast('Please select a date.', 'error'); return }

  const exercises = []
  for (let i = 1; i <= _exerciseCount; i++) {
    const nameEl = document.getElementById(`ex_${i}_name`)
    if (!nameEl) continue
    const name = nameEl.value.trim()
    if (!name) continue
    exercises.push({
      name,
      group:         document.getElementById(`ex_${i}_group`)?.value                  || null,
      sets:          parseInt(document.getElementById(`ex_${i}_sets`)?.value)          || null,
      reps:          parseInt(document.getElementById(`ex_${i}_reps`)?.value)          || null,
      target_weight: parseFloat(document.getElementById(`ex_${i}_weight`)?.value)      || null,
      pct_min:       parseFloat(document.getElementById(`ex_${i}_pct_min`)?.value)     || null,
      pct_max:       parseFloat(document.getElementById(`ex_${i}_pct_max`)?.value)     || null,
      notes:         document.getElementById(`ex_${i}_notes`)?.value.trim()            || null,
      track_as:      document.getElementById(`ex_${i}_track_as`)?.value                || 'lift',
      order_index:   exercises.length,
    })
  }

  if (!exercises.length) { showToast('Add at least one exercise.', 'error'); return }

  // Assign group_order within each letter group
  const groupCounts = {}
  exercises.forEach(ex => {
    if (ex.group) {
      groupCounts[ex.group] = (groupCounts[ex.group] || 0) + 1
      ex.group_order = groupCounts[ex.group]
    }
  })

  if (DEMO_MODE) {
    const saved  = lsGet('p3_demo_workouts') || []
    const exData = exercises.map((ex, i) => ({ ...ex, id: 'de_' + Date.now() + '_' + i }))

    if (_editingWorkoutId) {
      const idx = saved.findIndex(w => w.id === _editingWorkoutId)
      const updated = {
        id: idx >= 0 ? _editingWorkoutId : 'dw_edit_' + Date.now(),
        title, description: desc, scheduled_date: date,
        athlete_id: athlete, group_id: groupId, notes,
        exercises: exData,
      }
      if (idx >= 0) saved[idx] = updated
      else          saved.push(updated)   // override a DEMO_WORKOUT by adding to admin list
      lsSet('p3_demo_workouts', saved)
      _editingWorkoutId = null
      _exerciseCount    = 1
      document.getElementById('panel_program').innerHTML = renderProgramForm(_adminAthletes)
      showToast(`"${title}" updated!`, 'success')
      return
    }

    saved.push({
      id: 'dw_' + Date.now(), title, description: desc, scheduled_date: date,
      athlete_id: athlete, group_id: groupId, notes, exercises: exData,
    })
    lsSet('p3_demo_workouts', saved)
    showToast(`"${title}" saved for ${date}!`, 'success')
    refreshProgWeekNav()
    return
  }

  try {
    // Use the real Supabase auth UUID — guards against a stale demo session in localStorage
    const { data: { user: authUser } } = await window._supabase.auth.getUser()
    if (!authUser?.id) {
      showToast('Session expired — please log out and log back in.', 'error')
      return
    }

    const { data: w, error } = await window._supabase
      .from('workouts')
      .insert({
        title,
        description:    desc     || null,
        scheduled_date: date,
        athlete_id:     athlete  || null,
        group_id:       groupId  || null,
        notes:          notes    || null,
        created_by:     authUser.id,
      })
      .select().single()
    if (error) throw error

    await window._supabase.from('exercises').insert(
      exercises.map(ex => ({
        workout_id:    w.id,
        name:          ex.name,
        'group':       ex.group      || null,
        group_order:   ex.group_order || null,
        sets:          ex.sets        || null,
        reps:          ex.reps        || null,
        target_weight: ex.target_weight || null,
        notes:         ex.notes       || null,
        order_index:   ex.order_index  || 0,
        track_as:      ex.track_as    || null,
      }))
    )
    showToast('Workout programmed!', 'success')
  } catch(e) { showToast(e.message || 'Error saving workout.', 'error') }
}

// ── Edit existing workout ─────────────────────────────────────

async function loadWorkoutForEdit(workoutId) {
  let workout = null
  if (DEMO_MODE) {
    const allWorkouts = [...DEMO_WORKOUTS, ...(lsGet('p3_demo_workouts') || [])]
    workout = allWorkouts.find(w => w.id === workoutId) || null
  } else {
    const { data } = await window._supabase
      .from('workouts').select('*, exercises(*)')
      .eq('id', workoutId).single()
    if (data) {
      // Map DB column names back to the JS object shape the form expects
      workout = {
        ...data,
        exercises: (data.exercises || [])
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
          .map(ex => ({ ...ex, group: ex.group || ex['group'] }))
      }
    }
  }
  if (!workout) { showToast('Workout not found.', 'error'); return }

  _editingWorkoutId = workoutId

  // Pre-fill header fields
  const setVal = (id, val) => { const el = document.getElementById(id); if (el != null && val != null) el.value = val }
  setVal('w-title',   workout.title)
  setVal('w-date',    workout.scheduled_date)
  setVal('w-athlete', workout.group_id ? `group:${workout.group_id}` : (workout.athlete_id || ''))
  setVal('w-desc',    workout.description || '')
  setVal('w-notes',   workout.notes || '')
  // Sync the week nav to show the workout's week and selected athlete
  _adminProgWeekOffset = (() => {
    const d   = new Date(workout.scheduled_date + 'T00:00:00')
    const dow = d.getDay()
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    const workoutMon = d.toISOString().split('T')[0]
    const todayMon   = getWeekDatesForOffset(0)[0]
    return Math.round((new Date(workoutMon) - new Date(todayMon)) / (7 * 24 * 3600 * 1000))
  })()
  refreshProgWeekNav()

  // Rebuild exercise rows
  document.getElementById('exercise-list').innerHTML = ''
  _exerciseCount = 0
  const sorted = [...(workout.exercises || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
  sorted.forEach(ex => {
    _exerciseCount++
    const list    = document.getElementById('exercise-list')
    const wrapper = document.createElement('div')
    wrapper.innerHTML = buildExerciseRow(_exerciseCount)
    while (wrapper.firstChild) list.appendChild(wrapper.firstChild)
    setVal(`ex_${_exerciseCount}_group`,  ex.group         || '')
    setVal(`ex_${_exerciseCount}_name`,   ex.name          || '')
    setVal(`ex_${_exerciseCount}_sets`,   ex.sets          || '')
    setVal(`ex_${_exerciseCount}_reps`,   ex.reps          || '')
    setVal(`ex_${_exerciseCount}_weight`,   ex.target_weight || '')
    setVal(`ex_${_exerciseCount}_pct_min`, ex.pct_min       || '')
    setVal(`ex_${_exerciseCount}_pct_max`,  ex.pct_max   || '')
    setVal(`ex_${_exerciseCount}_notes`,   ex.notes     || '')
    setVal(`ex_${_exerciseCount}_track_as`, ex.track_as || 'lift')
  })

  // Inject edit-mode banner above the "Workout Details" label
  const firstLabel = document.querySelector('#panel_program .section-label')
  if (firstLabel && !document.getElementById('edit-mode-banner')) {
    firstLabel.insertAdjacentHTML('beforebegin', `
      <div id="edit-mode-banner"
        style="background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.3);border-radius:12px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:15px;">✏</span>
          <span style="font-size:13px;font-weight:700;color:#f97316;">Editing: ${workout.title}</span>
          <span style="font-size:12px;color:#71717a;">— ${workout.scheduled_date}</span>
        </div>
        <button onclick="cancelEdit()"
          style="background:#1c1c1f;border:1px solid #27272a;color:#a1a1aa;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;"
          onmouseover="this.style.color='white'" onmouseout="this.style.color='#a1a1aa'">
          Cancel
        </button>
      </div>
    `)
  }

  // Update save button
  const saveBtn = document.querySelector('#panel_program .btn-primary')
  if (saveBtn) saveBtn.textContent = '✏ Update Workout'
}

function cancelEdit() {
  _editingWorkoutId    = null
  _exerciseCount       = 1
  _adminProgWeekOffset = 0
  document.getElementById('panel_program').innerHTML = renderProgramForm(_adminAthletes)
}

// ── Leaderboard Config ────────────────────────────────────────

const LB_METRIC_OPTIONS = [
  { id: 'vertical_jump', label: 'Vertical Jump',     unit: 'in'  },
  { id: 'ncm_jump',      label: 'NCM Jump',           unit: 'in'  },
  { id: 'cmj',           label: 'CMJ',                unit: 'in'  },
  { id: 'broad_jump',    label: 'Broad Jump',         unit: 'in'  },
  { id: 'sprint_10yd',   label: '10yd Sprint',        unit: 'sec' },
  { id: 'accel_10yd',    label: '10yd Acceleration',  unit: 'sec' },
  { id: 'fly_10',        label: 'Fly 10',             unit: 'sec' },
  { id: 'sprint_40yd',   label: '40yd Sprint',        unit: 'sec' },
  { id: 'sprint_60yd',   label: '60yd Dash',          unit: 'sec' },
  { id: 'sprint_20yd',   label: '20yd Dash',          unit: 'sec' },
  { id: 'body_weight',   label: 'Body Weight',        unit: 'lbs' },
]
const LB_PRESET_LIFTS = ['Back Squat','Bench Press','Deadlift','Overhead Press','Power Clean']

function getLBConfig() {
  return lsGet('p3_lb_config') || { ...DEFAULT_LEADERBOARD_CONFIG }
}

function renderLeaderboardConfig() {
  const config   = getLBConfig()
  const allLifts = [...new Set([...LB_PRESET_LIFTS, ...config.lifts])]

  return `
    <div style="max-width:700px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
        <div>
          <div class="section-label" style="margin:0;">Leaderboard Configuration</div>
          <div style="font-size:13px;color:#71717a;margin-top:4px;">Choose which metrics and lifts appear as tabs on the Leaderboard page. Update anytime.</div>
        </div>
        <a href="leaderboard.html"
          style="display:inline-flex;align-items:center;gap:6px;padding:9px 16px;background:#1c1c1f;border:1px solid #27272a;border-radius:10px;color:#a1a1aa;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap;transition:all 0.15s;"
          onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
          onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">
          View Leaderboard →
        </a>
      </div>

      <!-- Performance Metrics -->
      <div class="card" style="margin-bottom:20px;">
        <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">Performance Metrics</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;" id="lb-metric-grid">
          ${LB_METRIC_OPTIONS.map(m => {
            const on = config.metrics.includes(m.id)
            return `
              <label id="lbl_wrap_${m.id}"
                style="display:flex;align-items:center;gap:7px;background:#1c1c1f;border:1px solid ${on ? '#f97316' : '#2a2a2f'};border-radius:9px;padding:8px 14px;cursor:pointer;transition:border-color 0.15s;user-select:none;">
                <input type="checkbox" id="lbm_${m.id}" ${on ? 'checked' : ''}
                  onchange="lbToggleStyle('lbl_wrap_${m.id}',this.checked)"
                  style="accent-color:#f97316;width:15px;height:15px;cursor:pointer;">
                <span style="font-size:13px;color:#d4d4d8;font-weight:500;">${m.label}</span>
                <span style="font-size:11px;color:#52525b;">${m.unit}</span>
              </label>`
          }).join('')}
        </div>
      </div>

      <!-- Lift Rankings -->
      <div class="card" style="margin-bottom:20px;">
        <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">Lift Rankings <span style="font-weight:400;color:#3f3f46;">(estimated 1RM)</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;" id="lb-lift-grid">
          ${allLifts.map(name => {
            const on  = config.lifts.includes(name)
            const cid = 'lbl_' + name.replace(/\s+/g,'_')
            const wid = 'lbl_wrap_' + name.replace(/\s+/g,'_')
            return `
              <label id="${wid}"
                style="display:flex;align-items:center;gap:7px;background:#1c1c1f;border:1px solid ${on ? '#f97316' : '#2a2a2f'};border-radius:9px;padding:8px 14px;cursor:pointer;transition:border-color 0.15s;user-select:none;">
                <input type="checkbox" id="${cid}" ${on ? 'checked' : ''}
                  onchange="lbToggleStyle('${wid}',this.checked)"
                  style="accent-color:#f97316;width:15px;height:15px;cursor:pointer;">
                <span style="font-size:13px;color:#d4d4d8;font-weight:500;">${name}</span>
              </label>`
          }).join('')}
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="lb-custom-lift" class="form-input" placeholder="Add custom lift name…" style="max-width:240px;font-size:13px;">
          <button onclick="lbAddCustomLift()" class="btn-ghost" style="padding:9px 16px;font-size:13px;white-space:nowrap;">+ Add</button>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;">
        <button onclick="saveLBConfig()" class="btn-primary" style="padding:13px 36px;font-size:15px;">
          Save &amp; Apply
        </button>
      </div>
    </div>
  `
}

function lbToggleStyle(wrapperId, checked) {
  const wrap = document.getElementById(wrapperId)
  if (wrap) wrap.style.borderColor = checked ? '#f97316' : '#2a2a2f'
}

function lbAddCustomLift() {
  const input = document.getElementById('lb-custom-lift')
  const name  = input?.value.trim()
  if (!name) { showToast('Enter a lift name.', 'error'); return }

  const cid = 'lbl_' + name.replace(/\s+/g,'_')
  const wid = 'lbl_wrap_' + name.replace(/\s+/g,'_')
  if (document.getElementById(cid)) { showToast('Already added.', 'error'); return }

  const grid = document.getElementById('lb-lift-grid')
  const wrap = document.createElement('label')
  wrap.id = wid
  wrap.style.cssText = 'display:flex;align-items:center;gap:7px;background:#1c1c1f;border:1px solid #f97316;border-radius:9px;padding:8px 14px;cursor:pointer;transition:border-color 0.15s;user-select:none;'
  wrap.innerHTML = `
    <input type="checkbox" id="${cid}" checked
      onchange="lbToggleStyle('${wid}',this.checked)"
      style="accent-color:#f97316;width:15px;height:15px;cursor:pointer;">
    <span style="font-size:13px;color:#d4d4d8;font-weight:500;">${name}</span>
  `
  grid.appendChild(wrap)
  input.value = ''
  showToast(`"${name}" added — click Save to apply.`, 'success')
}

function saveLBConfig() {
  const metrics = LB_METRIC_OPTIONS
    .filter(m => document.getElementById(`lbm_${m.id}`)?.checked)
    .map(m => m.id)

  const config    = getLBConfig()
  const allLifts  = [...new Set([...LB_PRESET_LIFTS, ...config.lifts,
    ...Array.from(document.querySelectorAll('#lb-lift-grid input[type=checkbox]'))
            .map(cb => cb.id.replace('lbl_','').replace(/_/g,' '))])]
  const lifts = allLifts.filter(name => {
    const cb = document.getElementById('lbl_' + name.replace(/\s+/g,'_'))
    return cb?.checked
  })

  if (!metrics.length && !lifts.length) {
    showToast('Select at least one item.', 'error'); return
  }

  lsSet('p3_lb_config', { metrics, lifts })
  showToast('Leaderboard updated! Changes are live.', 'success')
}

// ── Groups ────────────────────────────────────────────────────

function getGroups()              { return lsGet('p3_athlete_groups') || [] }
function saveGroupsList(list)     { lsSet('p3_athlete_groups', list) }

// ── Group Stats ───────────────────────────────────────────────

let _gsActiveKey   = null   // currently active stat box key for the open group
let _gsChart       = null   // Chart.js instance
let _gsConfigOpen  = false

const GROUP_METRIC_DEFS = [
  { id: 'body_weight',   label: 'Body Weight',     unit: 'lbs', color: '#8b5cf6', higherBetter: null  },
  { id: 'vertical_jump', label: 'Vertical Jump',   unit: 'in',  color: '#22c55e', higherBetter: true  },
  { id: 'ncm_jump',      label: 'NCM Jump',        unit: 'in',  color: '#10b981', higherBetter: true  },
  { id: 'cmj',           label: 'CMJ',             unit: 'in',  color: '#ec4899', higherBetter: true  },
  { id: 'sprint_10yd',   label: '10yd Sprint',     unit: 'sec', color: '#0891b2', higherBetter: false },
  { id: 'accel_10yd',    label: '10yd Accel',      unit: 'sec', color: '#3b82f6', higherBetter: false },
  { id: 'fly_10',        label: 'Fly 10',          unit: 'sec', color: '#f59e0b', higherBetter: false },
  { id: 'sprint_40yd',   label: '40yd Sprint',     unit: 'sec', color: '#06b6d4', higherBetter: false },
  { id: 'sprint_60yd',   label: '60yd Dash',       unit: 'sec', color: '#f97316', higherBetter: false },
  { id: 'sprint_20yd',   label: '20yd Dash',       unit: 'sec', color: '#84cc16', higherBetter: false },
]
const GS_PRESET_LIFTS = ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Power Clean']

function getGroupStatsConfig(groupId) {
  const saved = lsGet(`p3_group_stats_config_${groupId}`)
  if (saved) return saved
  return {
    metrics: ['body_weight', 'vertical_jump', 'ncm_jump', 'cmj', 'sprint_10yd', 'fly_10', 'sprint_40yd'],
    lifts:   ['Back Squat', 'Bench Press', 'Deadlift'],
  }
}

// Collect all metric readings for a group, averaged per calendar date
function computeGroupMetricTimeline(groupId, athletes, metricType) {
  const group = getGroups().find(g => g.id === groupId)
  if (!group) return []
  const memberIds = new Set(athletes.filter(a => group.athlete_ids.includes(a.id)).map(a => a.id))
  const byDate = {}

  function addPoint(athleteId, type, value, date) {
    if (!memberIds.has(athleteId) || type !== metricType) return
    if (!byDate[date]) byDate[date] = []
    byDate[date].push(value)
  }

  if (DEMO_MODE) {
    ;[...DEMO_METRICS, ...DEMO_METRIC_HISTORY].forEach(m =>
      addPoint(m.athlete_id, m.metric_type, m.value, m.recorded_date))
  }
  Object.keys(localStorage).forEach(key => {
    const match = key.match(/^p3_metrics_(.+)_(\d{4}-\d{2}-\d{2})$/)
    if (!match) return
    const [, athleteId, date] = match
    if (!memberIds.has(athleteId)) return
    const day = lsGet(key) || {}
    if (day[metricType]?.value != null) addPoint(athleteId, metricType, day[metricType].value, date)
  })

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, avg: vals.reduce((s, v) => s + v, 0) / vals.length }))
}

// Collect best 1RM per athlete per lift log date, then average across the group per date
function computeGroupLiftTimeline(groupId, athletes, liftName) {
  const group = getGroups().find(g => g.id === groupId)
  if (!group) return []
  const members   = athletes.filter(a => group.athlete_ids.includes(a.id))
  const memberIds = new Set(members.map(a => a.id))
  const byDate    = {}

  function addPoint(athleteId, date, est1RM) {
    if (!memberIds.has(athleteId) || est1RM <= 0) return
    if (!byDate[date]) byDate[date] = []
    byDate[date].push(est1RM)
  }

  if (DEMO_MODE) {
    DEMO_LIFT_HISTORY.forEach(e => {
      if (e.exercise_name.toLowerCase() !== liftName.toLowerCase()) return
      const est = e.reps === 1 ? e.weight : Math.round(e.weight * (1 + e.reps / 30))
      addPoint(e.athlete_id, e.date, est)
    })
  }
  members.forEach(a => {
    // Full session log (every save appends here — full timeline)
    ;(lsGet(`p3_lift_log_${a.id}`) || []).forEach(e => {
      if (e.exercise_name.toLowerCase() !== liftName.toLowerCase()) return
      const w = parseFloat(e.weight), r = parseInt(e.reps) || 1
      if (!w) return
      const est = r === 1 ? w : Math.round(w * (1 + r / 30))
      addPoint(a.id, e.date, est)
    })
  })

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, avg: vals.reduce((s, v) => s + v, 0) / vals.length }))
}

// Group averages used for stat-box headline values
function computeGroupStats(groupId, athletes) {
  const group = getGroups().find(g => g.id === groupId)
  if (!group) return null
  const members    = athletes.filter(a => group.athlete_ids.includes(a.id))
  const memberIds  = new Set(members.map(a => a.id))

  const byTypeByAthlete = {}
  function addReading(athleteId, type, value, date) {
    if (!memberIds.has(athleteId)) return
    if (!byTypeByAthlete[type]) byTypeByAthlete[type] = {}
    if (!byTypeByAthlete[type][athleteId]) byTypeByAthlete[type][athleteId] = []
    byTypeByAthlete[type][athleteId].push({ value, date })
  }

  if (DEMO_MODE) {
    ;[...DEMO_METRICS, ...DEMO_METRIC_HISTORY].forEach(m =>
      addReading(m.athlete_id, m.metric_type, m.value, m.recorded_date))
  }
  Object.keys(localStorage).forEach(key => {
    const match = key.match(/^p3_metrics_(.+)_(\d{4}-\d{2}-\d{2})$/)
    if (!match) return
    const [, athleteId, date] = match
    if (!memberIds.has(athleteId)) return
    const day = lsGet(key) || {}
    Object.entries(day).forEach(([type, d]) => {
      if (d?.value != null) addReading(athleteId, type, d.value, date)
    })
  })

  const metricStats = {}
  Object.entries(byTypeByAthlete).forEach(([type, athleteMap]) => {
    const def        = GROUP_METRIC_DEFS.find(d => d.id === type)
    const perAthlete = Object.values(athleteMap).map(readings => {
      const sorted = readings.slice().sort((a, b) => b.date.localeCompare(a.date))
      // headline: best (per higherBetter) or most recent
      let headline
      if (!def || def.higherBetter === null) {
        headline = sorted[0]?.value ?? null
      } else if (def.higherBetter === true) {
        headline = Math.max(...readings.map(r => r.value))
      } else {
        headline = Math.min(...readings.map(r => r.value))
      }
      return { headline, current: sorted[0]?.value ?? null, previous: sorted[1]?.value ?? null }
    })
    const headlineVals = perAthlete.filter(x => x.headline !== null).map(x => x.headline)
    const currVals     = perAthlete.filter(x => x.current  !== null).map(x => x.current)
    const prevVals     = perAthlete.filter(x => x.previous !== null).map(x => x.previous)
    metricStats[type] = {
      headlineAvg: headlineVals.length ? headlineVals.reduce((s, v) => s + v, 0) / headlineVals.length : null,
      currentAvg:  currVals.length     ? currVals.reduce((s, v) => s + v, 0) / currVals.length         : null,
      prevAvg:     prevVals.length     ? prevVals.reduce((s, v) => s + v, 0) / prevVals.length         : null,
      count: currVals.length,
    }
  })

  const athleteLiftBest = {}
  function addLiftBest(athleteId, liftName, est1RM) {
    if (!memberIds.has(athleteId) || est1RM <= 0) return
    if (!athleteLiftBest[liftName]) athleteLiftBest[liftName] = {}
    const prev = athleteLiftBest[liftName][athleteId] || 0
    if (est1RM > prev) athleteLiftBest[liftName][athleteId] = est1RM
  }

  if (DEMO_MODE) {
    DEMO_LIFT_HISTORY.forEach(entry => {
      const est = entry.reps === 1 ? entry.weight : Math.round(entry.weight * (1 + entry.reps / 30))
      addLiftBest(entry.athlete_id, entry.exercise_name, est)
    })
  }
  members.forEach(a => {
    // Most recent session per exercise (fast path for headline values)
    const history = lsGet(`p3_lift_history_${a.id}`) || {}
    Object.entries(history).forEach(([key, record]) => {
      if (!record?.sets) return
      const name = key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      record.sets.forEach(s => {
        const w = parseFloat(s.weight), r = parseInt(s.reps)
        if (!w) return
        const est = r === 1 ? w : Math.round(w * (1 + r / 30))
        addLiftBest(a.id, name, est)
      })
    })
    // Full session log — ensures all-time PRs are captured
    ;(lsGet(`p3_lift_log_${a.id}`) || []).forEach(e => {
      const w = parseFloat(e.weight), r = parseInt(e.reps) || 1
      if (!w) return
      const est = r === 1 ? w : Math.round(w * (1 + r / 30))
      addLiftBest(a.id, e.exercise_name, est)
    })
  })

  const liftAverages = {}
  Object.entries(athleteLiftBest).forEach(([name, map]) => {
    const vals = Object.values(map)
    liftAverages[name] = { avg: vals.reduce((s, v) => s + v, 0) / vals.length, count: vals.length }
  })

  return { members, memberCount: members.length, metricStats, liftAverages }
}

function openGroupStats(groupId) {
  if (_openGroupStatsId !== groupId) {
    // Close any existing chart and config when switching groups
    if (_gsChart) { _gsChart.destroy(); _gsChart = null }
    _gsActiveKey  = null
    _gsConfigOpen = false
  }
  _openGroupStatsId = _openGroupStatsId === groupId ? null : groupId
  document.getElementById('panel_athletes').innerHTML = renderAthletes(_adminAthletes)
}

// ── Stat box (identical to profile's clickableStatBox) ─────────

function gsStatBox(groupId, key, kind, label, value, unit, color) {
  const isActive = _gsActiveKey === `${groupId}_${key}`
  return `
    <div id="gs_statbox_${groupId}_${key}" onclick="gsShowInlineChart('${groupId}','${key}','${kind}')"
      style="background:#18181b;border:1px solid ${isActive ? color : '#27272a'};border-radius:12px;padding:14px 16px;cursor:pointer;transition:border-color 0.15s,box-shadow 0.15s;"
      onmouseover="this.style.borderColor='${color}';this.style.boxShadow='0 0 0 1px ${color}22'"
      onmouseout="this.style.borderColor=(_gsActiveKey==='${groupId}_${key}'?'${color}':'#27272a');this.style.boxShadow=''">
      <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${label}</div>
      <div style="font-size:24px;font-weight:800;color:${color};line-height:1;">${value}<span style="font-size:13px;color:#52525b;font-weight:400;"> ${unit}</span></div>
      <div style="font-size:10px;color:#3f3f46;margin-top:6px;">Tap for chart →</div>
    </div>
  `
}

function gsShowInlineChart(groupId, key, kind) {
  const compositeKey = `${groupId}_${key}`

  // Deselect previous box
  if (_gsActiveKey && _gsActiveKey !== compositeKey) {
    const prevBox = document.getElementById(`gs_statbox_${_gsActiveKey}`)
    if (prevBox) prevBox.style.borderColor = '#27272a'
  }

  const panel = document.getElementById(`gs_chart_panel_${groupId}`)
  if (!panel) return

  // Toggle off if same box clicked again
  if (_gsActiveKey === compositeKey) {
    gsCloseInlineChart(groupId)
    return
  }

  _gsActiveKey = compositeKey
  const box    = document.getElementById(`gs_statbox_${groupId}_${key}`)

  if (_gsChart) { _gsChart.destroy(); _gsChart = null }

  panel.style.display = 'block'
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

  const canvas  = document.getElementById(`gs_chart_canvas_${groupId}`)
  const titleEl = document.getElementById(`gs_chart_title_${groupId}`)
  const subEl   = document.getElementById(`gs_chart_sub_${groupId}`)
  const badgeEl = document.getElementById(`gs_chart_badge_${groupId}`)

  Chart.defaults.color       = '#71717a'
  Chart.defaults.borderColor = '#1c1c1f'

  if (kind === 'metric') {
    const def = GROUP_METRIC_DEFS.find(d => d.id === key)
    if (!def) return
    const timeline = computeGroupMetricTimeline(groupId, _adminAthletes, key)
    if (!timeline.length) { panel.style.display = 'none'; showToast('No data logged for this metric yet.', 'error'); return }

    const labels = timeline.map(p => gsFormatDate(p.date))
    const values = timeline.map(p => p.avg)
    const bestVal = def.higherBetter === true  ? Math.max(...values)
                  : def.higherBetter === false ? Math.min(...values) : null

    if (box) box.style.borderColor = def.color
    titleEl.textContent = `${def.label} — Group Average`
    subEl.textContent   = `${def.unit}  ·  ${def.higherBetter === false ? '↓ Lower is better' : def.higherBetter === true ? '↑ Higher is better' : 'Trend over time'}  ·  Average across all logged athletes each session`
    badgeEl.innerHTML   = bestVal !== null ? `<span class="best-badge">${def.higherBetter === false ? 'Group Best Avg: ' : 'Group Peak Avg: '}${def.unit === 'sec' ? bestVal.toFixed(2) : bestVal.toFixed(1)} ${def.unit}</span>` : ''

    _gsChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: def.color,
          backgroundColor: def.color + '18',
          fill: true, tension: 0.4,
          pointBackgroundColor: def.color, pointRadius: 4, pointHoverRadius: 7,
        }]
      },
      options: gsChartOptions(`Group Avg ${def.label} (${def.unit})`)
    })

  } else {
    const liftName = key.replace(/_/g, ' ')
    const timeline = computeGroupLiftTimeline(groupId, _adminAthletes, liftName)
    if (!timeline.length) { panel.style.display = 'none'; showToast('No lift data for this group yet.', 'error'); return }

    const labels  = timeline.map(p => gsFormatDate(p.date))
    const values  = timeline.map(p => p.avg)
    const best    = Math.max(...values)

    if (box) box.style.borderColor = '#f97316'
    titleEl.textContent = `${liftName} — Group Average 1RM`
    subEl.textContent   = 'Epley formula est. 1RM  ·  Average across group per session'
    badgeEl.innerHTML   = `<span class="best-badge">Group Peak Avg: ${Math.round(best)} lbs</span>`

    _gsChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values.map(v => Math.round(v)),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249,115,22,0.08)',
          fill: true, tension: 0.4,
          pointBackgroundColor: '#f97316', pointRadius: 4, pointHoverRadius: 7,
        }]
      },
      options: gsChartOptions('Group Avg Est. 1RM (lbs)')
    })
  }
}

function gsCloseInlineChart(groupId) {
  if (_gsChart) { _gsChart.destroy(); _gsChart = null }
  if (_gsActiveKey) {
    const prev = document.getElementById(`gs_statbox_${_gsActiveKey}`)
    if (prev) prev.style.borderColor = '#27272a'
    _gsActiveKey = null
  }
  const panel = document.getElementById(`gs_chart_panel_${groupId}`)
  if (panel) panel.style.display = 'none'
}

function gsChartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#18181b', borderColor: '#3f3f46', borderWidth: 1,
        titleColor: '#fafafa', bodyColor: '#a1a1aa', padding: 12,
      }
    },
    scales: {
      x: {
        grid: { color: '#1c1c1f' },
        ticks: { color: '#71717a', font: { size: 11 }, maxTicksLimit: 8 },
        border: { display: false },
      },
      y: {
        grid: { color: '#1c1c1f' },
        ticks: { color: '#71717a', font: { size: 11 } },
        border: { display: false },
        title: { display: true, text: yLabel, color: '#52525b', font: { size: 10 } },
      }
    }
  }
}

function gsFormatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Config panel for group stats ──────────────────────────────

function gsToggleConfig(groupId) {
  const panel = document.getElementById(`gs_config_panel_${groupId}`)
  const btn   = document.getElementById(`gs_config_btn_${groupId}`)
  if (!panel) return
  _gsConfigOpen = !_gsConfigOpen
  if (_gsConfigOpen) {
    const config   = getGroupStatsConfig(groupId)
    const allLifts = [...new Set([...GS_PRESET_LIFTS, ...config.lifts])]
    panel.innerHTML = `
      <div style="background:#0d0d0f;border:1px solid rgba(249,115,22,0.2);border-radius:12px;padding:18px;margin-bottom:16px;animation:suggestIn 0.15s ease;">
        <div style="font-size:13px;font-weight:700;color:white;margin-bottom:14px;">⚙ Configure Stats</div>
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Performance Metrics</div>
          <div style="display:flex;flex-wrap:wrap;gap:7px;">
            ${GROUP_METRIC_DEFS.map(m => `
              <label class="config-check-label" id="gsc_wrap_${groupId}_${m.id}" style="border-color:${config.metrics.includes(m.id) ? '#f97316' : '#2a2a2f'};">
                <input type="checkbox" id="gsc_m_${groupId}_${m.id}" ${config.metrics.includes(m.id) ? 'checked' : ''}
                  onchange="document.getElementById('gsc_wrap_${groupId}_${m.id}').style.borderColor=this.checked?'#f97316':'#2a2a2f'"
                  style="accent-color:#f97316;width:14px;height:14px;cursor:pointer;">
                <span style="font-size:13px;color:#d4d4d8;font-weight:500;">${m.label}</span>
              </label>`).join('')}
          </div>
        </div>
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Lifts (Est. 1RM)</div>
          <div id="gsc_lifts_${groupId}" style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px;">
            ${allLifts.map(name => `
              <label class="config-check-label" id="gsc_lwrap_${groupId}_${name.replace(/\s+/g,'_')}" style="border-color:${config.lifts.includes(name) ? '#f97316' : '#2a2a2f'};">
                <input type="checkbox" id="gsc_l_${groupId}_${name.replace(/\s+/g,'_')}" ${config.lifts.includes(name) ? 'checked' : ''}
                  onchange="document.getElementById('gsc_lwrap_${groupId}_${name.replace(/\s+/g,'_')}').style.borderColor=this.checked?'#f97316':'#2a2a2f'"
                  style="accent-color:#f97316;width:14px;height:14px;cursor:pointer;">
                <span style="font-size:13px;color:#d4d4d8;font-weight:500;">${name}</span>
              </label>`).join('')}
          </div>
          <div style="display:flex;gap:8px;">
            <input type="text" id="gsc_custom_lift_${groupId}" class="form-input" placeholder="Add lift…" style="max-width:200px;font-size:13px;padding:7px 12px;">
            <button onclick="gsAddCustomLift('${groupId}')" class="btn-ghost" style="padding:7px 14px;font-size:13px;white-space:nowrap;">+ Add</button>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button onclick="gsToggleConfig('${groupId}')"
            style="padding:9px 18px;background:#1c1c1f;border:1px solid #27272a;color:#71717a;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>
          <button onclick="gsSaveConfig('${groupId}')" class="btn-primary" style="padding:9px 22px;font-size:13px;">Apply</button>
        </div>
      </div>`
    if (btn) { btn.textContent = '✕ Close'; btn.style.color = '#f97316' }
  } else {
    panel.innerHTML = ''
    if (btn) { btn.textContent = '⚙ Configure'; btn.style.color = '#a1a1aa' }
  }
}

function gsAddCustomLift(groupId) {
  const input = document.getElementById(`gsc_custom_lift_${groupId}`)
  const name  = input?.value.trim()
  if (!name) return
  const container = document.getElementById(`gsc_lifts_${groupId}`)
  const safe      = name.replace(/\s+/g, '_')
  if (document.getElementById(`gsc_l_${groupId}_${safe}`)) { showToast('Already added.', 'error'); return }
  const label = document.createElement('label')
  label.className  = 'config-check-label'
  label.id         = `gsc_lwrap_${groupId}_${safe}`
  label.style.borderColor = '#f97316'
  label.innerHTML  = `
    <input type="checkbox" id="gsc_l_${groupId}_${safe}" checked
      onchange="document.getElementById('gsc_lwrap_${groupId}_${safe}').style.borderColor=this.checked?'#f97316':'#2a2a2f'"
      style="accent-color:#f97316;width:14px;height:14px;cursor:pointer;">
    <span style="font-size:13px;color:#d4d4d8;font-weight:500;">${name}</span>`
  container.appendChild(label)
  input.value = ''
}

function gsSaveConfig(groupId) {
  const metrics = GROUP_METRIC_DEFS
    .filter(m => document.getElementById(`gsc_m_${groupId}_${m.id}`)?.checked)
    .map(m => m.id)

  const config   = getGroupStatsConfig(groupId)
  const allLifts = [...new Set([...GS_PRESET_LIFTS, ...config.lifts,
    ...Array.from(document.querySelectorAll(`#gsc_lifts_${groupId} input[type=checkbox]`))
            .map(cb => cb.id.replace(`gsc_l_${groupId}_`, '').replace(/_/g, ' '))])]
  const lifts = allLifts.filter(name =>
    document.getElementById(`gsc_l_${groupId}_${name.replace(/\s+/g,'_')}`)?.checked
  )

  if (!metrics.length && !lifts.length) { showToast('Select at least one item.', 'error'); return }

  lsSet(`p3_group_stats_config_${groupId}`, { metrics, lifts })
  _gsConfigOpen = false
  if (_gsChart) { _gsChart.destroy(); _gsChart = null }
  _gsActiveKey = null
  document.getElementById('panel_athletes').innerHTML = renderAthletes(_adminAthletes)
  showToast('Group stats updated!', 'success')
}

// ── Main group stats panel (mirrors profile.html layout) ──────

function renderGroupStatsPanel(group, athletes) {
  const config     = getGroupStatsConfig(group.id)
  const stats      = computeGroupStats(group.id, athletes)
  if (!stats) return ''
  const { memberCount, metricStats, liftAverages } = stats

  const metricBoxes = config.metrics.map(type => {
    const def = GROUP_METRIC_DEFS.find(d => d.id === type)
    if (!def) return ''
    const s = metricStats[type]
    if (!s?.count) return ''
    const val  = s.headlineAvg
    const disp = val === null ? '—' : def.unit === 'sec' ? val.toFixed(2) : val.toFixed(1)
    const prefix = def.higherBetter === null ? 'Avg' : 'Group Avg'
    return gsStatBox(group.id, type, 'metric', `${prefix} ${def.label}`, disp, def.unit, def.color)
  }).filter(Boolean)

  const liftBoxes = config.lifts.map(name => {
    const data = liftAverages[name]
    if (!data) return ''
    const key = name.replace(/\s+/g, '_')
    return gsStatBox(group.id, key, 'lift', `${name} Avg 1RM`, Math.round(data.avg), 'lbs', '#f97316')
  }).filter(Boolean)

  const hasBoxes = metricBoxes.length || liftBoxes.length

  return `
    <div style="background:#111113;border:1px solid rgba(249,115,22,0.25);border-top:none;border-radius:0 0 14px 14px;padding:20px;margin-top:-6px;">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
        <div>
          <div style="font-size:13px;font-weight:700;color:#f97316;">📊 Group Averages — ${group.name}</div>
          <div style="font-size:11px;color:#52525b;margin-top:2px;">${memberCount} athletes · click any stat to see the trend chart</div>
        </div>
        <button id="gs_config_btn_${group.id}" onclick="gsToggleConfig('${group.id}')"
          style="display:flex;align-items:center;gap:6px;background:#1c1c1f;border:1px solid #2a2a2f;color:#a1a1aa;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;"
          onmouseover="this.style.color='white'" onmouseout="this.style.color='#a1a1aa'">
          ⚙ Configure
        </button>
      </div>

      <!-- Config panel slot -->
      <div id="gs_config_panel_${group.id}"></div>

      ${!hasBoxes
        ? `<div style="padding:20px;text-align:center;font-size:13px;color:#52525b;">No data logged yet for these metrics. Stats will appear once athletes log their workouts.</div>`
        : `<!-- Stat boxes (identical layout to My Profile) -->
           <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;">
             ${[...metricBoxes, ...liftBoxes].join('')}
           </div>

           <!-- Inline chart panel (appears below boxes when a stat is tapped) -->
           <div id="gs_chart_panel_${group.id}" style="display:none;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:20px 24px;">
             <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:12px;flex-wrap:wrap;">
               <div>
                 <div id="gs_chart_title_${group.id}" style="font-size:15px;font-weight:700;color:white;margin-bottom:3px;">—</div>
                 <div id="gs_chart_sub_${group.id}" style="font-size:12px;color:#71717a;">—</div>
               </div>
               <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
                 <div id="gs_chart_badge_${group.id}"></div>
                 <button onclick="gsCloseInlineChart('${group.id}')"
                   style="background:none;border:none;color:#52525b;font-size:18px;cursor:pointer;padding:8px 10px;line-height:1;"
                   onmouseover="this.style.color='white'" onmouseout="this.style.color='#52525b'">✕</button>
               </div>
             </div>
             <div style="height:220px;position:relative;">
               <canvas id="gs_chart_canvas_${group.id}"></canvas>
             </div>
           </div>`
      }
    </div>
  `
}

function renderGroupsSection(athletes) {
  const groups = getGroups()

  const cards = groups.map(g => {
    const members  = athletes.filter(a => g.athlete_ids.includes(a.id))
    const statsOpen = _openGroupStatsId === g.id
    const cardBorder = statsOpen ? 'rgba(249,115,22,0.4)' : '#27272a'
    const cardRadius = statsOpen ? '14px 14px 0 0' : '12px'
    return `
      <div>
        <div style="background:#111113;border:1px solid ${cardBorder};border-radius:${cardRadius};padding:14px 18px;display:flex;align-items:center;gap:14px;transition:border-color 0.15s;">
          <div style="width:38px;height:38px;border-radius:10px;background:rgba(249,115,22,0.12);border:1px solid rgba(249,115,22,0.3);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">👥</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;color:white;margin-bottom:3px;">${g.name}</div>
            <div style="font-size:12px;color:#71717a;">
              ${members.length} athlete${members.length !== 1 ? 's' : ''}
              ${members.length ? ' · ' + members.map(a => a.full_name.split(' ')[0]).join(', ') : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;">
            <button onclick="openGroupStats('${g.id}')"
              style="padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;
                background:${statsOpen ? 'rgba(249,115,22,0.12)' : '#1c1c1f'};
                border:1px solid ${statsOpen ? 'rgba(249,115,22,0.4)' : '#27272a'};
                color:${statsOpen ? '#f97316' : '#a1a1aa'};"
              onmouseover="this.style.color='#f97316';this.style.borderColor='rgba(249,115,22,0.4)';this.style.background='rgba(249,115,22,0.1)'"
              onmouseout="this.style.color='${statsOpen ? '#f97316' : '#a1a1aa'}';this.style.borderColor='${statsOpen ? 'rgba(249,115,22,0.4)' : '#27272a'}';this.style.background='${statsOpen ? 'rgba(249,115,22,0.12)' : '#1c1c1f'}'">
              📊 Stats
            </button>
            <button onclick="openGroupForm('${g.id}')"
              style="padding:6px 14px;background:#1c1c1f;border:1px solid #27272a;color:#a1a1aa;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;"
              onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
              onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">Edit</button>
            <button onclick="deleteGroup('${g.id}')"
              style="padding:6px 14px;background:#1c1c1f;border:1px solid #27272a;color:#71717a;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;"
              onmouseover="this.style.color='#ef4444';this.style.borderColor='rgba(239,68,68,0.3)'"
              onmouseout="this.style.color='#71717a';this.style.borderColor='#27272a'">Delete</button>
          </div>
        </div>
        ${statsOpen ? renderGroupStatsPanel(g, athletes) : ''}
      </div>`
  }).join('')

  return `
    <div style="margin-bottom:28px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div class="section-label" style="margin:0;">Groups</div>
        <button onclick="openGroupForm(null)" class="btn-primary" style="padding:7px 16px;font-size:13px;display:flex;align-items:center;gap:6px;">
          ${plusIcon()} New Group
        </button>
      </div>

      <div id="group-form-container"></div>

      ${!groups.length
        ? `<div style="padding:20px 24px;background:#111113;border:1px solid #1c1c1f;border-radius:12px;color:#52525b;font-size:13px;text-align:center;">
             No groups yet — create groups to assign workouts to multiple athletes at once.
           </div>`
        : `<div style="display:flex;flex-direction:column;gap:8px;">${cards}</div>`
      }
    </div>
  `
}

function openGroupForm(groupId) {
  _editingGroupId = groupId
  const group     = groupId ? getGroups().find(g => g.id === groupId) : null

  const container = document.getElementById('group-form-container')
  if (!container) return

  const athleteRows = _adminAthletes.map(a => {
    const checked = group?.athlete_ids?.includes(a.id) ? 'checked' : ''
    return `
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 10px;border-radius:8px;transition:background 0.1s;"
        onmouseover="this.style.background='#27272a'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" id="gc_${a.id}" value="${a.id}" ${checked}
          style="width:16px;height:16px;accent-color:#f97316;cursor:pointer;flex-shrink:0;">
        <div style="width:30px;height:30px;border-radius:8px;background:#27272a;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#d4d4d8;flex-shrink:0;">
          ${initials(a.full_name)}
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;color:white;">${a.full_name}</div>
          <div style="font-size:11px;color:#71717a;">${[a.sport, a.grade ? `Grade ${a.grade}` : null].filter(Boolean).join(' · ')}</div>
        </div>
      </label>`
  }).join('')

  container.innerHTML = `
    <div style="background:#111113;border:1px solid rgba(249,115,22,0.3);border-radius:14px;padding:20px;margin-bottom:12px;">
      <div style="font-size:14px;font-weight:700;color:white;margin-bottom:16px;">${group ? `Edit Group — ${group.name}` : 'New Group'}</div>

      <div style="margin-bottom:14px;">
        <label class="form-label">Group Name</label>
        <input type="text" id="group-name-input" class="form-input"
          value="${group?.name || ''}" placeholder="e.g. Varsity, JV, Football">
      </div>

      <div style="margin-bottom:16px;">
        <label class="form-label">Athletes in this group</label>
        <div style="background:#0a0a0b;border:1px solid #27272a;border-radius:10px;padding:8px;max-height:260px;overflow-y:auto;">
          ${athleteRows}
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button onclick="closeGroupForm()"
          style="padding:9px 20px;background:#1c1c1f;border:1px solid #27272a;color:#71717a;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>
        <button onclick="saveGroup()" class="btn-primary" style="padding:9px 24px;font-size:13px;">
          ${group ? 'Update Group' : 'Create Group'}
        </button>
      </div>
    </div>
  `
}

function closeGroupForm() {
  _editingGroupId = null
  const container = document.getElementById('group-form-container')
  if (container) container.innerHTML = ''
}

function saveGroup() {
  const name = document.getElementById('group-name-input')?.value.trim()
  if (!name) { showToast('Enter a group name.', 'error'); return }

  const athleteIds = _adminAthletes
    .filter(a => document.getElementById(`gc_${a.id}`)?.checked)
    .map(a => a.id)

  const groups = getGroups()

  if (_editingGroupId) {
    const idx = groups.findIndex(g => g.id === _editingGroupId)
    if (idx >= 0) groups[idx] = { ...groups[idx], name, athlete_ids: athleteIds }
    showToast(`"${name}" updated!`, 'success')
  } else {
    groups.push({ id: 'g_' + Date.now(), name, athlete_ids: athleteIds })
    showToast(`"${name}" created!`, 'success')
  }

  saveGroupsList(groups)
  _editingGroupId = null
  document.getElementById('panel_athletes').innerHTML = renderAthletes(_adminAthletes)
  // Refresh program form dropdown too
  document.getElementById('panel_program').innerHTML  = renderProgramForm(_adminAthletes)
}

function deleteGroup(groupId) {
  const g = getGroups().find(x => x.id === groupId)
  if (!confirm(`Delete group "${g?.name}"? Workouts assigned to this group will revert to "All Athletes".`)) return
  saveGroupsList(getGroups().filter(x => x.id !== groupId))
  if (_openGroupStatsId === groupId) _openGroupStatsId = null
  document.getElementById('panel_athletes').innerHTML = renderAthletes(_adminAthletes)
  document.getElementById('panel_program').innerHTML  = renderProgramForm(_adminAthletes)
  showToast('Group deleted.', 'success')
}

// ── Athletes ──────────────────────────────────────────────────

function renderAthletes(athletes) {
  return `
    <div>
      ${renderGroupsSection(athletes)}

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div class="section-label" style="margin:0;">${athletes.length} Athletes</div>
        <button onclick="openAthleteModal()" class="btn-primary" style="padding:9px 20px;font-size:13px;display:flex;align-items:center;gap:6px;">
          ${plusIcon()} Add Athlete
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${athletes.map(a => `
          <a href="profile.html?id=${a.id}" style="text-decoration:none;display:block;">
            <div class="athlete-row" style="cursor:pointer;transition:border-color 0.15s;"
              onmouseover="this.style.borderColor='rgba(249,115,22,0.3)'"
              onmouseout="this.style.borderColor='#27272a'">
              <div class="avatar">${initials(a.full_name)}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:600;color:white;">${a.full_name}</div>
                <div style="font-size:12px;color:#71717a;">${a.email || '—'}</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                ${a.athlete_code ? `<span style="font-size:12px;font-weight:800;color:#f97316;letter-spacing:0.1em;font-family:monospace;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.2);border-radius:6px;padding:3px 8px;">${a.athlete_code}</span>` : ''}
                <span class="badge badge-athlete">Athlete</span>
                <span style="font-size:11px;color:#52525b;white-space:nowrap;">View Profile →</span>
                <button onclick="event.preventDefault();event.stopPropagation();deleteAthlete('${a.id}')"
                  title="Delete athlete"
                  style="width:32px;height:32px;border-radius:8px;border:1px solid #27272a;background:#18181b;color:#71717a;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s;"
                  onmouseover="this.style.color='#ef4444';this.style.borderColor='rgba(239,68,68,0.3)';this.style.background='rgba(239,68,68,0.08)'"
                  onmouseout="this.style.color='#71717a';this.style.borderColor='#27272a';this.style.background='#18181b'">
                  ${trashIcon()}
                </button>
              </div>
            </div>
          </a>`).join('')}
      </div>
    </div>
  `
}

function openAthleteModal() {
  // Reset to form view whenever opening
  const form    = document.getElementById('add-athlete-form')
  const success = document.getElementById('add-athlete-success')
  if (form)    form.style.display    = 'block'
  if (success) success.style.display = 'none'
  ;['new-athlete-name','new-athlete-email','new-athlete-password',
    'new-athlete-sport','new-athlete-gender','new-athlete-grade','new-athlete-age']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  document.getElementById('athlete-modal').style.display = 'flex'
}

function closeAthleteModal() {
  document.getElementById('athlete-modal').style.display = 'none'
}

async function _nextAthleteCode() {
  if (DEMO_MODE) {
    const local = lsGet('p3_demo_athletes') || []
    const all   = [...DEMO_ATHLETES, ...local, DEMO_TRAINER]
    const nums  = all
      .map(a => a.athlete_code)
      .filter(c => c && /^\d+$/.test(c))
      .map(c => parseInt(c, 10))
    return String(nums.length ? Math.max(...nums) + 1 : 106).padStart(3, '0')
  }
  const { data } = await window._supabase.from('profiles').select('athlete_code')
  const nums = (data || [])
    .map(p => p.athlete_code)
    .filter(c => c && /^\d+$/.test(c))
    .map(c => parseInt(c, 10))
  return String(nums.length ? Math.max(...nums) + 1 : 106).padStart(3, '0')
}

async function addAthlete() {
  const name   = document.getElementById('new-athlete-name')?.value.trim()
  const email  = document.getElementById('new-athlete-email')?.value.trim().toLowerCase()
  const pass   = document.getElementById('new-athlete-password')?.value || ''
  const sport  = document.getElementById('new-athlete-sport')?.value  || ''
  const gender = document.getElementById('new-athlete-gender')?.value || ''
  const grade  = document.getElementById('new-athlete-grade')?.value  || ''
  const age    = document.getElementById('new-athlete-age')?.value    || ''

  if (!name || !email) { showToast('Name and email are required.', 'error'); return }

  if (DEMO_MODE) {
    const local = lsGet('p3_demo_athletes') || []
    if (local.find(a => a.email?.toLowerCase() === email)) {
      showToast('An account with that email already exists.', 'error'); return
    }

    const code    = await _nextAthleteCode()
    const athlete = {
      id:           'da_' + Date.now(),
      full_name:    name,
      email,
      password:     pass || null,
      role:         'athlete',
      sport:        sport  || null,
      gender:       gender || null,
      grade:        grade  || null,
      age:          age ? parseInt(age) : null,
      athlete_code: code,
      created_at:   TODAY,
    }
    local.push(athlete)
    lsSet('p3_demo_athletes', local)

    document.getElementById('add-athlete-form').style.display    = 'none'
    document.getElementById('add-athlete-success').style.display = 'block'
    document.getElementById('add-athlete-success-name').textContent = name + ' added!'
    document.getElementById('add-athlete-code-display').textContent = code

    _adminAthletes = await getAthletes()
    document.getElementById('panel_athletes').innerHTML = renderAthletes(_adminAthletes)
    document.getElementById('panel_program').innerHTML  = renderProgramForm(_adminAthletes)
    return
  }

  try {
    const code    = await _nextAthleteCode()
    const adminSB = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    const { data: authData, error } = await adminSB.auth.admin.createUser({
      email, password: pass,
      user_metadata: { full_name: name, role: 'athlete' },
      email_confirm: true,
    })
    if (error) throw error

    // Update the auto-created profile with all extra fields
    const { error: profErr } = await window._supabase.from('profiles').update({
      athlete_code: code,
      sport:        sport  || null,
      gender:       gender || null,
      grade:        grade  || null,
      age:          age ? parseInt(age) : null,
    }).eq('id', authData.user.id)
    if (profErr) throw profErr

    document.getElementById('add-athlete-form').style.display    = 'none'
    document.getElementById('add-athlete-success').style.display = 'block'
    document.getElementById('add-athlete-success-name').textContent = name + ' added!'
    document.getElementById('add-athlete-code-display').textContent = code

    _adminAthletes = await getAthletes()
    document.getElementById('panel_athletes').innerHTML = renderAthletes(_adminAthletes)
    document.getElementById('panel_program').innerHTML  = renderProgramForm(_adminAthletes)
  } catch(e) { showToast(e.message || 'Error creating account.', 'error') }
}

function deleteAthlete(id) {
  if (DEMO_MODE) {
    const isBuiltIn = DEMO_ATHLETES.some(a => a.id === id)
    if (isBuiltIn) { showToast('Demo accounts cannot be deleted.', 'error'); return }

    const athlete = (lsGet('p3_demo_athletes') || []).find(a => a.id === id)
    if (!athlete) { showToast('Athlete not found.', 'error'); return }

    if (!confirm(`Delete ${athlete.full_name}?\n\nThis will permanently remove their profile and all associated data.`)) return

    lsSet('p3_demo_athletes', (lsGet('p3_demo_athletes') || []).filter(a => a.id !== id))

    const groups = lsGet('p3_athlete_groups') || []
    groups.forEach(g => { g.athlete_ids = g.athlete_ids.filter(aid => aid !== id) })
    lsSet('p3_athlete_groups', groups)

    lsSet('p3_attendance', (lsGet('p3_attendance') || []).filter(r => r.athlete_id !== id))
    localStorage.removeItem(`p3_lift_history_${id}`)
    Object.keys(localStorage)
      .filter(k => k.startsWith(`p3_logs_${id}_`) || k.startsWith(`p3_metrics_${id}_`))
      .forEach(k => localStorage.removeItem(k))

    _adminAthletes = _adminAthletes.filter(a => a.id !== id)
    document.getElementById('panel_athletes').innerHTML = renderAthletes(_adminAthletes)
    document.getElementById('panel_program').innerHTML  = renderProgramForm(_adminAthletes)
    showToast(`${athlete.full_name} deleted.`, 'success')
    return
  }

  const athlete = _adminAthletes.find(a => a.id === id)
  if (!athlete) { showToast('Athlete not found.', 'error'); return }

  if (!confirm(`Delete ${athlete.full_name}?\n\nThis will permanently remove their account and all data from the server.`)) return

  ;(async () => {
    try {
      const { error } = await window._supabase.rpc('delete_athlete', { p_athlete_id: id })
      if (error) throw error

      _adminAthletes = _adminAthletes.filter(a => a.id !== id)
      document.getElementById('panel_athletes').innerHTML = renderAthletes(_adminAthletes)
      document.getElementById('panel_program').innerHTML  = renderProgramForm(_adminAthletes)
      showToast(`${athlete.full_name} deleted.`, 'success')
    } catch(e) { showToast(e.message || 'Error deleting athlete.', 'error') }
  })()
}

// ── Suggestion Tool ───────────────────────────────────────────

let _activeSuggestRow = null

function toggleSuggestion(num) {
  const existing = document.getElementById(`suggest_${num}`)
  if (existing) { existing.remove(); _activeSuggestRow = null; return }

  // Close any other open panel
  document.querySelectorAll('.suggest-panel').forEach(p => p.remove())

  const name = document.getElementById(`ex_${num}_name`)?.value.trim() || ''
  const cat  = findExerciseCategory(name)
  _activeSuggestRow = num

  const panel = document.createElement('div')
  panel.id = `suggest_${num}`
  panel.className = 'suggest-panel'
  panel.innerHTML = buildSuggestionHTML(num, name, cat)

  const row = document.getElementById(`ex_row_${num}`)
  row.after(panel)

  // Highlight the row
  row.style.borderColor = 'rgba(249,115,22,0.4)'
}

function buildSuggestionHTML(num, name, cat) {
  const altSection = cat
    ? `<div style="margin-bottom:16px;">
        <div style="font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
          Swap Exercise <span style="color:${cat.color};background:${cat.color}18;border:1px solid ${cat.color}30;padding:2px 8px;border-radius:6px;margin-left:4px;">${cat.icon} ${cat.label}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${getAlternatives(cat.key, name).map(ex => `
            <button onclick="applySuggestion(${num}, '${ex.replace(/'/g, "\\'")}')"
              style="background:#1c1c1f;border:1px solid #3f3f46;color:#d4d4d8;border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;transition:all 0.15s;"
              onmouseover="this.style.borderColor='${cat.color}';this.style.color='white';this.style.background='${cat.color}15'"
              onmouseout="this.style.borderColor='#3f3f46';this.style.color='#d4d4d8';this.style.background='#1c1c1f'">
              ${ex}
            </button>`).join('')}
        </div>
      </div>`
    : `<div style="margin-bottom:16px;">
        <div style="font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Browse by Category</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${Object.entries(EXERCISE_LIBRARY).map(([key, c]) => `
            <button onclick="browseCategory(${num}, '${key}')"
              style="background:#1c1c1f;border:1px solid #3f3f46;color:#d4d4d8;border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;transition:all 0.15s;"
              onmouseover="this.style.borderColor='${c.color}';this.style.color='white'"
              onmouseout="this.style.borderColor='#3f3f46';this.style.color='#d4d4d8'">
              ${c.icon} ${c.label}
            </button>`).join('')}
        </div>
      </div>`

  return `
    <div style="background:#111113;border:1px solid rgba(249,115,22,0.3);border-top:none;border-radius:0 0 12px 12px;padding:16px;margin-bottom:6px;">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:white;">
          💡 Suggestions ${name ? `for "<span style='color:#f97316'>${name}</span>"` : ''}
        </div>
        <button onclick="toggleSuggestion(${num})"
          style="background:transparent;border:none;color:#71717a;cursor:pointer;font-size:18px;line-height:1;padding:2px 6px;"
          onmouseover="this.style.color='white'" onmouseout="this.style.color='#71717a'">✕</button>
      </div>

      ${altSection}

      <!-- Rep schemes -->
      <div>
        <div style="font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Rep Scheme Presets</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${REP_SCHEMES.map(s => `
            <button onclick="applyScheme(${num}, ${s.sets}, ${s.reps})"
              title="${s.note}"
              style="background:#1c1c1f;border:1px solid #3f3f46;color:#d4d4d8;border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;transition:all 0.15s;display:flex;flex-direction:column;align-items:center;gap:1px;"
              onmouseover="this.style.borderColor='#f97316';this.style.color='white';this.style.background='rgba(249,115,22,0.1)'"
              onmouseout="this.style.borderColor='#3f3f46';this.style.color='#d4d4d8';this.style.background='#1c1c1f'">
              <span style="font-weight:700;">${s.label}</span>
              <span style="color:#f97316;font-weight:800;font-size:11px;">${s.sets}×${s.reps}</span>
            </button>`).join('')}
        </div>
        <div style="font-size:11px;color:#52525b;margin-top:8px;">Hover a preset to see rest time guidance.</div>
      </div>
    </div>
  `
}

function applySuggestion(num, name) {
  const input = document.getElementById(`ex_${num}_name`)
  if (input) {
    input.value = name
    // Flash the input
    input.style.borderColor = '#f97316'
    setTimeout(() => input.style.borderColor = '', 800)
  }
  // Refresh the panel with new suggestions
  const panel = document.getElementById(`suggest_${num}`)
  if (panel) {
    const cat = findExerciseCategory(name)
    panel.innerHTML = buildSuggestionHTML(num, name, cat)
  }
  showToast(`Swapped to: ${name}`, 'success')
}

function applyScheme(num, sets, reps) {
  const sEl = document.getElementById(`ex_${num}_sets`)
  const rEl = document.getElementById(`ex_${num}_reps`)
  if (sEl) { sEl.value = sets; sEl.style.borderColor = '#f97316'; setTimeout(() => sEl.style.borderColor = '', 800) }
  if (rEl) { rEl.value = reps; rEl.style.borderColor = '#f97316'; setTimeout(() => rEl.style.borderColor = '', 800) }
  showToast(`Set to ${sets}×${reps}`, 'success')
}

function browseCategory(num, catKey) {
  const cat = EXERCISE_LIBRARY[catKey]
  if (!cat) return
  const panel = document.getElementById(`suggest_${num}`)
  if (!panel) return
  const name = document.getElementById(`ex_${num}_name`)?.value.trim() || ''
  panel.innerHTML = buildSuggestionHTML(num, name, { key: catKey, ...cat })
}

function updateSuggestionHeader(num) {
  const panel = document.getElementById(`suggest_${num}`)
  if (!panel) return
  const name = document.getElementById(`ex_${num}_name`)?.value.trim() || ''
  const cat  = findExerciseCategory(name)
  panel.innerHTML = buildSuggestionHTML(num, name, cat)
}

function autoDetectTrackAs(name) {
  if (!name) return null
  const lower = name.toLowerCase().trim()

  // Match a standard performance metric label (e.g. "Vertical Jump")
  for (const meta of Object.values(METRIC_META)) {
    if (meta.label.toLowerCase() === lower) return 'metric'
  }

  // Match a custom exercise that was previously logged as a performance metric
  for (const key of Object.keys(localStorage)) {
    if (!/^p3_metrics_.+_\d{4}-\d{2}-\d{2}$/.test(key)) continue
    for (const exName of Object.keys(lsGet(key) || {})) {
      if (exName.toLowerCase() === lower) return 'metric'
    }
  }

  // Match track_as from an existing programmed workout with the same exercise name
  for (const w of [...DEMO_WORKOUTS, ...(lsGet('p3_demo_workouts') || [])]) {
    for (const ex of (w.exercises || [])) {
      if (ex.name?.toLowerCase() === lower && ex.track_as) return ex.track_as
    }
  }

  // Match an exercise already in any athlete's lift log
  for (const key of Object.keys(localStorage)) {
    if (!/^p3_lift_log_/.test(key)) continue
    for (const entry of (lsGet(key) || [])) {
      if (entry.exercise_name?.toLowerCase() === lower) return 'lift'
    }
  }

  // Match demo lift history (defined in config.js)
  for (const entry of (typeof DEMO_LIFT_HISTORY !== 'undefined' ? DEMO_LIFT_HISTORY : [])) {
    if (entry.exercise_name?.toLowerCase() === lower) return 'lift'
  }

  return null
}

function autoSetTrackAs(num) {
  const nameEl  = document.getElementById(`ex_${num}_name`)
  const trackEl = document.getElementById(`ex_${num}_track_as`)
  if (!nameEl || !trackEl) return
  const detected = autoDetectTrackAs(nameEl.value.trim())
  if (detected) trackEl.value = detected
}

// ── Program Overview ──────────────────────────────────────────

function getMesocycles() { return lsGet('p3_mesocycles') || [] }
function saveMesocyclesList(list) { lsSet('p3_mesocycles', list) }

function renderProgramsPanel() {
  const panel = document.getElementById('panel_programs')
  if (!panel) return
  panel.innerHTML = (_programView === 'detail' && _activeMc)
    ? renderMesocycleDetail(_activeMc)
    : renderMesocycleList(getMesocycles())
}

// ── List view ─────────────────────────────────────────────────

function renderMesocycleList(list) {
  return `
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div>
          <div class="section-label" style="margin:0;">Training Programs</div>
          <div style="font-size:13px;color:#71717a;margin-top:4px;">${list.length} program${list.length !== 1 ? 's' : ''} saved</div>
        </div>
        <button onclick="showNewMesocycleForm()" class="btn-primary" style="padding:10px 20px;font-size:13px;display:flex;align-items:center;gap:6px;">
          ${plusIcon()} New Program
        </button>
      </div>

      <div id="new-mc-form" style="display:none;"></div>

      ${!list.length
        ? `<div class="empty-state" style="padding:60px 24px;text-align:center;">
             <div style="font-size:48px;margin-bottom:16px;">📋</div>
             <div style="font-size:18px;font-weight:700;color:white;margin-bottom:8px;">No Programs Yet</div>
             <div style="font-size:14px;color:#71717a;margin-bottom:20px;">Create your first training block to start planning mesocycles.</div>
             <button onclick="showNewMesocycleForm()" class="btn-primary" style="padding:12px 28px;">+ New Program</button>
           </div>`
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">
             ${list.slice().reverse().map(renderMesocycleCard).join('')}
           </div>`
      }
    </div>
  `
}

function renderMesocycleCard(mc) {
  const dateLabel = mc.start_date
    ? new Date(mc.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No date'

  const weekBars = Array.from({ length: mc.weeks }, (_, i) => {
    const wp = mc.week_plans?.[i + 1] || {}
    const dots = MC_DAY_KEYS.map(d => {
      const int = wp[d]?.intensity || 'rest'
      const col = INTENSITY_OPTS.find(o => o.key === int)?.color || '#27272a'
      return `<div style="width:11px;height:18px;border-radius:3px;background:${col};opacity:0.75;"></div>`
    }).join('')
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <span style="font-size:9px;color:#52525b;font-weight:700;">W${i + 1}</span>
        <div style="display:flex;gap:2px;">${dots}</div>
      </div>`
  }).join('')

  return `
    <div onclick="openMesocycle('${mc.id}')"
      style="background:#111113;border:1px solid #27272a;border-radius:14px;padding:18px;cursor:pointer;transition:all 0.15s;"
      onmouseover="this.style.borderColor='rgba(249,115,22,0.4)';this.style.background='#131315'"
      onmouseout="this.style.borderColor='#27272a';this.style.background='#111113'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:white;margin-bottom:3px;">${mc.name}</div>
          <div style="font-size:12px;color:#71717a;">${dateLabel} &nbsp;·&nbsp; ${mc.weeks} week${mc.weeks !== 1 ? 's' : ''}</div>
        </div>
        <button onclick="event.stopPropagation();deleteMesocycle('${mc.id}')"
          style="width:26px;height:26px;border-radius:7px;border:1px solid #27272a;background:#18181b;color:#52525b;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s;"
          onmouseover="this.style.color='#ef4444';this.style.borderColor='rgba(239,68,68,0.3)'"
          onmouseout="this.style.color='#52525b';this.style.borderColor='#27272a'">×</button>
      </div>
      ${mc.notes ? `<div style="font-size:12px;color:#71717a;margin-bottom:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${mc.notes}</div>` : ''}
      <div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:12px;">${weekBars}</div>
      <div style="font-size:11px;color:#f97316;font-weight:600;">Open →</div>
    </div>
  `
}

// ── Detail view ───────────────────────────────────────────────

function renderMesocycleDetail(mc) {
  const weekTabs = Array.from({ length: mc.weeks }, (_, i) => i + 1).map(w => `
    <button id="meso_tab_${w}" onclick="switchMesoWeek(${w})"
      style="padding:9px 22px;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.15s;
        background:${_activeMcWeek === w ? '#f97316' : 'transparent'};
        color:${_activeMcWeek === w ? 'white' : '#71717a'};">
      Week ${w}
    </button>`).join('')

  const dateLabel = mc.start_date
    ? new Date(mc.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  return `
    <div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;flex-wrap:wrap;">
        <button onclick="backToPrograms()"
          style="display:flex;align-items:center;gap:6px;background:#1c1c1f;border:1px solid #27272a;color:#a1a1aa;border-radius:9px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;white-space:nowrap;"
          onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
          onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">← Programs</button>
        <div style="flex:1;">
          <div style="font-size:22px;font-weight:900;color:white;">${mc.name}</div>
          <div style="font-size:13px;color:#71717a;margin-top:2px;">${mc.weeks} week${mc.weeks !== 1 ? 's' : ''} · ${dateLabel}${mc.notes ? ' · ' + mc.notes : ''}</div>
        </div>
      </div>

      <div style="background:#1c1c1f;border-radius:12px;padding:4px;display:inline-flex;gap:0;margin-bottom:24px;">
        ${weekTabs}
      </div>

      <div id="meso-week-grid">${renderWeekGrid(mc, _activeMcWeek)}</div>

      <div style="display:flex;gap:16px;align-items:center;margin-top:16px;flex-wrap:wrap;">
        <span style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;">Intensity:</span>
        ${INTENSITY_OPTS.map(o => `
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:10px;height:10px;border-radius:3px;background:${o.color};"></div>
            <span style="font-size:12px;color:#71717a;">${o.label}</span>
          </div>`).join('')}
      </div>
    </div>
  `
}

function renderWeekGrid(mc, week) {
  const plan     = mc.week_plans?.[week] || {}
  const expanded = _expandedCell?.week === week ? _expandedCell.day : null

  const grid = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">
      ${MC_DAY_KEYS.map((day, i) => renderDayCard(mc, week, day, i, plan[day] || {}, expanded === day)).join('')}
    </div>`

  const panel = expanded ? renderDayExercisePanel(mc, week, expanded) : ''
  return grid + panel
}

function renderDayCard(mc, week, day, i, cell, isExpanded) {
  const intOpt  = INTENSITY_OPTS.find(o => o.key === cell.intensity) || INTENSITY_OPTS[2]
  const exCount = (cell.exercises || []).length
  const borderColor = isExpanded ? '#f97316' : intOpt.color + '28'
  const topColor    = isExpanded ? '#f97316' : intOpt.color

  return `
    <div style="background:#111113;border:1px solid ${borderColor};border-top:3px solid ${topColor};border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:9px;transition:border-color 0.15s;">
      <div style="font-size:11px;font-weight:800;color:${intOpt.color};text-transform:uppercase;letter-spacing:0.08em;">${MC_DAY_ABBR[i]}</div>

      <input type="text"
        id="cell_${mc.id}_${week}_${day}_focus"
        value="${(cell.focus || '').replace(/"/g, '&quot;')}"
        placeholder="Day focus…"
        oninput="autoSaveCell('${mc.id}',${week},'${day}')"
        style="background:#1c1c1f;border:1px solid #27272a;border-radius:8px;padding:7px 10px;color:white;font-size:12px;font-weight:600;width:100%;outline:none;transition:border-color 0.15s;"
        onfocus="this.style.borderColor='#f97316'" onblur="this.style.borderColor='#27272a'">

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px;">
        ${INTENSITY_OPTS.map(o => `
          <button onclick="setCellIntensity('${mc.id}',${week},'${day}','${o.key}')"
            style="padding:4px 2px;border-radius:6px;border:1px solid ${cell.intensity === o.key ? o.color : '#27272a'};
              background:${cell.intensity === o.key ? o.color + '20' : 'transparent'};
              color:${cell.intensity === o.key ? o.color : '#52525b'};
              font-size:10px;font-weight:700;cursor:pointer;transition:all 0.1s;text-align:center;">
            ${o.label}
          </button>`).join('')}
      </div>

      <textarea
        id="cell_${mc.id}_${week}_${day}_notes"
        placeholder="Notes…"
        oninput="autoSaveCell('${mc.id}',${week},'${day}')"
        style="background:#1c1c1f;border:1px solid #27272a;border-radius:8px;padding:7px 10px;color:#a1a1aa;font-size:11px;resize:none;height:52px;width:100%;outline:none;font-family:inherit;transition:border-color 0.15s;"
        onfocus="this.style.borderColor='#f97316'" onblur="this.style.borderColor='#27272a'">${cell.notes || ''}</textarea>

      <button onclick="toggleDayExercises('${mc.id}',${week},'${day}')"
        style="width:100%;padding:7px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.15s;
          border:1px solid ${isExpanded ? '#f97316' : 'rgba(249,115,22,0.2)'};
          background:${isExpanded ? 'rgba(249,115,22,0.12)' : 'rgba(249,115,22,0.05)'};
          color:${isExpanded ? '#f97316' : '#a1a1aa'};">
        ✏ Exercises${exCount ? ` (${exCount})` : ''}
      </button>
    </div>`
}

// ── Cell save helpers ─────────────────────────────────────────

function autoSaveCell(mcId, week, day) {
  const focus = document.getElementById(`cell_${mcId}_${week}_${day}_focus`)?.value || ''
  const notes = document.getElementById(`cell_${mcId}_${week}_${day}_notes`)?.value || ''
  const list  = getMesocycles()
  const mc    = list.find(m => m.id === mcId)
  if (!mc) return
  if (!mc.week_plans)      mc.week_plans      = {}
  if (!mc.week_plans[week]) mc.week_plans[week] = {}
  mc.week_plans[week][day] = { ...(mc.week_plans[week][day] || {}), focus, notes }
  saveMesocyclesList(list)
  if (_activeMc?.id === mcId) _activeMc = mc
}

function setCellIntensity(mcId, week, day, intensity) {
  const list = getMesocycles()
  const mc   = list.find(m => m.id === mcId)
  if (!mc) return
  if (!mc.week_plans)       mc.week_plans       = {}
  if (!mc.week_plans[week]) mc.week_plans[week] = {}
  mc.week_plans[week][day] = { ...(mc.week_plans[week][day] || {}), intensity }
  saveMesocyclesList(list)
  _activeMc = mc
  document.getElementById('meso-week-grid').innerHTML = renderWeekGrid(mc, week)
}

function switchMesoWeek(week) {
  _activeMcWeek = week
  for (let w = 1; w <= 4; w++) {
    const tab = document.getElementById(`meso_tab_${w}`)
    if (!tab) continue
    tab.style.background = w === week ? '#f97316' : 'transparent'
    tab.style.color      = w === week ? 'white'   : '#71717a'
  }
  document.getElementById('meso-week-grid').innerHTML = renderWeekGrid(_activeMc, week)
}

function openMesocycle(id) {
  _activeMc     = getMesocycles().find(m => m.id === id) || null
  _activeMcWeek = 1
  _programView  = 'detail'
  renderProgramsPanel()
}

function backToPrograms() {
  _programView = 'list'
  _activeMc    = null
  renderProgramsPanel()
}

function deleteMesocycle(id) {
  if (!confirm('Delete this program? This cannot be undone.')) return
  saveMesocyclesList(getMesocycles().filter(m => m.id !== id))
  if (_activeMc?.id === id) backToPrograms()
  else renderProgramsPanel()
  showToast('Program deleted.', 'success')
}

// ── New program form ──────────────────────────────────────────

function showNewMesocycleForm() {
  const container = document.getElementById('new-mc-form')
  if (!container) return
  if (container.style.display !== 'none') { container.style.display = 'none'; return }
  _newMcWeeks = 4
  container.style.display = 'block'
  container.innerHTML = `
    <div style="background:#111113;border:1px solid rgba(249,115,22,0.3);border-radius:14px;padding:20px;margin-bottom:24px;">
      <div style="font-size:14px;font-weight:700;color:white;margin-bottom:16px;">New Training Program</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
        <div>
          <label class="form-label">Program Name</label>
          <input type="text" id="new-mc-name" class="form-input" placeholder="e.g. Summer Block 1">
        </div>
        <div>
          <label class="form-label">Start Date</label>
          <input type="date" id="new-mc-date" class="form-input" value="${TODAY}">
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label class="form-label">Number of Weeks</label>
        <div style="display:flex;gap:8px;">
          ${[1,2,3,4].map(n => `
            <button onclick="selectMcWeeks(${n})" id="mc_weeks_${n}"
              style="flex:1;padding:10px;border-radius:10px;font-size:16px;font-weight:800;cursor:pointer;transition:all 0.15s;
                border:2px solid ${n === 4 ? '#f97316' : '#27272a'};
                background:${n === 4 ? 'rgba(249,115,22,0.1)' : '#1c1c1f'};
                color:${n === 4 ? '#f97316' : '#71717a'};">
              ${n}
            </button>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <label class="form-label">Notes (optional)</label>
        <input type="text" id="new-mc-notes" class="form-input" placeholder="Training goals, phase focus, etc.">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="document.getElementById('new-mc-form').style.display='none'"
          style="padding:10px 20px;background:#1c1c1f;border:1px solid #27272a;color:#71717a;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>
        <button onclick="createMesocycle()" class="btn-primary" style="padding:10px 24px;font-size:13px;">Create Program</button>
      </div>
    </div>
  `
}

function selectMcWeeks(n) {
  _newMcWeeks = n
  ;[1,2,3,4].forEach(w => {
    const b = document.getElementById(`mc_weeks_${w}`)
    if (!b) return
    const on = w === n
    b.style.borderColor = on ? '#f97316' : '#27272a'
    b.style.background  = on ? 'rgba(249,115,22,0.1)' : '#1c1c1f'
    b.style.color       = on ? '#f97316' : '#71717a'
  })
}

function createMesocycle() {
  const name  = document.getElementById('new-mc-name')?.value.trim()
  const date  = document.getElementById('new-mc-date')?.value
  const notes = document.getElementById('new-mc-notes')?.value.trim()
  if (!name) { showToast('Enter a program name.', 'error'); return }

  const mc = {
    id: 'mc_' + Date.now(), name,
    weeks: _newMcWeeks,
    start_date: date || TODAY,
    notes: notes || '',
    created_at: TODAY,
    week_plans: {},
  }
  const list = getMesocycles()
  list.push(mc)
  saveMesocyclesList(list)

  _activeMc     = mc
  _activeMcWeek = 1
  _programView  = 'detail'
  renderProgramsPanel()
  showToast(`"${name}" created!`, 'success')
}

// ── Day exercise panel ────────────────────────────────────────

function toggleDayExercises(mcId, week, day) {
  // Persist all visible focus/notes inputs before re-render
  MC_DAY_KEYS.forEach(d => autoSaveCell(mcId, week, d))

  if (_expandedCell?.week === week && _expandedCell?.day === day) {
    _expandedCell = null
  } else {
    _expandedCell = { week, day }
    _mcExCount    = 0
  }
  document.getElementById('meso-week-grid').innerHTML = renderWeekGrid(_activeMc, week)
}

function renderDayExercisePanel(mc, week, day) {
  const cell     = mc.week_plans?.[week]?.[day] || {}
  const existing = cell.exercises || []
  _mcExCount     = Math.max(existing.length, 1)
  const dayLabel = MC_DAY_ABBR[MC_DAY_KEYS.indexOf(day)]

  const rows = existing.length
    ? existing.map((ex, i) => buildMcExRow(i + 1, ex)).join('')
    : buildMcExRow(1, {})

  return `
    <div style="margin-top:16px;background:#111113;border:1px solid rgba(249,115,22,0.3);border-radius:14px;padding:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <div style="font-size:15px;font-weight:800;color:white;">
          ${dayLabel}
          <span style="color:#71717a;font-weight:500;font-size:13px;"> — Week ${week} Exercises</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="addMcExRow()" class="btn-ghost" style="display:flex;align-items:center;gap:5px;font-size:13px;padding:7px 14px;">
            ${plusIcon()} Add Exercise
          </button>
          <button onclick="saveMcExercises('${mc.id}',${week},'${day}')" class="btn-primary" style="font-size:13px;padding:7px 18px;">
            Save
          </button>
          <button onclick="toggleDayExercises('${mc.id}',${week},'${day}')"
            style="padding:7px 12px;background:#1c1c1f;border:1px solid #27272a;color:#71717a;border-radius:8px;font-size:14px;cursor:pointer;transition:all 0.15s;"
            onmouseover="this.style.color='white'" onmouseout="this.style.color='#71717a'">✕</button>
        </div>
      </div>

      <!-- Copy to Program Workout -->
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
        <button onclick="copyDayToWorkoutForm('${mc.id}',${week},'${day}')"
          style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.25);color:#f97316;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;transition:background 0.15s;"
          onmouseover="this.style.background='rgba(249,115,22,0.15)'"
          onmouseout="this.style.background='rgba(249,115,22,0.08)'">
          📋 Copy to Program Workout
        </button>
      </div>

      <!-- Column headers -->
      <div style="display:grid;grid-template-columns:68px 1fr 56px 56px 90px 130px 1fr 38px;gap:8px;padding:0 4px;margin-bottom:4px;">
        ${['Group','Exercise','Sets','Reps','Wt (lbs)','% of 1RM','Notes / Cue',''].map(h =>
          `<div style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.06em;">${h}</div>`
        ).join('')}
      </div>

      <div id="mc-ex-list">${rows}</div>
    </div>
  `
}

function buildMcExRow(num, ex = {}) {
  return `
    <div id="mc_ex_row_${num}" style="display:grid;grid-template-columns:68px 1fr 56px 56px 90px 130px 1fr 38px;gap:8px;align-items:center;margin-bottom:6px;">
      <select id="mce_${num}_group" class="form-select" style="padding:9px 6px;font-size:13px;text-align:center;">
        <option value="" ${!ex.group ? 'selected' : ''}>—</option>
        ${['A','B','C','D','E','F'].map(g =>
          `<option value="${g}" ${ex.group === g ? 'selected' : ''}>${g}</option>`
        ).join('')}
      </select>
      <input type="text"   id="mce_${num}_name"   class="form-input" value="${ex.name          || ''}" placeholder="e.g. Back Squat">
      <input type="number" id="mce_${num}_sets"   class="form-input" value="${ex.sets          || ''}" placeholder="4" min="1" style="text-align:center;">
      <input type="number" id="mce_${num}_reps"   class="form-input" value="${ex.reps          || ''}" placeholder="5" min="1" style="text-align:center;">
      <input type="number" id="mce_${num}_weight" class="form-input" value="${ex.target_weight || ''}" placeholder="225" min="0" step="2.5">
      <div style="display:flex;align-items:center;gap:3px;">
        <input type="number" id="mce_${num}_pct_min" class="form-input" value="${ex.pct_min || ''}" placeholder="70" min="1" max="100" style="width:56px;text-align:center;">
        <span style="color:#71717a;font-size:12px;padding:0 1px;flex-shrink:0;">–</span>
        <input type="number" id="mce_${num}_pct_max" class="form-input" value="${ex.pct_max || ''}" placeholder="80" min="1" max="100" style="width:56px;text-align:center;">
      </div>
      <input type="text"   id="mce_${num}_notes"  class="form-input" value="${ex.notes        || ''}" placeholder="Coaching cue…">
      ${num > 1
        ? `<button onclick="removeMcExRow(${num})" class="btn-danger" style="height:40px;padding:0 10px;">${trashIcon()}</button>`
        : `<div></div>`}
    </div>
  `
}

function addMcExRow() {
  _mcExCount++
  const list = document.getElementById('mc-ex-list')
  if (!list) return
  const div = document.createElement('div')
  div.innerHTML = buildMcExRow(_mcExCount)
  list.appendChild(div.firstElementChild)
}

function removeMcExRow(num) {
  document.getElementById(`mc_ex_row_${num}`)?.remove()
}

function saveMcExercises(mcId, week, day) {
  const exercises   = []
  const groupCounts = {}
  for (let i = 1; i <= _mcExCount; i++) {
    const nameEl = document.getElementById(`mce_${i}_name`)
    if (!nameEl) continue
    const name = nameEl.value.trim()
    if (!name) continue
    const group = document.getElementById(`mce_${i}_group`)?.value || null
    if (group) groupCounts[group] = (groupCounts[group] || 0) + 1
    exercises.push({
      id:            `mce_${mcId}_${week}_${day}_${i}`,
      name,
      group,
      group_order:   group ? groupCounts[group] : null,
      sets:          parseInt(document.getElementById(`mce_${i}_sets`)?.value)    || null,
      reps:          parseInt(document.getElementById(`mce_${i}_reps`)?.value)    || null,
      target_weight: parseFloat(document.getElementById(`mce_${i}_weight`)?.value)   || null,
      pct_min:       parseFloat(document.getElementById(`mce_${i}_pct_min`)?.value) || null,
      pct_max:       parseFloat(document.getElementById(`mce_${i}_pct_max`)?.value) || null,
      notes:         document.getElementById(`mce_${i}_notes`)?.value.trim()        || null,
      order_index:   exercises.length,
    })
  }

  const list = getMesocycles()
  const mc   = list.find(m => m.id === mcId)
  if (!mc) return
  if (!mc.week_plans)        mc.week_plans        = {}
  if (!mc.week_plans[week])  mc.week_plans[week]  = {}
  mc.week_plans[week][day]   = { ...(mc.week_plans[week][day] || {}), exercises }
  saveMesocyclesList(list)
  _activeMc = mc
  showToast('Exercises saved!', 'success')

  // Refresh card badge count without closing the panel
  const weekPlan = mc.week_plans[week]
  MC_DAY_KEYS.forEach(d => {
    const btn = document.querySelector(`[onclick="toggleDayExercises('${mcId}',${week},'${d}')"]`)
    if (!btn) return
    const cnt = (weekPlan?.[d]?.exercises || []).length
    btn.textContent = `✏ Exercises${cnt ? ` (${cnt})` : ''}`
  })
}

// ── Copy day → Program Workout form ──────────────────────────

function copyDayToWorkoutForm(mcId, week, day) {
  // Save whatever is currently in the exercise panel first
  saveMcExercises(mcId, week, day)

  const mc   = getMesocycles().find(m => m.id === mcId)
  const cell = mc?.week_plans?.[week]?.[day] || {}
  const exes = cell.exercises || []

  if (!exes.length) {
    showToast('Add exercises to this day first.', 'error')
    return
  }

  // Switch to Program Workout tab
  switchTab('program')

  // Pre-fill workout title and notes
  const titleEl = document.getElementById('w-title')
  const notesEl = document.getElementById('w-notes')
  if (titleEl) titleEl.value = cell.focus || `Week ${week} — ${MC_DAY_ABBR[MC_DAY_KEYS.indexOf(day)]}`
  if (notesEl) notesEl.value = cell.notes || ''

  // Clear existing exercise rows and repopulate
  const listEl = document.getElementById('exercise-list')
  if (!listEl) return
  listEl.innerHTML = ''
  _exerciseCount = 0

  exes
    .slice()
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    .forEach(ex => {
      _exerciseCount++
      const wrap = document.createElement('div')
      wrap.innerHTML = buildExerciseRow(_exerciseCount)
      while (wrap.firstChild) listEl.appendChild(wrap.firstChild)

      // Fill the fields
      const n = _exerciseCount
      const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val }
      set(`ex_${n}_name`,   ex.name)
      set(`ex_${n}_group`,  ex.group         || '')
      set(`ex_${n}_sets`,   ex.sets          || '')
      set(`ex_${n}_reps`,   ex.reps          || '')
      set(`ex_${n}_weight`, ex.target_weight || '')
      set(`ex_${n}_notes`,  ex.notes         || '')
    })

  showToast(`${exes.length} exercises copied — set a date and save!`, 'success')
}
