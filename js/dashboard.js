// ============================================================
// Dashboard — Weekly Workout View
// ============================================================

let _weekWorkouts      = []
let _dashAthletes      = []   // trainer only: all athletes (populated on init)
let _selectedDate      = TODAY
let _dashUser          = null
let _viewingTarget     = null   // trainer only — null | athlete_id | 'group:GROUP_ID'
let _weekOffset        = 0      // 0 = current week, -1 = last week, +1 = next week, etc.
let _currentWeekDates  = [...WEEK_DATES]
let _dashSaveTimer     = null
let _dashSaveWorkoutId = ''
let _dashSaveDate      = TODAY

const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri']

// Fetches saved logs/metrics for a date from Supabase and caches them to
// localStorage so renderDayContent can read them synchronously.
// Only runs in live mode and only if localStorage is empty for that date.
// Fetches saved logs/metrics for a date from Supabase and writes them to
// localStorage so renderDayContent can read them synchronously.
// `force` = true skips the "already cached" check (used when navigating to past days).
async function prefetchSavedLogs(userId, date) {
  if (DEMO_MODE || !window._supabase) return
  // Always fetch from Supabase for past dates so edits on any device show up.
  // For today, skip if already cached — auto-save keeps localStorage current.
  const isPastDate = date < TODAY
  if (!isPastDate && (lsGet(`p3_logs_${userId}_${date}`) || lsGet(`p3_metrics_${userId}_${date}`))) return

  const [{ data: logData }, { data: metricData }] = await Promise.all([
    window._supabase
      .from('workout_logs')
      .select('exercise_id, actual_sets, actual_reps, actual_weight, notes, sets_data')
      .eq('athlete_id', userId)
      .eq('logged_date', date),
    window._supabase
      .from('performance_metrics')
      .select('metric_type, value, unit')
      .eq('athlete_id', userId)
      .eq('recorded_date', date),
  ])

  if (logData?.length) {
    const logs = {}
    logData.forEach(r => {
      if (Array.isArray(r.sets_data) && r.sets_data.length) {
        // Full per-set data saved by the new code path — use it directly
        logs[r.exercise_id] = { sets: r.sets_data, notes: r.notes || '' }
      } else {
        // Legacy rows (saved before sets_data column existed) — reconstruct from summary
        const n = r.actual_sets || 1
        logs[r.exercise_id] = {
          sets: Array.from({ length: n }, (_, i) => ({
            set:    i + 1,
            weight: r.actual_weight != null ? String(r.actual_weight) : '',
            reps:   r.actual_reps   != null ? String(r.actual_reps)   : '',
          })),
          notes: r.notes || '',
        }
      }
    })
    lsSet(`p3_logs_${userId}_${date}`, logs)
  } else if (isPastDate) {
    localStorage.removeItem(`p3_logs_${userId}_${date}`)
  }

  if (metricData?.length) {
    const metrics = {}
    metricData.forEach(r => { metrics[r.metric_type] = { value: r.value, unit: r.unit } })
    lsSet(`p3_metrics_${userId}_${date}`, metrics)
  } else if (isPastDate) {
    localStorage.removeItem(`p3_metrics_${userId}_${date}`)
  }
}

async function changeWeek(delta) {
  _weekOffset        += delta
  _currentWeekDates   = getWeekDatesForOffset(_weekOffset)
  _viewingTarget      = null
  _selectedDate = _weekOffset === 0 ? TODAY : _currentWeekDates[0]
  _weekWorkouts = await getWeekWorkouts(_dashUser)
  if (!isTrainer(_dashUser)) await prefetchSavedLogs(_dashUser.id, _selectedDate)
  renderDashboard(_dashUser, _weekWorkouts)
}

async function initPage(user) {
  _dashUser            = user
  _selectedDate        = TODAY
  _weekOffset          = 0
  _currentWeekDates    = [...WEEK_DATES]

  // Pre-load athlete list for the trainer dropdown
  if (isTrainer(user)) {
    if (DEMO_MODE) {
      _dashAthletes = [...DEMO_ATHLETES, ...(lsGet('p3_demo_athletes') || [])]
    } else {
      const { data } = await window._supabase
        .from('profiles').select('*').eq('role', 'athlete').order('full_name')
      _dashAthletes = data || []
    }
  }

  _weekWorkouts = await getWeekWorkouts(user)
  if (!isTrainer(user)) await prefetchSavedLogs(user.id, TODAY)
  renderDashboard(user, _weekWorkouts)
  setupDashAutoSave()
}

async function getWeekWorkouts(user) {
  if (DEMO_MODE) {
    const adminWorkouts  = lsGet('p3_demo_workouts') || []
    const groups         = lsGet('p3_athlete_groups') || []
    const userGroupIds   = groups.filter(g => g.athlete_ids.includes(user.id)).map(g => g.id)
    const inGroup        = w => w.group_id && userGroupIds.includes(w.group_id)

    // Priority: athlete-specific > group > all-athletes (admin overrides demo)
    const ordered = [
      ...adminWorkouts.filter(w => w.athlete_id === user.id),
      ...adminWorkouts.filter(w => inGroup(w)),
      ...adminWorkouts.filter(w => !w.athlete_id && !w.group_id),
      ...DEMO_WORKOUTS.filter(w => w.athlete_id === user.id),
      ...DEMO_WORKOUTS.filter(w => !w.athlete_id),
    ].filter(w => _currentWeekDates.includes(w.scheduled_date))

    // One workout per day — first match wins
    const seen = new Set()
    return ordered.filter(w => {
      if (seen.has(w.scheduled_date)) return false
      seen.add(w.scheduled_date)
      return true
    })
  }

  // For athletes: check if we have a real Supabase auth session.
  // Code-login on a device other than signup won't have one, so fall back to RPC.
  if (!isTrainer(user)) {
    const { data: sessionData } = await window._supabase.auth.getSession()
    if (!sessionData?.session) {
      // No auth session (athlete code kiosk login) — use RPC to bypass RLS
      const { data } = await window._supabase.rpc('get_athlete_workouts_by_code', {
        p_code:  user.athlete_code,
        p_start: _currentWeekDates[0],
        p_end:   _currentWeekDates[4],
      })
      return (data || []).map(w => ({ ...w, exercises: w.exercises || [] }))
    }
  }

  // Trainers fetch all workouts; authenticated athletes fetch their own + all-athlete workouts
  let q = window._supabase
    .from('workouts')
    .select('*, exercises(*)')
    .gte('scheduled_date', _currentWeekDates[0])
    .lte('scheduled_date', _currentWeekDates[4])
    .order('scheduled_date')

  if (!isTrainer(user)) {
    q = q.or(`athlete_id.eq.${user.id},athlete_id.is.null`)
  }

  const { data } = await q
  return data || []
}

// ── Trainer: resolve a specific athlete's workout for a date ──

function getWorkoutForDate(athleteId, date) {
  if (!DEMO_MODE) {
    // _weekWorkouts has all workouts (trainers fetch unfiltered); match athlete or all-athletes
    const groups       = lsGet('p3_athlete_groups') || []
    const userGroupIds = groups.filter(g => g.athlete_ids.includes(athleteId)).map(g => g.id)
    return _weekWorkouts.find(w =>
      w.scheduled_date === date &&
      (w.athlete_id === athleteId ||
       (w.group_id && userGroupIds.includes(w.group_id)) ||
       (!w.athlete_id && !w.group_id))
    ) || null
  }

  const adminWorkouts = lsGet('p3_demo_workouts') || []
  const groups        = lsGet('p3_athlete_groups') || []
  const userGroupIds  = groups.filter(g => g.athlete_ids.includes(athleteId)).map(g => g.id)
  const inGroup       = w => w.group_id && userGroupIds.includes(w.group_id)

  const candidates = [
    ...adminWorkouts.filter(w => w.athlete_id === athleteId),
    ...adminWorkouts.filter(w => inGroup(w)),
    ...adminWorkouts.filter(w => !w.athlete_id && !w.group_id),
    ...DEMO_WORKOUTS.filter(w => w.athlete_id === athleteId),
    ...DEMO_WORKOUTS.filter(w => !w.athlete_id),
  ].filter(w => w.scheduled_date === date)

  return candidates[0] || null
}

function switchViewingTarget(val) {
  _viewingTarget = val || null
  document.getElementById('day-content').innerHTML =
    renderDayContent(_dashUser, _selectedDate)
}

function getWorkoutForGroup(groupId, date) {
  if (!DEMO_MODE) {
    return _weekWorkouts.find(w => w.group_id === groupId && w.scheduled_date === date) || null
  }
  const all = [...DEMO_WORKOUTS, ...(lsGet('p3_demo_workouts') || [])]
  return all.find(w => w.group_id === groupId && w.scheduled_date === date) || null
}

// ── Week tab bar + day view ───────────────────────────────────

function renderDashboard(user, weekWorkouts) {
  const tabsHTML = _currentWeekDates.map((date, i) => {
    const w        = weekWorkouts.find(x => x.scheduled_date === date)
    const isToday  = date === TODAY
    const isActive = date === _selectedDate
    const dateNum  = new Date(date + 'T00:00:00').getDate()

    return `
      <button onclick="switchDay('${date}')"
        style="flex:1;padding:10px 4px;border-radius:12px;cursor:pointer;text-align:center;min-width:0;
          background:${isActive ? '#f97316' : isToday ? 'rgba(249,115,22,0.08)' : '#18181b'};
          border:2px solid ${isActive ? '#f97316' : isToday ? 'rgba(249,115,22,0.35)' : '#27272a'};
          transition:all 0.15s;"
        onmouseover="if('${date}'!=='${_selectedDate}')this.style.borderColor='rgba(249,115,22,0.4)'"
        onmouseout="if('${date}'!=='${_selectedDate}')this.style.borderColor='${ isToday ? 'rgba(249,115,22,0.35)' : '#27272a' }'">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;
          color:${isActive ? 'rgba(255,255,255,0.75)' : '#71717a'}">${DAY_NAMES[i]}</div>
        <div style="font-size:20px;font-weight:900;line-height:1.2;margin:1px 0;
          color:${isActive ? 'white' : isToday ? '#f97316' : '#d4d4d8'}">${dateNum}</div>
        <div style="font-size:9px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 3px;
          color:${isActive ? 'rgba(255,255,255,0.65)' : '#52525b'}">${w ? w.title : '—'}</div>
      </button>`
  }).join('')

  // Week label: "Jun 9 – Jun 13"
  const fmt   = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const wkStart = fmt(_currentWeekDates[0])
  const wkEnd   = fmt(_currentWeekDates[4])
  const wkLabel = _weekOffset === 0 ? 'This Week' : _weekOffset < 0 ? `${Math.abs(_weekOffset)} Week${Math.abs(_weekOffset) > 1 ? 's' : ''} Ago` : `${_weekOffset} Week${_weekOffset > 1 ? 's' : ''} Ahead`

  const navArrows = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <button onclick="changeWeek(-1)"
        style="display:flex;align-items:center;gap:5px;background:#18181b;border:1px solid #27272a;color:#a1a1aa;border-radius:10px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;"
        onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
        onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">
        ← Prev
      </button>
      <div style="text-align:center;">
        <div style="font-size:14px;font-weight:700;color:${_weekOffset === 0 ? '#f97316' : 'white'};">${wkLabel}</div>
        <div style="font-size:11px;color:#52525b;margin-top:1px;">${wkStart} – ${wkEnd}</div>
      </div>
      <button onclick="changeWeek(1)"
        style="display:flex;align-items:center;gap:5px;background:#18181b;border:1px solid #27272a;color:#a1a1aa;border-radius:10px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;"
        onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
        onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">
        Next →
      </button>
    </div>`

  document.getElementById('page-content').innerHTML = `
    <div class="page-header">
      <h1>Today's Workout</h1>
      <p>${todayLabel()}</p>
    </div>

    ${navArrows}
    <div style="display:flex;gap:6px;margin-bottom:28px;">${tabsHTML}</div>

    <div id="day-content">${renderDayContent(user, _selectedDate)}</div>
  `
}

async function switchDay(date) {
  _selectedDate  = date
  _viewingTarget = null
  if (!isTrainer(_dashUser)) await prefetchSavedLogs(_dashUser.id, date)
  renderDashboard(_dashUser, _weekWorkouts)
  setTimeout(() => document.getElementById('day-content')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60)
}

// ── Day content ───────────────────────────────────────────────

function prevWeekDate(date) {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

function renderDayContent(user, date) {
  const trainer  = isTrainer(user)
  const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const isFuture = date > TODAY
  const isPast   = date < TODAY
  const statusChip = isFuture
    ? `<span style="color:#52525b;font-size:12px;">Upcoming</span>`
    : isPast
    ? `<span style="color:#f59e0b;font-size:12px;">Past session</span>`
    : `<span style="color:#22c55e;font-size:12px;">Today</span>`

  const header = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:22px;">
      <span style="font-size:13px;color:#71717a;">${dayLabel}</span>
      <span style="color:#3f3f46;">·</span>
      ${statusChip}
    </div>`

  // ── Trainer: dropdown switcher + view branch ──────────────────
  if (trainer) {
    const allAthletes = _dashAthletes
    const allGroups   = lsGet('p3_athlete_groups') || []

    const groupOpts   = allGroups.length
      ? `<optgroup label="─── Groups ───">
          ${allGroups.map(g => `<option value="group:${g.id}" ${_viewingTarget === `group:${g.id}` ? 'selected' : ''}>👥 ${g.name} (${g.athlete_ids.length})</option>`).join('')}
         </optgroup>`
      : ''
    const athleteOpts = allAthletes.length
      ? `<optgroup label="─── Individual Athletes ───">
          ${allAthletes.map(a => `<option value="${a.id}" ${_viewingTarget === a.id ? 'selected' : ''}>${initials(a.full_name)} ${a.full_name}</option>`).join('')}
         </optgroup>`
      : ''

    const switcher = `
      <div style="margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">View Workout For</div>
        <select onchange="switchViewingTarget(this.value)"
          style="background:#1c1c1f;border:2px solid ${_viewingTarget ? '#f97316' : '#27272a'};border-radius:10px;color:${_viewingTarget ? 'white' : '#71717a'};font-size:13px;font-weight:600;padding:9px 36px 9px 14px;min-width:220px;max-width:100%;cursor:pointer;outline:none;appearance:none;-webkit-appearance:none;background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E&quot;);background-repeat:no-repeat;background-position:right 12px center;background-size:16px;">
          <option value="">— Select athlete or group —</option>
          ${groupOpts}
          ${athleteOpts}
        </select>
      </div>`

    // No selection — show prompt
    if (!_viewingTarget) {
      return header + switcher + `
        <div style="background:#111113;border:1px solid #27272a;border-radius:16px;padding:40px 24px;text-align:center;">
          <div style="font-size:36px;margin-bottom:14px;">👆</div>
          <div style="font-size:16px;font-weight:700;color:white;margin-bottom:8px;">Select an athlete or group</div>
          <div style="font-size:13px;color:#52525b;">Use the dropdown above to view and edit their workout for this day.</div>
        </div>`
    }

    // Group view
    if (_viewingTarget.startsWith('group:')) {
      const groupId = _viewingTarget.slice(6)
      const group   = allGroups.find(g => g.id === groupId)
      if (!group) return header + switcher + renderRestDay()

      const workout   = getWorkoutForGroup(groupId, date)
      const exercises = workout
        ? [...workout.exercises].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        : []
      const members   = allAthletes.filter(a => group.athlete_ids.includes(a.id))

      return header + switcher + `
        <div style="background:#18181b;border:1px solid #27272a;border-radius:14px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;border-radius:11px;background:rgba(249,115,22,0.15);border:2px solid rgba(249,115,22,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">👥</div>
            <div>
              <div style="font-size:16px;font-weight:800;color:white;">${group.name}</div>
              <div style="font-size:12px;color:#71717a;">${members.length} member${members.length !== 1 ? 's' : ''} · ${members.map(a => a.full_name.split(' ')[0]).join(', ')}</div>
            </div>
          </div>
          ${workout ? `
            <a href="admin.html?tab=program&edit=${workout.id}"
              style="font-size:12px;font-weight:700;color:#71717a;text-decoration:none;padding:6px 12px;background:#1c1c1f;border:1px solid #27272a;border-radius:8px;transition:all 0.15s;"
              onmouseover="this.style.color='#f97316';this.style.borderColor='rgba(249,115,22,0.4)'"
              onmouseout="this.style.color='#71717a';this.style.borderColor='#27272a'">✏ Edit Workout</a>` : ''}
        </div>
        ${workout ? renderWorkoutSection(workout, exercises, {}, {}, user.id) : renderRestDay()}`
    }

    // Individual athlete view
    const athlete = allAthletes.find(a => a.id === _viewingTarget)
    if (!athlete) return header + switcher + renderRestDay()

    const workout   = getWorkoutForDate(_viewingTarget, date)
    const exercises = workout
      ? [...workout.exercises].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      : []
    const savedLogs = lsGet(`p3_logs_${_viewingTarget}_${date}`) || {}
    const prevLogs  = lsGet(`p3_logs_${_viewingTarget}_${prevWeekDate(date)}`) || {}
    const hasLog    = Object.keys(savedLogs).length > 0

    return header + switcher + `
      <div style="background:#18181b;border:1px solid #27272a;border-radius:14px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:11px;background:rgba(249,115,22,0.15);border:2px solid rgba(249,115,22,0.4);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#f97316;flex-shrink:0;">
            ${initials(athlete.full_name)}
          </div>
          <div>
            <div style="font-size:16px;font-weight:800;color:white;">${athlete.full_name}</div>
            <div style="font-size:12px;color:#71717a;">${[athlete.sport, athlete.grade ? `Grade ${athlete.grade}` : null].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          ${hasLog ? `<span style="font-size:12px;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:7px;padding:4px 10px;">✓ Logged</span>` : ''}
          <a href="profile.html?id=${athlete.id}"
            style="font-size:12px;font-weight:700;color:#71717a;text-decoration:none;padding:6px 12px;background:#1c1c1f;border:1px solid #27272a;border-radius:8px;transition:all 0.15s;"
            onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
            onmouseout="this.style.color='#71717a';this.style.borderColor='#27272a'">View Profile →</a>
          ${workout ? `
            <a href="admin.html?tab=program&edit=${workout.id}"
              style="font-size:12px;font-weight:700;color:#71717a;text-decoration:none;padding:6px 12px;background:#1c1c1f;border:1px solid #27272a;border-radius:8px;transition:all 0.15s;"
              onmouseover="this.style.color='#f97316';this.style.borderColor='rgba(249,115,22,0.4)'"
              onmouseout="this.style.color='#71717a';this.style.borderColor='#27272a'">✏ Edit Workout</a>` : ''}
        </div>
      </div>
      ${workout ? renderWorkoutSection(workout, exercises, savedLogs, prevLogs, _viewingTarget) : renderRestDay()}
    `
  }

  // ── Regular athlete view ──────────────────────────────────────
  const workout  = _weekWorkouts.find(w => w.scheduled_date === date) || null
  const exercises = workout
    ? [...workout.exercises].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    : []
  const savedLogs    = lsGet(`p3_logs_${user.id}_${date}`)               || {}
  const savedMetrics = lsGet(`p3_metrics_${user.id}_${date}`)            || {}
  const prevLogs     = lsGet(`p3_logs_${user.id}_${prevWeekDate(date)}`) || {}

  _dashSaveWorkoutId = workout?.id || ''
  _dashSaveDate      = date

  return header + `
    ${!isFuture ? `
    <div style="margin-bottom:28px;">
      <div class="section-label">Log Metrics</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;">
        ${getMetricDefs(user).map(d =>
          renderMetricInput(d.id, d.label, d.unit, savedMetrics[d.id]?.value ?? '', d.step)
        ).join('')}
      </div>
    </div>` : ''}

    ${workout ? renderWorkoutSection(workout, exercises, savedLogs, prevLogs, user.id) : renderRestDay()}

    ${!isFuture ? `
    <div style="margin-top:24px;display:flex;justify-content:flex-end;align-items:center;gap:14px;">
      <span id="dash-save-status" style="font-size:12px;font-weight:600;color:#52525b;transition:color 0.2s;"></span>
      <button onclick="saveLog('${workout?.id || ''}','${date}',false)" class="btn-primary" style="padding:13px 36px;font-size:15px;">
        ${isPast ? 'Update Log' : 'Save Log'}
      </button>
    </div>` : ''}
  `
}

// ── Metric inputs ─────────────────────────────────────────────

function getMetricDefs(user) {
  const defs = [
    { id: 'body_weight',   label: 'Body Weight',       unit: 'lbs', step: '0.1'  },
    { id: 'vertical_jump', label: 'Vertical Jump',      unit: 'in',  step: '0.5'  },
    { id: 'ncm_jump',      label: 'NCM Jump',           unit: 'in',  step: '0.5'  },
    { id: 'cmj',           label: 'CMJ',                unit: 'in',  step: '0.5'  },
    { id: 'sprint_10yd',   label: '10yd Sprint',        unit: 'sec', step: '0.01' },
    { id: 'accel_10yd',    label: '10yd Acceleration',  unit: 'sec', step: '0.01' },
    { id: 'fly_10',        label: 'Fly 10',             unit: 'sec', step: '0.01' },
    { id: 'sprint_40yd',   label: '40yd Sprint',        unit: 'sec', step: '0.01' },
  ]
  if (user?.sport === 'Baseball' || user?.sport === 'Softball')
    defs.push({ id: 'sprint_60yd', label: '60yd Dash', unit: 'sec', step: '0.01' })
  if (user?.gender === 'female')
    defs.push({ id: 'sprint_20yd', label: '20yd Dash', unit: 'sec', step: '0.01' })
  return defs
}

function renderMetricInput(id, label, unit, value, step = '0.1') {
  return `
    <div class="metric-card">
      <label>${label}</label>
      <div class="unit-row">
        <input type="number" id="metric_${id}" placeholder="—" value="${value}" step="${step}" min="0">
        <span class="unit">${unit}</span>
      </div>
    </div>
  `
}

// ── 1RM helpers ───────────────────────────────────────────────

function roundToPlate(weight) {
  return Math.round(weight / 2.5) * 2.5
}

function estimate1RM(weight, reps) {
  if (!weight || !reps || reps < 1) return null
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30))
}

function getAthleteORM(userId, exerciseName) {
  const key    = exerciseName.trim().toLowerCase()
  const manual = lsGet(`p3_1rm_${userId}`) || {}
  if (manual[key]) return { value: manual[key], source: 'manual' }
  const history = lsGet(`p3_lift_history_${userId}`) || {}
  const record  = history[key]
  if (!record?.sets) return null
  let best = null
  record.sets.forEach(s => {
    const w = parseFloat(s.weight), r = parseInt(s.reps)
    if (w && r) {
      const est = estimate1RM(w, r)
      if (est && (!best || est > best)) best = est
    }
  })
  return best ? { value: best, source: 'estimated' } : null
}

function updateORMDisplay(exId, userId, name, pctMin, pctMax, rawValue) {
  const orm   = parseFloat(rawValue)
  const badge = document.getElementById(`orm_badge_${exId}`)
  if (!badge) return
  if (!orm || orm <= 0) {
    badge.innerHTML = '<span style="color:#52525b;">← Enter your 1RM</span>'
    return
  }
  const key = name.trim().toLowerCase()
  const manual = lsGet(`p3_1rm_${userId}`) || {}
  manual[key] = orm
  lsSet(`p3_1rm_${userId}`, manual)
  const lo = pctMin ? roundToPlate(orm * pctMin / 100) : null
  const hi = pctMax ? roundToPlate(orm * pctMax / 100) : null
  const rangeStr = lo !== null && hi !== null ? `${lo}–${hi} lbs`
                 : lo !== null ? `${lo}+ lbs` : `up to ${hi} lbs`
  badge.innerHTML = `→ Work in: <span style="color:#f97316;font-weight:800;">${rangeStr}</span>`
}

// ── Workout section (with superset groups) ────────────────────

function getLastLiftRecord(userId, exerciseName) {
  if (!userId || !exerciseName) return null
  const history = lsGet(`p3_lift_history_${userId}`) || {}
  return history[exerciseName.trim().toLowerCase()] || null
}

function renderWorkoutSection(workout, exercises, savedLogs, prevLogs = {}, userId = null) {
  const groupMap = {}
  const solo     = []
  exercises.forEach(ex => {
    if (ex.group) {
      if (!groupMap[ex.group]) groupMap[ex.group] = []
      groupMap[ex.group].push(ex)
    } else {
      solo.push(ex)
    }
  })

  let num = 1
  const blocks = []

  Object.keys(groupMap).sort().forEach(letter => {
    const gExes = groupMap[letter].sort((a, b) => (a.group_order || 0) - (b.group_order || 0))
    if (gExes.length === 1) {
      blocks.push(renderExercise(gExes[0], num++, savedLogs[gExes[0].id] || {}, prevLogs[gExes[0].id] || {}, letter + '1', false, userId))
    } else {
      const innerHTML = gExes.map((ex, i) =>
        renderExercise(ex, num++, savedLogs[ex.id] || {}, prevLogs[ex.id] || {}, letter + (i + 1), true, userId)
      ).join('')
      blocks.push(`
        <div style="border:1px solid rgba(249,115,22,0.25);border-radius:14px;overflow:hidden;">
          <div style="padding:8px 16px;background:rgba(249,115,22,0.06);border-bottom:1px solid rgba(249,115,22,0.15);display:flex;align-items:center;gap:8px;">
            <div style="width:20px;height:20px;background:#f97316;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:white;">${letter}</div>
            <span style="font-size:11px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:0.07em;">Superset · ${gExes.length} exercises</span>
          </div>
          ${innerHTML}
        </div>
      `)
    }
  })

  solo.forEach(ex => blocks.push(renderExercise(ex, num++, savedLogs[ex.id] || {}, prevLogs[ex.id] || {}, null, false, userId)))

  return `
    <div>
      <div class="section-label">Exercises (${exercises.length})</div>
      ${workout.notes ? `
        <div style="background:rgba(249,115,22,0.05);border:1px solid rgba(249,115,22,0.15);border-radius:10px;padding:11px 16px;margin-bottom:16px;font-size:13px;color:#a1a1aa;display:flex;gap:10px;align-items:flex-start;">
          <span style="flex-shrink:0;">📋</span><span>${workout.notes}</span>
        </div>` : ''}
      <div style="display:flex;flex-direction:column;gap:10px;">${blocks.join('')}</div>
    </div>
  `
}

function renderExercise(ex, num, saved, _prev = {}, label = null, inGroup = false, userId = null) {
  const display   = label || num
  const targetStr = [
    ex.sets          ? `${ex.sets} sets`           : null,
    ex.reps          ? `× ${ex.reps} reps`         : null,
    ex.target_weight ? `@ ${ex.target_weight} lbs` : null,
  ].filter(Boolean).join(' ') || 'See notes'

  // % of 1RM range display
  let pctRangeHTML = ''
  if ((ex.pct_min || ex.pct_max) && userId) {
    const pctStr = ex.pct_min && ex.pct_max ? `${ex.pct_min}–${ex.pct_max}%`
                 : ex.pct_min ? `≥${ex.pct_min}%` : `≤${ex.pct_max}%`
    const currentUser       = getSession()
    const isOwn             = currentUser?.id === userId && !isTrainer(currentUser)
    const isTrainerSelfView = currentUser && isTrainer(currentUser) && currentUser.id === userId
    const orm = isTrainerSelfView ? null : getAthleteORM(userId, ex.name)
    const lo  = orm && ex.pct_min ? roundToPlate(orm.value * ex.pct_min / 100) : null
    const hi  = orm && ex.pct_max ? roundToPlate(orm.value * ex.pct_max / 100) : null

    if (isTrainerSelfView) {
      // Trainer's "All Athletes" default view — show label only
      pctRangeHTML = `
        <div style="margin-top:5px;display:inline-flex;align-items:center;gap:6px;background:rgba(249,115,22,0.06);border:1px solid rgba(249,115,22,0.15);border-radius:8px;padding:4px 10px;">
          <span style="font-size:11px;font-weight:800;color:#f97316;">⚡ ${pctStr} of 1RM</span>
          <span style="font-size:10px;color:#52525b;">athlete-specific</span>
        </div>`
    } else if (isOwn) {
      // Athlete viewing their own workout — editable 1RM input with live range
      const ormVal = orm?.value || ''
      const rangeInit = lo !== null || hi !== null
        ? `→ Work in: <span style="color:#f97316;font-weight:800;">${lo !== null && hi !== null ? `${lo}–${hi}` : lo !== null ? `${lo}+` : `up to ${hi}`} lbs</span>`
        : '<span style="color:#52525b;">← Enter your 1RM</span>'
      pctRangeHTML = `
        <div style="margin-top:8px;background:rgba(249,115,22,0.06);border:1px solid rgba(249,115,22,0.18);border-radius:10px;padding:10px 12px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:12px;font-weight:800;color:#f97316;flex-shrink:0;">⚡ ${pctStr} of 1RM</span>
            <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
              <span style="font-size:11px;color:#71717a;">My 1RM:</span>
              <input type="number" id="orm_input_${ex.id}" value="${ormVal}" placeholder="lbs" min="1" step="2.5"
                oninput="updateORMDisplay('${ex.id}','${userId}','${ex.name.replace(/'/g,"\\'")}',${ex.pct_min||'null'},${ex.pct_max||'null'},this.value)"
                style="width:72px;background:#1c1c1f;border:1px solid #3f3f46;border-radius:7px;padding:5px 8px;color:white;font-size:13px;font-weight:700;text-align:center;outline:none;"
                onfocus="this.style.borderColor='#f97316'" onblur="this.style.borderColor='#3f3f46'">
              <span style="font-size:11px;color:#71717a;">lbs</span>
            </div>
            <div id="orm_badge_${ex.id}">${rangeInit}</div>
          </div>
        </div>`
    } else {
      // Trainer viewing a specific athlete — read-only calculated range
      if (orm) {
        const rangeStr = lo !== null && hi !== null ? `${lo}–${hi} lbs`
                       : lo !== null ? `${lo}+ lbs` : `up to ${hi} lbs`
        pctRangeHTML = `
          <div style="margin-top:5px;display:inline-flex;align-items:center;gap:8px;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.2);border-radius:8px;padding:5px 10px;">
            <span style="font-size:11px;font-weight:800;color:#f97316;">⚡ ${pctStr}</span>
            <span style="font-size:12px;color:white;font-weight:700;">${rangeStr}</span>
            <span style="font-size:10px;color:#52525b;">${orm.value} lb ${orm.source === 'estimated' ? 'est. 1RM' : '1RM'}</span>
          </div>`
      } else {
        pctRangeHTML = `
          <div style="margin-top:5px;display:inline-flex;align-items:center;gap:6px;background:#1c1c1f;border:1px solid #2a2a2f;border-radius:8px;padding:4px 10px;">
            <span style="font-size:11px;font-weight:800;color:#71717a;">⚡ ${pctStr} of 1RM</span>
            <span style="font-size:10px;color:#52525b;">no 1RM on file</span>
          </div>`
      }
    }
  }

  // Lift history lookup by exercise name (most recent session)
  const lastRecord = getLastLiftRecord(userId, ex.name)
  const histSets   = lastRecord ? lastRecord.sets.filter(s => s.weight) : []

  // Current saved sets — seed with saved or default to target sets count
  const savedSets = Array.isArray(saved.sets) && saved.sets.length
    ? saved.sets
    : Array.from({ length: parseInt(ex.sets) || 1 }, (_, i) => ({ set: i + 1, weight: '', reps: '' }))

  const setRowsHTML = savedSets.map((s, i) => renderSetRow(ex.id, i + 1, s.weight, s.reps)).join('')

  const prevPanel = histSets.length ? `
    <div style="border-left:1px solid #1c1c1f;padding-left:12px;min-width:90px;flex-shrink:0;text-align:right;">
      <div style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Last Lift</div>
      <div style="font-size:10px;color:#3f3f46;margin-bottom:5px;">${lastRecord.date}</div>
      <div style="font-size:12px;color:#71717a;line-height:1.9;">
        ${histSets.map(s => `${s.weight} × ${s.reps || '—'}`).join('<br>')}
      </div>
    </div>` : ''

  return `
    <div class="exercise-card" ${inGroup ? 'style="border:none;border-radius:0;border-bottom:1px solid #1c1c1f;margin-bottom:0;"' : ''}>
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
        <div class="ex-num">${display}</div>
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:700;color:white;">${ex.name}</div>
          <div style="font-size:12px;color:#71717a;margin-top:2px;">
            Target: <span style="color:#a1a1aa;">${targetStr}</span>
          </div>
          ${pctRangeHTML}
          ${ex.notes ? `<div style="font-size:12px;color:#f97316;margin-top:4px;">${ex.notes}</div>` : ''}
        </div>
        ${prevPanel}
      </div>

      <!-- Set rows -->
      <div id="sets_${ex.id}" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
        <!-- header -->
        <div style="display:grid;grid-template-columns:36px 1fr 1fr 28px;gap:6px;padding:0 2px;">
          <div style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;text-align:center;">Set</div>
          <div style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;text-align:center;">Weight (lbs)</div>
          <div style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;text-align:center;">Reps</div>
          <div></div>
        </div>
        ${setRowsHTML}
      </div>

      <div style="display:flex;align-items:center;gap:10px;">
        <button onclick="addSetRow('${ex.id}')"
          style="display:flex;align-items:center;gap:5px;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.2);color:#f97316;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.15s;"
          onmouseover="this.style.background='rgba(249,115,22,0.15)'"
          onmouseout="this.style.background='rgba(249,115,22,0.08)'">
          + Add Set
        </button>
        <input type="text" id="log_${ex.id}_notes" class="form-input"
          placeholder="Notes / RPE…" value="${saved.notes || ''}"
          style="flex:1;font-size:12px;padding:6px 10px;">
      </div>
    </div>
  `
}

function renderSetRow(exId, setNum, weight = '', reps = '') {
  return `
    <div data-set-row="${exId}" style="display:grid;grid-template-columns:36px 1fr 1fr 28px;gap:6px;align-items:center;">
      <div style="text-align:center;font-size:13px;font-weight:700;color:#71717a;" data-set-num>${setNum}</div>
      <input type="number" class="form-input set-weight" placeholder="lbs" value="${weight}"
        min="0" step="2.5" style="text-align:center;padding:7px 4px;">
      <input type="number" class="form-input set-reps"  placeholder="—"   value="${reps}"
        min="0" step="1"   style="text-align:center;padding:7px 4px;">
      <button onclick="removeSetRow(this,'${exId}')"
        style="width:24px;height:24px;border-radius:6px;border:1px solid #27272a;background:#18181b;color:#71717a;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;"
        onmouseover="this.style.color='#ef4444';this.style.borderColor='rgba(239,68,68,0.3)'"
        onmouseout="this.style.color='#71717a';this.style.borderColor='#27272a'">×</button>
    </div>
  `
}

function addSetRow(exId) {
  const container = document.getElementById(`sets_${exId}`)
  if (!container) return
  const existing  = container.querySelectorAll('[data-set-row]')
  const nextNum   = existing.length + 1
  const div       = document.createElement('div')
  div.innerHTML   = renderSetRow(exId, nextNum)
  container.appendChild(div.firstElementChild)
}

function removeSetRow(btn, exId) {
  const row = btn.closest('[data-set-row]')
  if (!row) return
  const container = document.getElementById(`sets_${exId}`)
  if (container && container.querySelectorAll('[data-set-row]').length <= 1) return // keep at least 1
  row.remove()
  reNumberSets(exId)
}

function reNumberSets(exId) {
  const container = document.getElementById(`sets_${exId}`)
  if (!container) return
  container.querySelectorAll('[data-set-row]').forEach((row, i) => {
    const label = row.querySelector('[data-set-num]')
    if (label) label.textContent = i + 1
  })
}

function renderRestDay() {
  return `
    <div class="card" style="text-align:center;padding:52px 24px;">
      <div style="font-size:52px;margin-bottom:16px;">🛌</div>
      <div style="font-size:20px;font-weight:700;color:white;margin-bottom:8px;">Rest Day</div>
      <div style="font-size:14px;color:#71717a;">No workout scheduled. Rest up and recover!</div>
    </div>
  `
}

// ── Save log ──────────────────────────────────────────────────

function dashSetStatus(state) {
  const el = document.getElementById('dash-save-status')
  if (!el) return
  if (state === 'typing') { el.textContent = 'Unsaved…'; el.style.color = '#52525b' }
  if (state === 'saving') { el.textContent = 'Saving…';  el.style.color = '#71717a' }
  if (state === 'saved')  { el.textContent = '✓ Saved';  el.style.color = '#22c55e' }
  if (state === 'error')  { el.textContent = 'Error — try again'; el.style.color = '#ef4444' }
}

function dashOnInput() {
  dashSetStatus('typing')
  clearTimeout(_dashSaveTimer)
  _dashSaveTimer = setTimeout(() => saveLog(_dashSaveWorkoutId, _dashSaveDate, true), 1500)
}

function setupDashAutoSave() {
  if (document._dashAutoSaveReady) return
  document._dashAutoSaveReady = true
  document.addEventListener('input', e => {
    const area = document.getElementById('day-content')
    if (!area || !area.contains(e.target)) return
    if (isTrainer(_dashUser)) return  // trainers don't auto-save athlete logs
    dashOnInput()
  })
}

async function saveLog(workoutId, date = TODAY, silent = false) {
  const user = getSession()

  const metrics = {}
  getMetricDefs(user).forEach(({ id, unit }) => {
    const el = document.getElementById(`metric_${id}`)
    if (el && el.value !== '') metrics[id] = { value: parseFloat(el.value), unit }
  })

  const logs    = {}
  const workout = DEMO_MODE
    ? [...DEMO_WORKOUTS, ...(lsGet('p3_demo_workouts') || [])].find(w => w.id === workoutId)
    : _weekWorkouts.find(w => w.id === workoutId)
  const exes    = workout ? workout.exercises : []
  exes.forEach(ex => {
    const setRows = document.querySelectorAll(`[data-set-row="${ex.id}"]`)
    const sets = Array.from(setRows).map((row, i) => ({
      set:    i + 1,
      weight: row.querySelector('.set-weight')?.value || '',
      reps:   row.querySelector('.set-reps')?.value   || '',
    }))
    logs[ex.id] = {
      sets,
      notes: document.getElementById(`log_${ex.id}_notes`)?.value || '',
    }
  })

  if (DEMO_MODE) {
    lsSet(`p3_metrics_${user.id}_${date}`, metrics)
    lsSet(`p3_logs_${user.id}_${date}`,    logs)

    // Update per-exercise lift history (keyed by exercise name)
    const history = lsGet(`p3_lift_history_${user.id}`) || {}
    exes.forEach(ex => {
      const sets = logs[ex.id]?.sets || []
      if (sets.some(s => s.weight)) {
        history[ex.name.trim().toLowerCase()] = {
          date,
          sets,
          notes: logs[ex.id]?.notes || '',
        }
      }
    })
    lsSet(`p3_lift_history_${user.id}`, history)

    // Append best set per exercise to appropriate profile store based on track_as
    const liftLog = lsGet(`p3_lift_log_${user.id}`) || []
    exes.forEach(ex => {
      const trackAs = ex.track_as || 'lift'  // default: lift (backward compat)
      if (trackAs === 'none') return         // explicitly untracked

      const sets = logs[ex.id]?.sets || []
      let bestEst = 0, bestSet = null
      sets.forEach(s => {
        const w = parseFloat(s.weight), r = parseInt(s.reps) || 1
        if (!w) return
        const est = r === 1 ? w : Math.round(w * (1 + r / 30))
        if (est > bestEst) { bestEst = est; bestSet = { weight: w, reps: r } }
      })
      if (!bestSet) return

      if (trackAs === 'metric') {
        // Save as a performance metric (raw best value for that day)
        const dayMetrics = lsGet(`p3_metrics_${user.id}_${date}`) || {}
        dayMetrics[ex.name] = { value: bestSet.weight, unit: 'lbs' }
        lsSet(`p3_metrics_${user.id}_${date}`, dayMetrics)
      } else {
        liftLog.push({ exercise_name: ex.name, date, weight: bestSet.weight, reps: bestSet.reps })
      }
    })
    lsSet(`p3_lift_log_${user.id}`, liftLog)

    markAttendance(user.id, date)
    if (silent) dashSetStatus('saved'); else showToast('Log saved!', 'success')
    return
  }

  if (silent) dashSetStatus('saving')
  try {
    if (Object.keys(metrics).length) {
      await window._supabase.from('performance_metrics').upsert(
        Object.entries(metrics).map(([type, m]) => ({
          athlete_id: user.id, metric_type: type,
          value: m.value, unit: m.unit, recorded_date: date,
        })),
        { onConflict: 'athlete_id,metric_type,recorded_date' }
      )
    }
    if (exes.length) {
      const logRows = exes.map(ex => {
        const sets   = logs[ex.id]?.sets || []
        const logged = sets.filter(s => s.weight || s.reps)
        let bestWeight = 0, bestReps = 0
        logged.forEach(s => {
          const w = parseFloat(s.weight) || 0
          const r = parseInt(s.reps)     || 0
          if (w > bestWeight) { bestWeight = w; bestReps = r }
        })
        return {
          exercise_id:   ex.id,
          athlete_id:    user.id,
          logged_date:   date,
          actual_sets:   logged.length   || null,
          actual_reps:   bestReps        || null,
          actual_weight: bestWeight      || null,
          notes:         logs[ex.id]?.notes || null,
          sets_data:     sets.length ? sets : null,
        }
      }).filter(r => r.actual_sets || r.actual_weight)

      if (logRows.length) {
        await window._supabase.from('workout_logs').upsert(
          logRows, { onConflict: 'exercise_id,athlete_id,logged_date' }
        )
      }
    }
    // Cache full set data locally so the athlete can view it when switching days
    lsSet(`p3_logs_${user.id}_${date}`, logs)
    lsSet(`p3_metrics_${user.id}_${date}`, metrics)
    if (silent) dashSetStatus('saved'); else showToast('Log saved!', 'success')
  } catch { if (silent) dashSetStatus('error'); else showToast('Error saving. Try again.', 'error') }
}

function markAttendance(athleteId, date) {
  const existing = lsGet('p3_attendance') || []
  const idx = existing.findIndex(r => r.athlete_id === athleteId && r.date === date)
  if (idx >= 0) existing[idx].status = 'present'
  else existing.push({ athlete_id: athleteId, date, status: 'present' })
  lsSet('p3_attendance', existing)
}
