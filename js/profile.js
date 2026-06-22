// ============================================================
// Athlete Profile — progress charts + configurable metrics
// ============================================================

let _profileUser    = null
let _athleteId      = null
let _athlete        = null
let _configOpen     = false
let _activeStatKey  = null
let _inlineChart    = null
let _liftHistory    = []
let _metricHist      = []
let _attMonth        = null  // 'YYYY-MM', lazy-init to current month
let _shownMetricKeys  = []    // metric tab keys currently expanded (1-3)
let _shownLiftNames   = []    // lift names currently expanded (1-3)
let _allLifts         = []    // cached lift list for tab-toggle re-renders
let _shownForAthlete  = null  // tracks which athlete the current selections belong to
let _hiddenLiftNames  = new Set()  // exercise names deleted from this athlete's Lift Progress
let _hiddenMetricKeys = new Set()  // metric keys deleted from this athlete's Performance Metrics
let _liftManageOpen   = false      // manage panel state for Lift section
let _metricManageOpen = false      // manage panel state for Metrics section
let _cachedAttendance = []         // cached once on load; used by month-nav
let _openDayLogDate   = null       // date string of the currently-open day-log panel

function getProfileConfig(athleteId, athlete) {
  const saved = lsGet(`p3_profile_config_${athleteId}`)
  if (saved) return saved
  // Build sport/gender-aware default
  const metrics = ['body_weight', 'vertical_jump', 'ncm_jump', 'cmj',
                   'sprint_10yd', 'accel_10yd', 'fly_10', 'sprint_40yd']
  const sport = athlete?.sport || ''
  const gender = athlete?.gender || ''
  if (sport === 'Baseball' || sport === 'Softball') metrics.push('sprint_60yd')
  if (gender === 'female') metrics.push('sprint_20yd')
  return { metrics, lifts: [] }
}

const METRIC_META = {
  body_weight:   { label: 'Body Weight',        unit: 'lbs', color: '#8b5cf6', note: 'Track body composition over time', higherBetter: null  },
  vertical_jump: { label: 'Vertical Jump',       unit: 'in',  color: '#22c55e', note: 'Max jump height improvement',      higherBetter: true  },
  ncm_jump:      { label: 'NCM Jump',            unit: 'in',  color: '#10b981', note: 'Non-countermovement jump',         higherBetter: true  },
  cmj:           { label: 'CMJ',                 unit: 'in',  color: '#ec4899', note: 'Countermovement jump',             higherBetter: true  },
  sprint_10yd:   { label: '10yd Sprint',         unit: 'sec', color: '#0891b2', note: 'Explosive first-step speed',       higherBetter: false },
  accel_10yd:    { label: '10yd Acceleration',   unit: 'sec', color: '#3b82f6', note: 'First-step quickness',             higherBetter: false },
  fly_10:        { label: 'Fly 10',              unit: 'sec', color: '#f59e0b', note: 'Top-end speed',                    higherBetter: false },
  sprint_40yd:   { label: '40yd Sprint',         unit: 'sec', color: '#06b6d4', note: 'Faster = lower number',            higherBetter: false },
  sprint_60yd:   { label: '60yd Dash',           unit: 'sec', color: '#f97316', note: 'Baseball sprint test',             higherBetter: false },
  sprint_20yd:   { label: '20yd Dash',           unit: 'sec', color: '#84cc16', note: 'Female sprint test',               higherBetter: false },
  broad_jump:    { label: 'Broad Jump',          unit: 'in',  color: '#d946ef', note: 'Horizontal power output',          higherBetter: true  },
}

// ── Entry point ───────────────────────────────────────────────

async function initPage(user) {
  _profileUser = user
  const params = new URLSearchParams(window.location.search)
  const requestedId = params.get('id')

  // Athletes can only view their own profile
  if (!isTrainer(user) && requestedId && requestedId !== user.id) {
    window.location.href = 'profile.html'
    return
  }

  _athleteId = requestedId || user.id

  const athlete = await getAthlete(_athleteId)
  if (!athlete) {
    document.getElementById('page-content').innerHTML =
      `<div class="empty-state"><p>Athlete not found.</p></div>`
    return
  }

  _athlete              = athlete
  const config          = getProfileConfig(_athleteId, athlete)
  _liftHistory          = await getLiftHistory(_athleteId)
  _metricHist           = await getMetricHistory(_athleteId)
  _cachedAttendance     = await getAttendance(_athleteId)

  renderProfile(user, athlete, config, _liftHistory, _metricHist, _cachedAttendance)
}

async function getAthlete(id) {
  if (DEMO_MODE) {
    if (id === DEMO_TRAINER.id) return DEMO_TRAINER
    const local = lsGet('p3_demo_athletes') || []
    return DEMO_ATHLETES.find(a => a.id === id)
        || local.find(a => a.id === id)
        || null
  }
  const { data } = await window._supabase.from('profiles').select('*').eq('id', id).single()
  return data
}

async function getLiftHistory(athleteId) {
  if (DEMO_MODE) {
    const base  = DEMO_LIFT_HISTORY.filter(e => e.athlete_id === athleteId)
    const local = (lsGet(`p3_lift_log_${athleteId}`) || [])
      .map(e => ({ ...e, athlete_id: athleteId }))
    return [...base, ...local]
  }
  const { data } = await window._supabase
    .from('workout_logs')
    .select('logged_date, actual_weight, actual_reps, exercise:exercises!exercise_id(name)')
    .eq('athlete_id', athleteId)
    .not('actual_weight', 'is', null)
    .order('logged_date', { ascending: true })
  return (data || []).map(r => ({
    athlete_id:    athleteId,
    exercise_name: r.exercise?.name || '',
    date:          r.logged_date,
    weight:        r.actual_weight,
    reps:          r.actual_reps || 1,
  }))
}

async function getMetricHistory(athleteId) {
  if (DEMO_MODE) {
    const base  = DEMO_METRIC_HISTORY.filter(e => e.athlete_id === athleteId)
    const local = []
    Object.keys(localStorage).forEach(key => {
      const match = key.match(/^p3_metrics_(.+)_(\d{4}-\d{2}-\d{2})$/)
      if (!match || match[1] !== athleteId) return
      const date    = match[2]
      const metrics = lsGet(key) || {}
      Object.entries(metrics).forEach(([metricType, data]) => {
        if (data?.value != null) local.push({
          athlete_id:    athleteId,
          metric_type:   metricType,
          value:         data.value,
          unit:          data.unit,
          recorded_date: date,
        })
      })
    })
    const localKeys = new Set(local.map(e => `${e.metric_type}__${e.recorded_date}`))
    return [...base.filter(e => !localKeys.has(`${e.metric_type}__${e.recorded_date}`)), ...local]
  }
  const { data } = await window._supabase
    .from('performance_metrics')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('recorded_date', { ascending: true })
  return data || []
}

async function getAttendance(athleteId) {
  if (DEMO_MODE) {
    const base = DEMO_ATTENDANCE.filter(r => r.athlete_id === athleteId)
    const overrides = lsGet('p3_attendance') || []
    const map = new Map(base.map(r => [r.date, r]))
    overrides.filter(r => r.athlete_id === athleteId).forEach(r => map.set(r.date, r))
    return Array.from(map.values())
  }
  // Derive attendance from workout logs: any date with a logged set = present
  const { data } = await window._supabase
    .from('workout_logs')
    .select('logged_date')
    .eq('athlete_id', athleteId)
  const dates = new Set((data || []).map(r => r.logged_date))
  return Array.from(dates).map(date => ({ athlete_id: athleteId, date, status: 'present' }))
}

// ── Render profile ────────────────────────────────────────────

function renderProfile(user, athlete, config, liftHistory, metricHist, attendance = []) {
  _metricHist = metricHist  // keep module var in sync for section renderers
  const trainer  = isTrainer(user)
  const init     = initials(athlete.full_name)
  const sessions = attendance.filter(r => r.status === 'present').length

  // Auto-populate lift list from logged history + every workout programmed for this athlete
  const _loggedBests = {}
  liftHistory.forEach(e => {
    const est = epley1RM(e.weight, e.reps)
    if (!est) return
    if (!(e.exercise_name in _loggedBests) || est > _loggedBests[e.exercise_name]) {
      _loggedBests[e.exercise_name] = est
    }
  })
  const _wktGroups   = lsGet('p3_athlete_groups') || []
  const _wktGroupIds = _wktGroups.filter(g => g.athlete_ids.includes(athlete.id)).map(g => g.id)
  ;[...DEMO_WORKOUTS, ...(lsGet('p3_demo_workouts') || [])].forEach(w => {
    const forMe    = w.athlete_id === athlete.id
    const forGroup = w.group_id && _wktGroupIds.includes(w.group_id)
    const forAll   = !w.athlete_id && !w.group_id
    if (!forMe && !forGroup && !forAll) return
    ;(w.exercises || []).forEach(ex => {
      const trackAs = ex.track_as
      if (trackAs === 'none' || trackAs === 'metric') return  // those belong in Performance Metrics
      // Explicit lift tracking: always include. Legacy (no track_as): include if weight is programmed.
      if (trackAs === 'lift' || (!trackAs && (ex.target_weight || ex.pct_min || ex.pct_max))) {
        if (!(ex.name in _loggedBests)) _loggedBests[ex.name] = null
      }
    })
  })
  const allLifts = Object.entries(_loggedBests)
    .map(([name, best1RM]) => ({ name, best1RM }))
    .sort((a, b) => a.name.localeCompare(b.name))

  _allLifts = allLifts

  // When the athlete changes (or on first load), reload persisted selections from localStorage
  if (_shownForAthlete !== _athleteId) {
    _shownForAthlete  = _athleteId
    _shownMetricKeys  = lsGet(`p3_profile_shown_metrics_${_athleteId}`)  || []
    _shownLiftNames   = lsGet(`p3_profile_shown_lifts_${_athleteId}`)    || []
    _hiddenLiftNames  = new Set(lsGet(`p3_profile_hidden_lifts_${_athleteId}`)   || [])
    _hiddenMetricKeys = new Set(lsGet(`p3_profile_hidden_metrics_${_athleteId}`) || [])
    _liftManageOpen   = false
    _metricManageOpen = false
  }

  // Filter metric selection to valid options, default to first if empty
  // Valid = standard config metric OR custom type (logged or programmed with track_as:'metric')
  const _syncKnownMeta = new Set(Object.keys(METRIC_META))
  const _syncLoggedCustom = new Set(_metricHist.map(e => e.metric_type).filter(t => !_syncKnownMeta.has(t)))
  const _syncProgrammedCustom = new Set()
  const _syncGroups   = lsGet('p3_athlete_groups') || []
  const _syncGroupIds = _syncGroups.filter(g => g.athlete_ids.includes(_athleteId)).map(g => g.id)
  ;[...DEMO_WORKOUTS, ...(lsGet('p3_demo_workouts') || [])].forEach(w => {
    const forMe    = w.athlete_id === _athleteId
    const forGroup = w.group_id && _syncGroupIds.includes(w.group_id)
    const forAll   = !w.athlete_id && !w.group_id
    if (!forMe && !forGroup && !forAll) return
    ;(w.exercises || []).forEach(ex => {
      if (ex.track_as === 'metric' && !_syncKnownMeta.has(ex.name)) _syncProgrammedCustom.add(ex.name)
    })
  })
  const _syncCustomTypes = new Set([..._syncLoggedCustom, ..._syncProgrammedCustom])
  _shownMetricKeys = _shownMetricKeys.filter(k =>
    (config.metrics.includes(k) || _syncCustomTypes.has(k)) && !_hiddenMetricKeys.has(k))
  if (!_shownMetricKeys.length) {
    const firstAvail = config.metrics.find(k => !_hiddenMetricKeys.has(k))
                    || [..._syncCustomTypes].find(k => !_hiddenMetricKeys.has(k))
    if (firstAvail) _shownMetricKeys = [firstAvail]
  }

  // Filter lift selection to valid, non-hidden lifts; default to first visible if empty
  _shownLiftNames = _shownLiftNames.filter(n =>
    allLifts.some(l => l.name === n) && !_hiddenLiftNames.has(n))
  if (!_shownLiftNames.length) {
    const visibleLifts = allLifts.filter(l => !_hiddenLiftNames.has(l.name))
    const fallback = visibleLifts.find(l => l.best1RM !== null) || visibleLifts[0]
    if (fallback) _shownLiftNames = [fallback.name]
  }

  document.getElementById('page-content').innerHTML = `
    <!-- Back link -->
    <div style="margin-bottom:20px;">
      <a href="${trainer ? 'admin.html' : 'dashboard.html'}" style="color:#71717a;font-size:13px;font-weight:500;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"
        onmouseover="this.style.color='white'" onmouseout="this.style.color='#71717a'">
        ← Back
      </a>
    </div>

    <!-- Athlete header -->
    <div style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:20px 24px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(249,115,22,0.15);border:2px solid rgba(249,115,22,0.4);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#f97316;flex-shrink:0;">
          ${init}
        </div>
        <div>
          <div style="font-size:22px;font-weight:800;color:white;">${athlete.full_name}</div>
          <div style="font-size:13px;color:#71717a;margin-top:2px;">
            ${[athlete.sport, athlete.grade ? `Grade ${athlete.grade}` : null, athlete.age ? `Age ${athlete.age}` : null].filter(Boolean).join(' · ')}
            ${athlete.email ? `<span style="margin-left:6px;">· ${athlete.email}</span>` : ''}
            · ${sessions} sessions
          </div>
          ${trainer && athlete.athlete_code ? `
            <div style="display:inline-flex;align-items:center;gap:7px;margin-top:8px;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.25);border-radius:8px;padding:5px 12px;">
              <span style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;">Athlete Code</span>
              <span style="font-size:15px;font-weight:900;color:#f97316;letter-spacing:0.12em;font-family:monospace;">${athlete.athlete_code}</span>
            </div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${(trainer || _athleteId === user.id) ? `<button onclick="toggleProfileConfig()" id="profile-config-btn" style="display:flex;align-items:center;gap:6px;background:#1c1c1f;border:1px solid #2a2a2f;color:#a1a1aa;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='#a1a1aa'">⚙ Configure Profile</button>` : ''}
      </div>
    </div>

    <!-- Config panel slot -->
    <div id="profile-config-panel"></div>

    <!-- Performance metrics tab section -->
    <div id="metrics-section" style="margin-bottom:20px;">
      ${renderMetricsSection(config.metrics)}
    </div>

    <!-- Lift Progress tab section -->
    <div id="lifts-section" style="margin-bottom:16px;">
      ${renderLiftSection(allLifts)}
    </div>

    <!-- Inline chart panel (hidden until a box is clicked) -->
    <div id="inline-chart-panel" style="display:none;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:20px 24px;margin-bottom:16px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;">
        <div>
          <div id="inline-chart-title" style="font-size:15px;font-weight:700;color:white;margin-bottom:3px;">—</div>
          <div id="inline-chart-sub" style="font-size:12px;color:#71717a;">—</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div id="inline-chart-badge"></div>
          <button onclick="closeInlineChart()" style="background:none;border:none;color:#52525b;font-size:18px;cursor:pointer;padding:8px 10px;line-height:1;" onmouseover="this.style.color='white'" onmouseout="this.style.color='#52525b'">✕</button>
        </div>
      </div>
      <div style="height:220px;position:relative;">
        <canvas id="inline-chart-canvas"></canvas>
      </div>
    </div>

    <!-- Attendance -->
    <div id="attendance-section" style="margin-bottom:28px;">
      ${renderAttendanceSection(attendance)}
    </div>
  `

  _activeStatKey = null
  _attMonth      = TODAY.substring(0, 7)
  if (_inlineChart) { _inlineChart.destroy(); _inlineChart = null }
}

// ── Attendance ────────────────────────────────────────────────

function renderAttendanceSection(attendance) {
  if (!_attMonth) _attMonth = TODAY.substring(0, 7)  // safety fallback
  const [year, month] = _attMonth.split('-').map(Number)
  const monthLabel = new Date(year, month - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const weeks    = buildMonthGrid(attendance, year, month)
  const flatDays = weeks.flat()

  // All-time sessions
  const presentAll = attendance.filter(r => r.status === 'present').length

  // Streak: consecutive calendar days with a present record, going back from today
  const presentDates = attendance
    .filter(r => r.status === 'present' && r.date <= TODAY)
    .map(r => r.date)
    .sort((a, b) => b.localeCompare(a))
  let streak = 0
  for (let i = 0; i < presentDates.length; i++) {
    if (i === 0) {
      const daysSince = Math.round((new Date(TODAY) - new Date(presentDates[0])) / 864e5)
      if (daysSince > 1) break
    } else {
      const dayDiff = Math.round((new Date(presentDates[i - 1]) - new Date(presentDates[i])) / 864e5)
      if (dayDiff > 1) break
    }
    streak++
  }

  // Monthly attendance rate
  const monthPast    = flatDays.filter(d => d.inMonth && d.dateStr <= TODAY)
  const monthPresent = monthPast.filter(d => d.status === 'present').length
  const monthRate    = monthPast.length ? Math.round(monthPresent / monthPast.length * 100) : 0

  // Nav limits
  const currentMonth = TODAY.substring(0, 7)
  const canNext = _attMonth < currentMonth
  const limitDate = new Date(TODAY + 'T00:00:00')
  limitDate.setMonth(limitDate.getMonth() - 24)
  const canPrev = _attMonth > limitDate.toISOString().substring(0, 7)

  return `
    <div style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:20px 24px;">
      <div style="font-size:14px;font-weight:700;color:white;margin-bottom:16px;">Attendance</div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
        <div style="text-align:center;background:#111113;border-radius:10px;padding:14px 8px;">
          <div style="font-size:28px;font-weight:800;color:#22c55e;">${monthRate}%</div>
          <div style="font-size:11px;color:#71717a;margin-top:3px;text-transform:uppercase;letter-spacing:0.06em;">This Month</div>
        </div>
        <div style="text-align:center;background:#111113;border-radius:10px;padding:14px 8px;">
          <div style="font-size:28px;font-weight:800;color:#f97316;">${streak}</div>
          <div style="font-size:11px;color:#71717a;margin-top:3px;text-transform:uppercase;letter-spacing:0.06em;">Streak</div>
        </div>
        <div style="text-align:center;background:#111113;border-radius:10px;padding:14px 8px;">
          <div style="font-size:28px;font-weight:800;color:white;">${presentAll}</div>
          <div style="font-size:11px;color:#71717a;margin-top:3px;text-transform:uppercase;letter-spacing:0.06em;">Total Sessions</div>
        </div>
      </div>

      <!-- Month navigation -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <button onclick="attPrevMonth()"
          style="background:#1c1c1f;border:1px solid #27272a;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:${canPrev ? 'pointer' : 'default'};color:${canPrev ? '#a1a1aa' : '#3f3f46'};transition:color 0.15s;"
          ${!canPrev ? 'disabled' : ''}
          onmouseover="if(${canPrev})this.style.color='white'"
          onmouseout="this.style.color='${canPrev ? '#a1a1aa' : '#3f3f46'}'">
          ← Prev
        </button>
        <div style="font-size:15px;font-weight:700;color:white;">${monthLabel}</div>
        <button onclick="attNextMonth()"
          style="background:#1c1c1f;border:1px solid #27272a;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;cursor:${canNext ? 'pointer' : 'default'};color:${canNext ? '#a1a1aa' : '#3f3f46'};transition:color 0.15s;"
          ${!canNext ? 'disabled' : ''}
          onmouseover="if(${canNext})this.style.color='white'"
          onmouseout="this.style.color='${canNext ? '#a1a1aa' : '#3f3f46'}'">
          Next →
        </button>
      </div>

      <!-- Calendar grid -->
      <div style="overflow-x:auto;">
        <div style="min-width:280px;">
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:6px;">
            ${['Mon','Tue','Wed','Thu','Fri'].map(d =>
              `<div style="text-align:center;font-size:11px;font-weight:700;color:#52525b;padding:3px 0;">${d}</div>`
            ).join('')}
          </div>
          ${weeks.map(week => `
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:4px;">
              ${week.map(day => renderAttCell(day)).join('')}
            </div>`).join('')}
        </div>
      </div>

      <!-- Legend -->
      <div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap;">
        ${[
          ['rgba(34,197,94,0.18)','#22c55e', isTrainer(_profileUser) ? 'Present — click to view log' : 'Present'],
          ['rgba(239,68,68,0.12)','rgba(239,68,68,0.6)','Absent'],
          ['rgba(249,115,22,0.12)','rgba(249,115,22,0.5)','Today'],
          ['#111113','#27272a','Upcoming'],
        ].map(([bg, border, label]) =>
          `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#71717a;">
            <div style="width:12px;height:12px;border-radius:3px;background:${bg};border:1px solid ${border};"></div>${label}
          </div>`
        ).join('')}
      </div>

      <!-- Day log panel (trainer only) -->
      <div id="day-log-panel" style="display:none;margin-top:20px;border-top:1px solid #27272a;padding-top:20px;">
        <div id="day-log-content"></div>
      </div>
    </div>
  `
}

function renderAttCell(day) {
  if (!day.inMonth) {
    return `<div style="height:44px;border-radius:6px;background:#0d0d0f;display:flex;align-items:center;justify-content:center;">
      <span style="font-size:12px;color:#27272a;">${day.dayNum}</span>
    </div>`
  }
  let bg, border, numColor
  switch (day.status) {
    case 'present':
      bg = 'rgba(34,197,94,0.15)'; border = '#22c55e'; numColor = '#22c55e'; break
    case 'absent':
      bg = 'rgba(239,68,68,0.1)'; border = 'rgba(239,68,68,0.5)'; numColor = '#ef4444'; break
    case 'future':
      bg = '#111113'; border = '#27272a'; numColor = '#3f3f46'; break
    default:
      bg = 'rgba(249,115,22,0.1)'; border = 'rgba(249,115,22,0.5)'; numColor = '#f97316'; break
  }

  const canView = isTrainer(_profileUser) && day.status === 'present'
  const isOpen  = _openDayLogDate === day.dateStr

  return `<div
    ${canView ? `onclick="openDayLog('${day.dateStr}')"` : ''}
    style="height:44px;border-radius:6px;background:${isOpen ? 'rgba(34,197,94,0.3)' : bg};border:1px solid ${isOpen ? '#22c55e' : border};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;${canView ? 'cursor:pointer;transition:opacity 0.12s;' : ''}"
    ${canView ? `onmouseover="this.style.opacity='0.75'" onmouseout="this.style.opacity='1'"` : ''}>
    <span style="font-size:13px;font-weight:700;color:${numColor};line-height:1;">${day.dayNum}</span>
    ${canView ? `<span style="font-size:8px;font-weight:700;color:#22c55e;opacity:0.8;letter-spacing:0.04em;">VIEW</span>` : ''}
  </div>`
}

function buildMonthGrid(attendance, year, month) {
  const firstOfMonth = new Date(year, month - 1, 1)
  const lastOfMonth  = new Date(year, month, 0)

  // Monday of the week containing the 1st
  const dow1 = firstOfMonth.getDay() // 0=Sun
  const mon1 = new Date(firstOfMonth)
  mon1.setDate(firstOfMonth.getDate() - (dow1 === 0 ? 6 : dow1 - 1))

  const weeks = []
  const mon   = new Date(mon1)

  while (mon <= lastOfMonth) {
    const week = []
    for (let d = 0; d < 5; d++) {
      const cur     = new Date(mon)
      cur.setDate(mon.getDate() + d)
      const dateStr = cur.toISOString().split('T')[0]
      const inMonth = cur.getMonth() === month - 1 && cur.getFullYear() === year
      const rec     = attendance.find(r => r.date === dateStr)

      let status
      if (!inMonth)          status = 'out-of-month'
      else if (dateStr > TODAY) status = 'future'
      else if (dateStr === TODAY) status = rec ? rec.status : 'today'
      else                   status = rec ? rec.status : 'absent'

      week.push({ dateStr, dayNum: cur.getDate(), inMonth, status })
    }
    mon.setDate(mon.getDate() + 7)
    weeks.push(week)
  }
  return weeks
}

function attPrevMonth() {
  const [y, m] = _attMonth.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  _attMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  document.getElementById('attendance-section').innerHTML =
    renderAttendanceSection(_cachedAttendance)
}

function attNextMonth() {
  const [y, m] = _attMonth.split('-').map(Number)
  const d = new Date(y, m, 1)
  _attMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  document.getElementById('attendance-section').innerHTML =
    renderAttendanceSection(_cachedAttendance)
}

// ── Day log viewer (trainer clicks a present day on the calendar) ─

async function openDayLog(dateStr) {
  const panel   = document.getElementById('day-log-panel')
  const content = document.getElementById('day-log-content')
  if (!panel || !content) return

  // Toggle off if same day clicked again
  if (_openDayLogDate === dateStr) {
    _openDayLogDate = null
    panel.style.display = 'none'
    document.getElementById('attendance-section').innerHTML = renderAttendanceSection(_cachedAttendance)
    return
  }

  _openDayLogDate = dateStr
  // Re-render calendar so the clicked cell shows as active
  document.getElementById('attendance-section').innerHTML = renderAttendanceSection(_cachedAttendance)
  const panel2   = document.getElementById('day-log-panel')
  const content2 = document.getElementById('day-log-content')
  panel2.style.display = 'block'
  content2.innerHTML = `<div style="text-align:center;padding:24px;color:#71717a;font-size:13px;">Loading…</div>`
  panel2.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

  const dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })

  if (DEMO_MODE) {
    const savedLogs    = lsGet(`p3_logs_${_athleteId}_${dateStr}`)    || {}
    const savedMetrics = lsGet(`p3_metrics_${_athleteId}_${dateStr}`) || {}

    // Find the scheduled workout to get exercise info
    const groups   = lsGet('p3_athlete_groups') || []
    const groupIds = groups.filter(g => g.athlete_ids.includes(_athleteId)).map(g => g.id)
    const allWkts  = [...DEMO_WORKOUTS, ...(lsGet('p3_demo_workouts') || [])]
    const workout  = allWkts.find(w =>
      w.scheduled_date === dateStr &&
      (w.athlete_id === _athleteId ||
       (w.group_id && groupIds.includes(w.group_id)) ||
       (!w.athlete_id && !w.group_id))
    )
    const exercises = workout
      ? [...(workout.exercises || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      : []

    const logs = exercises.map(ex => {
      const log  = savedLogs[ex.id]
      if (!log) return null
      const sets = (log.sets || []).filter(s => s.weight || s.reps)
      if (!sets.length) return null
      return { exercise: ex, sets, notes: log.notes || '' }
    }).filter(Boolean)

    const metrics = Object.entries(savedMetrics)
      .filter(([, d]) => d?.value != null)
      .map(([key, d]) => ({ metric_type: key, value: d.value, unit: d.unit }))

    const foodEntry  = lsGet(`p3_food_${_athleteId}_${dateStr}`)  || {}
    const sleepEntry = lsGet(`p3_sleep_${_athleteId}_${dateStr}`) || {}

    renderDayLogContent(dateLabel, logs, metrics, 'demo', foodEntry, sleepEntry)
  } else {
    const [logsRes, metricsRes, foodRes, sleepRes] = await Promise.all([
      window._supabase
        .from('workout_logs')
        .select('actual_sets, actual_reps, actual_weight, notes, exercise:exercises!exercise_id(name, sets, reps, target_weight, notes, order_index)')
        .eq('athlete_id', _athleteId)
        .eq('logged_date', dateStr),
      window._supabase
        .from('performance_metrics')
        .select('metric_type, value, unit')
        .eq('athlete_id', _athleteId)
        .eq('recorded_date', dateStr),
      window._supabase
        .from('food_logs')
        .select('breakfast, lunch, dinner, snacks')
        .eq('athlete_id', _athleteId)
        .eq('log_date', dateStr)
        .maybeSingle(),
      window._supabase
        .from('sleep_logs')
        .select('sleep_time, wake_time, energy_level, notes')
        .eq('athlete_id', _athleteId)
        .eq('log_date', dateStr)
        .maybeSingle(),
    ])

    const logs       = (logsRes.data || []).sort((a, b) => (a.exercise?.order_index || 0) - (b.exercise?.order_index || 0))
    const metrics    = metricsRes.data || []
    const foodEntry  = foodRes.data   || {}
    const sleepEntry = sleepRes.data  || {}

    renderDayLogContent(dateLabel, logs, metrics, 'live', foodEntry, sleepEntry)
  }
}

function renderDayLogContent(dateLabel, logs, metrics, mode, foodEntry = {}) {
  const content = document.getElementById('day-log-content')
  if (!content) return

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="font-size:14px;font-weight:700;color:white;">${dateLabel}</div>
      <button
        onclick="_openDayLogDate=null;document.getElementById('day-log-panel').style.display='none';document.getElementById('attendance-section').innerHTML=renderAttendanceSection(_cachedAttendance);"
        style="background:none;border:none;color:#52525b;font-size:20px;cursor:pointer;padding:2px 8px;line-height:1;transition:color 0.15s;"
        onmouseover="this.style.color='white'" onmouseout="this.style.color='#52525b'">✕</button>
    </div>`

  // Metrics row
  if (metrics.length) {
    html += `
      <div style="margin-bottom:18px;">
        <div style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Metrics Logged</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${metrics.map(m => {
            const meta  = METRIC_META[m.metric_type]
            const label = meta?.label || m.metric_type
            const color = meta?.color || '#a855f7'
            return `
              <div style="background:#111113;border:1px solid #27272a;border-radius:8px;padding:8px 14px;min-width:80px;">
                <div style="font-size:10px;color:#52525b;font-weight:600;margin-bottom:3px;">${label}</div>
                <div style="font-size:18px;font-weight:800;color:${color};">${m.value}<span style="font-size:11px;color:#52525b;font-weight:400;"> ${m.unit || ''}</span></div>
              </div>`
          }).join('')}
        </div>
      </div>`
  }

  // Exercise logs
  if (logs.length) {
    html += `
      <div>
        <div style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Exercises Logged</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${logs.map((log, i) => {
            const ex = mode === 'demo' ? log.exercise : (log.exercise || {})
            const targetStr = [
              ex.sets          ? `${ex.sets} sets`           : null,
              ex.reps          ? `× ${ex.reps} reps`         : null,
              ex.target_weight ? `@ ${ex.target_weight} lbs` : null,
            ].filter(Boolean).join(' ') || '—'

            const exNotes = ex.notes ? `<div style="font-size:11px;color:#f97316;margin-top:2px;">${escapeHtml(ex.notes)}</div>` : ''

            if (mode === 'demo') {
              return `
                <div style="background:#111113;border:1px solid #27272a;border-radius:10px;padding:14px 16px;">
                  <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
                    <div style="width:24px;height:24px;border-radius:6px;background:#f97316;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:white;flex-shrink:0;margin-top:1px;">${i + 1}</div>
                    <div>
                      <div style="font-size:14px;font-weight:700;color:white;">${escapeHtml(ex.name)}</div>
                      <div style="font-size:11px;color:#71717a;">Target: ${targetStr}</div>
                      ${exNotes}
                    </div>
                  </div>
                  <div style="display:grid;grid-template-columns:36px 1fr 1fr;gap:4px;padding:0 2px;margin-bottom:6px;">
                    <div style="font-size:10px;font-weight:700;color:#3f3f46;text-align:center;">SET</div>
                    <div style="font-size:10px;font-weight:700;color:#3f3f46;text-align:center;">WEIGHT</div>
                    <div style="font-size:10px;font-weight:700;color:#3f3f46;text-align:center;">REPS</div>
                  </div>
                  ${log.sets.map(s => `
                    <div style="display:grid;grid-template-columns:36px 1fr 1fr;gap:4px;margin-bottom:4px;">
                      <div style="text-align:center;font-size:13px;font-weight:700;color:#71717a;">${s.set}</div>
                      <div style="text-align:center;font-size:14px;font-weight:700;color:${s.weight ? 'white' : '#3f3f46'};">${s.weight ? s.weight + ' lbs' : '—'}</div>
                      <div style="text-align:center;font-size:14px;font-weight:700;color:${s.reps ? 'white' : '#3f3f46'};">${s.reps || '—'}</div>
                    </div>`).join('')}
                  ${log.notes ? `<div style="margin-top:8px;font-size:12px;color:#a1a1aa;border-top:1px solid #27272a;padding-top:8px;">${escapeHtml(log.notes)}</div>` : ''}
                </div>`
            } else {
              return `
                <div style="background:#111113;border:1px solid #27272a;border-radius:10px;padding:14px 16px;">
                  <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
                    <div style="width:24px;height:24px;border-radius:6px;background:#f97316;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:white;flex-shrink:0;margin-top:1px;">${i + 1}</div>
                    <div>
                      <div style="font-size:14px;font-weight:700;color:white;">${escapeHtml(ex.name || '—')}</div>
                      <div style="font-size:11px;color:#71717a;">Target: ${targetStr}</div>
                      ${exNotes}
                    </div>
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div style="background:#18181b;border-radius:8px;padding:10px 12px;">
                      <div style="font-size:10px;font-weight:600;color:#52525b;margin-bottom:4px;">SETS COMPLETED</div>
                      <div style="font-size:22px;font-weight:800;color:white;">${log.actual_sets ?? '—'}</div>
                    </div>
                    <div style="background:#18181b;border-radius:8px;padding:10px 12px;">
                      <div style="font-size:10px;font-weight:600;color:#52525b;margin-bottom:4px;">BEST SET</div>
                      <div style="font-size:20px;font-weight:800;color:#f97316;">${log.actual_weight ? log.actual_weight + ' lbs' : '—'}</div>
                      <div style="font-size:12px;color:#71717a;margin-top:1px;">${log.actual_reps ? '× ' + log.actual_reps + ' reps' : ''}</div>
                    </div>
                  </div>
                  ${log.notes ? `<div style="margin-top:10px;font-size:12px;color:#a1a1aa;border-top:1px solid #1c1c1f;padding-top:10px;">${escapeHtml(log.notes)}</div>` : ''}
                </div>`
            }
          }).join('')}
        </div>
      </div>`
  }

  if (!logs.length && !metrics.length) {
    html += `<div style="text-align:center;color:#52525b;font-size:13px;padding:8px 0 16px;">No workout data recorded for this day.</div>`
  }

  // Food log section (always shown so trainer can see what athlete ate)
  const _profileMeals = [
    { id: 'breakfast', label: 'Breakfast', icon: '🍳' },
    { id: 'lunch',     label: 'Lunch',     icon: '🥗' },
    { id: 'dinner',    label: 'Dinner',    icon: '🍽️' },
    { id: 'snacks',    label: 'Snacks',    icon: '🍎' },
  ]
  const foodRows = _profileMeals.map(m => {
    const text = foodEntry[m.id]
    if (!text || !text.trim()) return ''
    return `
      <div style="background:#111113;border:1px solid #27272a;border-radius:8px;padding:10px 14px;">
        <div style="font-size:10px;font-weight:700;color:#52525b;margin-bottom:4px;">${m.icon} ${m.label.toUpperCase()}</div>
        <div style="font-size:13px;color:white;line-height:1.5;white-space:pre-wrap;">${escapeHtml(text)}</div>
      </div>`
  }).filter(Boolean)

  const hasFoodEntry = foodRows.length > 0
  html += `
    <div style="margin-top:20px;padding-top:20px;border-top:1px solid #27272a;">
      <div style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Food Log</div>
      ${hasFoodEntry
        ? `<div style="display:flex;flex-direction:column;gap:8px;">${foodRows.join('')}</div>`
        : `<div style="color:#3f3f46;font-size:13px;">Nothing logged for this day.</div>`
      }
    </div>`

  content.innerHTML = html
}

function statBox(label, value, unit, color) {
  return `
    <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${label}</div>
      <div style="font-size:24px;font-weight:800;color:${color};line-height:1;">${value}<span style="font-size:13px;color:#52525b;font-weight:400;"> ${unit}</span></div>
    </div>
  `
}

function renderMetricsSection(metricIds) {
  const _knownMeta = new Set(Object.keys(METRIC_META))

  // Custom types already logged
  const loggedCustom = new Set(_metricHist.map(e => e.metric_type).filter(t => !_knownMeta.has(t)))

  // Custom types from workouts programmed with track_as:'metric' — appear before any data logged
  const _pmGroups   = lsGet('p3_athlete_groups') || []
  const _pmGroupIds = _pmGroups.filter(g => g.athlete_ids.includes(_athleteId)).map(g => g.id)
  const programmedCustom = new Set()
  ;[...DEMO_WORKOUTS, ...(lsGet('p3_demo_workouts') || [])].forEach(w => {
    const forMe    = w.athlete_id === _athleteId
    const forGroup = w.group_id && _pmGroupIds.includes(w.group_id)
    const forAll   = !w.athlete_id && !w.group_id
    if (!forMe && !forGroup && !forAll) return
    ;(w.exercises || []).forEach(ex => {
      if (ex.track_as === 'metric' && !_knownMeta.has(ex.name)) programmedCustom.add(ex.name)
    })
  })

  const customTypes = [...new Set([...loggedCustom, ...programmedCustom])]
  const allAvail    = [
    ...metricIds.map(id => ({ id, label: METRIC_META[id]?.label || id })),
    ...customTypes.map(t  => ({ id: t, label: t })),
  ]
  // Filter out admin-hidden items
  const visible    = allAvail.filter(m => !_hiddenMetricKeys.has(m.id))
  const isAdmin    = isTrainer(_profileUser)

  if (!visible.length && !_metricManageOpen) return ''

  const shown      = _shownMetricKeys.filter(k => visible.some(m => m.id === k))
  const unselected = visible.filter(m => !shown.includes(m.id))
  const canAdd     = shown.length < 3

  // Header row changes based on manage mode
  let headerControls
  if (_metricManageOpen && isAdmin) {
    const manageItems = visible.map(m => {
      const safeArg = JSON.stringify(m.id).replace(/"/g, '&quot;')
      return `
        <div style="display:inline-flex;align-items:center;background:#18181b;border:1px solid #27272a;border-radius:8px;padding:4px 8px 4px 11px;gap:4px;">
          <span style="font-size:12px;font-weight:500;color:#a1a1aa;white-space:nowrap;">${m.label}</span>
          <button onclick="removeFromMetricProfile(${safeArg})" title="Delete from profile" style="background:none;border:none;color:#ef4444;cursor:pointer;padding:4px 8px;font-size:14px;line-height:1;opacity:0.6;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">×</button>
        </div>`
    }).join('')
    headerControls = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <div style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;">Performance Metrics</div>
        <button onclick="toggleMetricManage()" style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">✓ Done</button>
      </div>
      <div style="background:#111113;border:1px solid #27272a;border-radius:10px;padding:12px 14px;margin-bottom:12px;">
        <div style="font-size:11px;color:#71717a;font-weight:600;margin-bottom:8px;">Click × to delete a metric from this athlete's profile:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${manageItems || '<span style="font-size:12px;color:#3f3f46;">No metrics in this profile</span>'}</div>
      </div>`
  } else {
    const dropdown = `
      <select onchange="if(this.value){toggleMetricTab(this.value);this.value=''}"
        style="background:#1c1c1f;border:1px solid #2a2a2f;border-radius:10px;color:${canAdd && unselected.length ? '#a1a1aa' : '#3f3f46'};font-size:12px;font-weight:500;padding:6px 28px 6px 10px;min-width:130px;appearance:none;-webkit-appearance:none;background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E&quot;);background-repeat:no-repeat;background-position:right 8px center;background-size:14px;"
        ${(!canAdd || !unselected.length) ? 'disabled' : ''}>
        <option value="">${!canAdd ? '— Max 3 shown —' : unselected.length ? '＋ Add metric' : '— All shown —'}</option>
        ${unselected.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}
      </select>`
    const manageBtn = isAdmin && allAvail.length
      ? `<button onclick="toggleMetricManage()" title="Delete metrics from profile" style="background:#1c1c1f;border:1px solid #2a2a2f;border-radius:8px;padding:6px 10px;font-size:12px;color:#52525b;cursor:pointer;" onmouseover="this.style.color='#a1a1aa'" onmouseout="this.style.color='#52525b'">✎</button>`
      : ''
    headerControls = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <div style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;">Performance Metrics</div>
        <div style="display:flex;gap:6px;align-items:center;">${dropdown}${manageBtn}</div>
      </div>`
  }

  const chips = shown.map(key => {
    const meta    = METRIC_META[key]
    const label   = meta?.label || key
    const color   = meta?.color || '#a855f7'
    const safeArg = JSON.stringify(key).replace(/"/g, '&quot;')
    return `
      <div style="display:inline-flex;align-items:center;background:${color}18;border:1px solid ${color}55;border-radius:8px;padding:4px 6px 4px 11px;">
        <span style="font-size:12px;font-weight:600;color:${color};white-space:nowrap;">${label}</span>
        ${shown.length > 1
          ? `<button onclick="toggleMetricTab(${safeArg})" title="Hide" style="background:none;border:none;color:${color};cursor:pointer;padding:4px 8px;font-size:16px;line-height:1;opacity:0.6;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">×</button>`
          : `<span style="width:20px;display:inline-block;"></span>`}
      </div>`
  }).join('')

  const boxes = shown.map(key => {
    const meta    = METRIC_META[key]
    const label   = meta?.label || key
    const unit    = meta?.unit  || 'lbs'
    const color   = meta?.color || '#a855f7'
    const higherB = meta ? meta.higherBetter : true
    const entries = _metricHist.filter(e => e.metric_type === key)
    let entry = null
    if (entries.length) {
      if (higherB === null) entry = entries.reduce((a, b) => a.recorded_date > b.recorded_date ? a : b)
      else if (higherB)     entry = entries.reduce((a, b) => a.value > b.value ? a : b)
      else                  entry = entries.reduce((a, b) => a.value < b.value ? a : b)
    }
    const prefix = higherB === null ? 'Current' : 'Best'
    return clickableStatBox(key, 'metric', `${prefix} ${label}`, entry?.value ?? '—', unit, color)
  }).join('')

  return `
    ${headerControls}
    ${chips ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${chips}</div>` : ''}
    ${shown.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px;">${boxes}</div>` : ''}`
}

function renderLiftSection(lifts) {
  // Filter out admin-hidden lifts
  const visible = lifts.filter(l => !_hiddenLiftNames.has(l.name))
  const isAdmin = isTrainer(_profileUser)

  if (!visible.length && !_liftManageOpen) return ''

  const shown      = _shownLiftNames.filter(n => visible.some(l => l.name === n))
  const unselected = visible.filter(l => !shown.includes(l.name))
  const canAdd     = shown.length < 3

  let headerControls
  if (_liftManageOpen && isAdmin) {
    const manageItems = visible.map(lift => {
      const safeArg = JSON.stringify(lift.name).replace(/"/g, '&quot;')
      return `
        <div style="display:inline-flex;align-items:center;background:#18181b;border:1px solid #27272a;border-radius:8px;padding:4px 8px 4px 11px;gap:4px;">
          <span style="font-size:12px;font-weight:500;color:#a1a1aa;white-space:nowrap;">${lift.name}</span>
          <button onclick="removeFromLiftProfile(${safeArg})" title="Delete from profile" style="background:none;border:none;color:#ef4444;cursor:pointer;padding:4px 8px;font-size:14px;line-height:1;opacity:0.6;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">×</button>
        </div>`
    }).join('')
    headerControls = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <div style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;">Lift Progress · Est. 1RM</div>
        <button onclick="toggleLiftManage()" style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">✓ Done</button>
      </div>
      <div style="background:#111113;border:1px solid #27272a;border-radius:10px;padding:12px 14px;margin-bottom:12px;">
        <div style="font-size:11px;color:#71717a;font-weight:600;margin-bottom:8px;">Click × to delete a lift from this athlete's profile:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${manageItems || '<span style="font-size:12px;color:#3f3f46;">No lifts in this profile</span>'}</div>
      </div>`
  } else {
    const dropdown = `
      <select onchange="if(this.value){toggleLiftTab(this.value);this.value=''}"
        style="background:#1c1c1f;border:1px solid #2a2a2f;border-radius:10px;color:${canAdd && unselected.length ? '#a1a1aa' : '#3f3f46'};font-size:12px;font-weight:500;padding:6px 28px 6px 10px;min-width:116px;appearance:none;-webkit-appearance:none;background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E&quot;);background-repeat:no-repeat;background-position:right 8px center;background-size:14px;"
        ${(!canAdd || !unselected.length) ? 'disabled' : ''}>
        <option value="">${!canAdd ? '— Max 3 shown —' : unselected.length ? '＋ Add lift' : '— All shown —'}</option>
        ${unselected.map(l => `<option value="${l.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">${l.name}</option>`).join('')}
      </select>`
    const manageBtn = isAdmin && lifts.length
      ? `<button onclick="toggleLiftManage()" title="Delete lifts from profile" style="background:#1c1c1f;border:1px solid #2a2a2f;border-radius:8px;padding:6px 10px;font-size:12px;color:#52525b;cursor:pointer;" onmouseover="this.style.color='#a1a1aa'" onmouseout="this.style.color='#52525b'">✎</button>`
      : ''
    headerControls = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <div style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;">Lift Progress · Est. 1RM</div>
        <div style="display:flex;gap:6px;align-items:center;">${dropdown}${manageBtn}</div>
      </div>`
  }

  const chips = shown.map(name => {
    const safeArg = JSON.stringify(name).replace(/"/g, '&quot;')
    return `
    <div style="display:inline-flex;align-items:center;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.4);border-radius:8px;padding:4px 6px 4px 11px;">
      <span style="font-size:12px;font-weight:600;color:#f97316;white-space:nowrap;">${name}</span>
      ${shown.length > 1
        ? `<button onclick="toggleLiftTab(${safeArg})" title="Hide" style="background:none;border:none;color:#f97316;cursor:pointer;padding:4px 8px;font-size:16px;line-height:1;opacity:0.6;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">×</button>`
        : `<span style="width:20px;display:inline-block;"></span>`}
    </div>`
  }).join('')

  const shownLifts = shown.map(n => visible.find(l => l.name === n)).filter(Boolean)
  const boxes = shownLifts.map(lift => {
    const key      = lift.name.replace(/\s+/g, '_')
    const value    = lift.best1RM !== null ? lift.best1RM : '—'
    const unit     = lift.best1RM !== null ? ' lbs' : ''
    const sub      = lift.best1RM !== null ? 'Tap for chart →' : 'Not yet logged'
    const isActive = _activeStatKey === key
    const canClick = lift.best1RM !== null
    return `
      <div id="statbox_${key}" ${canClick ? `onclick="showInlineChart('${key}','lift')"` : ''}
        style="background:#18181b;border:1px solid ${isActive ? '#f97316' : '#27272a'};border-radius:12px;padding:14px 16px;${canClick ? 'cursor:pointer;' : ''}transition:border-color 0.15s,box-shadow 0.15s;"
        ${canClick ? `onmouseover="this.style.borderColor='#f97316';this.style.boxShadow='0 0 0 1px rgba(249,115,22,0.13)'"
          onmouseout="this.style.borderColor=(_activeStatKey==='${key}'?'#f97316':'#27272a');this.style.boxShadow=''"` : ''}>
        <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lift.name}</div>
        <div style="font-size:24px;font-weight:800;color:#f97316;line-height:1;">${value}<span style="font-size:13px;color:#52525b;font-weight:400;">${unit}</span></div>
        <div style="font-size:10px;color:#3f3f46;margin-top:6px;">${sub}</div>
      </div>`
  }).join('')

  return `
    ${headerControls}
    ${chips ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${chips}</div>` : ''}
    ${shownLifts.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px;">${boxes}</div>` : ''}`
}

function toggleMetricTab(key) {
  const idx = _shownMetricKeys.indexOf(key)
  if (idx >= 0) {
    if (_shownMetricKeys.length <= 1) return  // enforce min 1
    _shownMetricKeys.splice(idx, 1)
    if (_activeStatKey === key) closeInlineChart()
  } else {
    if (_shownMetricKeys.length >= 3) {
      const removed = _shownMetricKeys.shift()  // drop oldest to make room
      if (_activeStatKey === removed) closeInlineChart()
    }
    _shownMetricKeys.push(key)
  }
  lsSet(`p3_profile_shown_metrics_${_athleteId}`, _shownMetricKeys)
  document.getElementById('metrics-section').innerHTML = renderMetricsSection(getProfileConfig(_athleteId, _athlete).metrics)
}

function toggleLiftTab(name) {
  const idx = _shownLiftNames.indexOf(name)
  if (idx >= 0) {
    if (_shownLiftNames.length <= 1) return  // enforce min 1
    _shownLiftNames.splice(idx, 1)
    const key = name.replace(/\s+/g, '_')
    if (_activeStatKey === key) closeInlineChart()
  } else {
    if (_shownLiftNames.length >= 3) {
      const removed    = _shownLiftNames.shift()
      const removedKey = removed.replace(/\s+/g, '_')
      if (_activeStatKey === removedKey) closeInlineChart()
    }
    _shownLiftNames.push(name)
  }
  lsSet(`p3_profile_shown_lifts_${_athleteId}`, _shownLiftNames)
  document.getElementById('lifts-section').innerHTML = renderLiftSection(_allLifts)
}

function toggleLiftManage() {
  _liftManageOpen = !_liftManageOpen
  document.getElementById('lifts-section').innerHTML = renderLiftSection(_allLifts)
}

function toggleMetricManage() {
  _metricManageOpen = !_metricManageOpen
  document.getElementById('metrics-section').innerHTML = renderMetricsSection(getProfileConfig(_athleteId, _athlete).metrics)
}

function removeFromLiftProfile(name) {
  _hiddenLiftNames.add(name)
  lsSet(`p3_profile_hidden_lifts_${_athleteId}`, [..._hiddenLiftNames])
  // Deselect if currently shown; enforce min-1
  const idx = _shownLiftNames.indexOf(name)
  if (idx >= 0) {
    _shownLiftNames.splice(idx, 1)
    if (_shownLiftNames.length === 0) {
      // Pick first still-visible lift
      const fallback = _allLifts.find(l => !_hiddenLiftNames.has(l.name))
      if (fallback) _shownLiftNames.push(fallback.name)
    }
    lsSet(`p3_profile_shown_lifts_${_athleteId}`, _shownLiftNames)
    const key = name.replace(/\s+/g, '_')
    if (_activeStatKey === key) closeInlineChart()
  }
  document.getElementById('lifts-section').innerHTML = renderLiftSection(_allLifts)
}

function removeFromMetricProfile(key) {
  _hiddenMetricKeys.add(key)
  lsSet(`p3_profile_hidden_metrics_${_athleteId}`, [..._hiddenMetricKeys])
  // Deselect if currently shown; enforce min-1
  const idx = _shownMetricKeys.indexOf(key)
  if (idx >= 0) {
    _shownMetricKeys.splice(idx, 1)
    if (_shownMetricKeys.length === 0) {
      const cfgMetrics = getProfileConfig(_athleteId, _athlete).metrics
      const fallback = cfgMetrics.find(k => !_hiddenMetricKeys.has(k))
      if (fallback) _shownMetricKeys.push(fallback)
      // if all config metrics hidden, renderMetricsSection will show empty state gracefully
    }
    lsSet(`p3_profile_shown_metrics_${_athleteId}`, _shownMetricKeys)
    if (_activeStatKey === key) closeInlineChart()
  }
  document.getElementById('metrics-section').innerHTML = renderMetricsSection(getProfileConfig(_athleteId, _athlete).metrics)
}

function clickableStatBox(key, kind, label, value, unit, color) {
  return `
    <div id="statbox_${key}" onclick="showInlineChart('${key}','${kind}')"
      style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:14px 16px;cursor:pointer;transition:border-color 0.15s,box-shadow 0.15s;"
      onmouseover="this.style.borderColor='${color}';this.style.boxShadow='0 0 0 1px ${color}22'"
      onmouseout="this.style.borderColor=(_activeStatKey==='${key}'?'${color}':'#27272a');this.style.boxShadow=''">
      <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${label}</div>
      <div style="font-size:24px;font-weight:800;color:${color};line-height:1;">${value}<span style="font-size:13px;color:#52525b;font-weight:400;"> ${unit}</span></div>
      <div style="font-size:10px;color:#3f3f46;margin-top:6px;">Tap for chart →</div>
    </div>
  `
}

function showInlineChart(key, kind) {
  // Deselect previous box
  if (_activeStatKey && _activeStatKey !== key) {
    const prev = document.getElementById(`statbox_${_activeStatKey}`)
    if (prev) prev.style.borderColor = '#27272a'
  }

  const panel = document.getElementById('inline-chart-panel')

  // If same box clicked again, toggle off
  if (_activeStatKey === key) {
    closeInlineChart()
    return
  }

  _activeStatKey = key
  const box = document.getElementById(`statbox_${key}`)

  // Destroy existing inline chart
  if (_inlineChart) { _inlineChart.destroy(); _inlineChart = null }

  panel.style.display = 'block'
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

  const canvas  = document.getElementById('inline-chart-canvas')
  const titleEl = document.getElementById('inline-chart-title')
  const subEl   = document.getElementById('inline-chart-sub')
  const badgeEl = document.getElementById('inline-chart-badge')

  Chart.defaults.color       = '#71717a'
  Chart.defaults.borderColor = '#1c1c1f'

  if (kind === 'metric') {
    const meta    = METRIC_META[key]
    const label   = meta?.label  || key.replace(/_/g, ' ')
    const unit    = meta?.unit   || 'lbs'
    const color   = meta?.color  || '#a855f7'
    const higherB = meta ? meta.higherBetter : true  // custom exercise metrics default: higher is better

    const data = _metricHist
      .filter(e => e.metric_type === key)
      .sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
    if (!data.length) { panel.style.display = 'none'; showToast('No data recorded yet.', 'error'); return }

    const labels  = data.map(e => formatChartDate(e.recorded_date))
    const values  = data.map(e => e.value)
    const bestVal = higherB === true  ? Math.max(...values)
                  : higherB === false ? Math.min(...values) : null

    if (box) box.style.borderColor = color
    titleEl.textContent = label
    subEl.textContent   = `${unit}  ·  ${higherB === false ? '↓ Lower is better' : higherB === true ? '↑ Higher is better' : 'Trend over time'}`
    badgeEl.innerHTML   = bestVal !== null ? `<span class="best-badge">${higherB === false ? 'Best: ' : 'PR: '}${bestVal} ${unit}</span>` : ''

    _inlineChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: color,
          backgroundColor: color + '18',
          fill: true, tension: 0.4,
          pointBackgroundColor: color, pointRadius: 4, pointHoverRadius: 7,
        }]
      },
      options: chartOptions({ yLabel: `${label} (${unit})` })
    })

  } else {
    const lift = _allLifts.find(l => l.name.replace(/\s+/g, '_') === key)
    const liftName = lift ? lift.name : key.replace(/_/g, ' ')
    const data = _liftHistory
      .filter(e => e.exercise_name === liftName)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (!data.length) { panel.style.display = 'none'; showToast('No lift data recorded yet.', 'error'); return }

    const labels  = data.map(e => formatChartDate(e.date))
    const values  = data.map(e => epley1RM(e.weight, e.reps))
    const best1RM = Math.max(...values)

    if (box) box.style.borderColor = '#f97316'
    titleEl.textContent = liftName + ' — Estimated 1RM'
    subEl.textContent   = 'Epley formula  ·  lbs'
    badgeEl.innerHTML   = `<span class="best-badge">PR: ${best1RM} lbs</span>`

    _inlineChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: '#f97316',
          backgroundColor: 'rgba(249,115,22,0.08)',
          fill: true, tension: 0.4,
          pointBackgroundColor: '#f97316', pointRadius: 4, pointHoverRadius: 7,
        }]
      },
      options: chartOptions({
        tooltipExtra: (idx) => `${data[idx].weight} lbs × ${data[idx].reps} reps`,
        yLabel: 'Est. 1RM (lbs)',
      })
    })
  }
}

function closeInlineChart() {
  if (_inlineChart) { _inlineChart.destroy(); _inlineChart = null }
  if (_activeStatKey) {
    const prev = document.getElementById(`statbox_${_activeStatKey}`)
    if (prev) prev.style.borderColor = '#27272a'
    _activeStatKey = null
  }
  const panel = document.getElementById('inline-chart-panel')
  if (panel) panel.style.display = 'none'
}


function chartOptions({ tooltipExtra, yLabel }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#18181b',
        borderColor: '#3f3f46',
        borderWidth: 1,
        titleColor: '#fafafa',
        bodyColor: '#a1a1aa',
        padding: 12,
        callbacks: {
          afterBody: tooltipExtra
            ? (items) => [tooltipExtra(items[0]?.dataIndex)]
            : undefined,
        }
      }
    },
    scales: {
      x: {
        grid:   { color: '#1c1c1f' },
        ticks:  { color: '#71717a', font: { size: 11 }, maxTicksLimit: 8 },
        border: { display: false },
      },
      y: {
        grid:   { color: '#1c1c1f' },
        ticks:  { color: '#71717a', font: { size: 11 } },
        border: { display: false },
        title:  { display: true, text: yLabel, color: '#52525b', font: { size: 10 } },
      }
    }
  }
}

function formatChartDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Profile Configure Panel ───────────────────────────────────

const PROFILE_METRIC_OPTIONS = Object.entries(METRIC_META).map(([id, m]) => {
  const tag = id === 'sprint_60yd' ? ' (Baseball)' : id === 'sprint_20yd' ? ' (Female)' : ''
  return { id, label: m.label + tag }
})
function toggleProfileConfig() {
  _configOpen = !_configOpen
  const panel = document.getElementById('profile-config-panel')
  const btn   = document.getElementById('profile-config-btn')
  if (_configOpen) {
    panel.innerHTML = buildProfileConfigPanel(getProfileConfig(_athleteId, _athlete))
    btn.textContent = '✕ Close'
    btn.style.color = '#f97316'
  } else {
    panel.innerHTML = ''
    btn.textContent = '⚙ Configure Profile'
    btn.style.color = '#a1a1aa'
  }
}

function buildProfileConfigPanel(config) {
  return `
    <div class="config-panel-wrap">
      <div style="font-size:14px;font-weight:700;color:white;margin-bottom:6px;">⚙ Configure Profile — Performance Metrics</div>
      <div style="font-size:12px;color:#71717a;margin-bottom:16px;">Choose which metrics appear in your stats panel. Lift progress is tracked automatically from all logged and programmed workouts.</div>

      <div style="margin-bottom:18px;">
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${PROFILE_METRIC_OPTIONS.map(m => `
            <label class="config-check-label" id="pcl_${m.id}" style="border-color:${config.metrics.includes(m.id) ? '#f97316' : '#2a2a2f'};">
              <input type="checkbox" id="pm_${m.id}" ${config.metrics.includes(m.id) ? 'checked' : ''}
                onchange="updateConfigBorder(this,'pcl_${m.id}')" style="accent-color:#f97316;width:14px;height:14px;">
              <span style="font-size:13px;color:#d4d4d8;font-weight:500;">${m.label}</span>
            </label>`).join('')}
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;">
        <button onclick="saveProfileConfig()" class="btn-primary" style="padding:10px 28px;">Apply Changes</button>
      </div>
    </div>
  `
}

function updateConfigBorder(checkbox, labelId) {
  const label = document.getElementById(labelId)
  if (label) label.style.borderColor = checkbox.checked ? '#f97316' : '#2a2a2f'
}

function saveProfileConfig() {
  const metrics = PROFILE_METRIC_OPTIONS
    .filter(m => document.getElementById(`pm_${m.id}`)?.checked)
    .map(m => m.id)

  if (!metrics.length) {
    showToast('Select at least one metric.', 'error'); return
  }

  const config = { metrics, lifts: [] }
  lsSet(`p3_profile_config_${_athleteId}`, config)

  _configOpen  = false
  renderProfile(_profileUser, _athlete, config, _liftHistory, _metricHist, _cachedAttendance)
  showToast('Profile updated!', 'success')
}
