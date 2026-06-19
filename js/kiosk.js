// ============================================================
// P3 Rack Station — Kiosk Mode (iPad)
// Two athlete slots, toggle view, on-screen keypad
// ============================================================

const _slots  = { A: null, B: null }  // { user, workout, exercises }
const _drafts = { A: null, B: null }  // { metrics: {id:string}, logs: {exId:{sets,notes}} }
let _active          = 'A'
let _entering        = null   // 'A' | 'B' — which slot is entering a code
let _codeBuf         = ''     // raw keystrokes (without the P3 prefix)
let _menuOpen        = false  // athlete nav dropdown
let _kioskWeekOffset = 0      // shared week offset for the day-tab navigator
let _kioskWeekDates  = [...WEEK_DATES]

// ── Init ──────────────────────────────────────────────────────

function initKiosk() {
  renderKiosk()
}

// ── In-page overlay for profile / leaderboard ─────────────────

function openKioskPage(url, slot) {
  closeKioskMenu()
  setSession(_slots[slot].user)   // give auth to the page inside the iframe

  const overlay = document.createElement('div')
  overlay.id = 'kiosk-page-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:#0a0a0b;display:flex;flex-direction:column;overflow:hidden;'
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid #1c1c1f;background:#0a0a0b;flex-shrink:0;">
      <button onclick="closeKioskPage()"
        style="display:flex;align-items:center;gap:7px;padding:10px 18px;background:#1c1c1f;border:1px solid #27272a;color:#a1a1aa;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all 0.15s;"
        onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
        onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">
        ← Back to Rack Station
      </button>
    </div>
    <iframe src="${url}" style="flex:1;border:none;width:100%;height:100%;" id="kiosk-iframe"></iframe>
  `
  document.body.appendChild(overlay)
}

function closeKioskPage() {
  document.getElementById('kiosk-page-overlay')?.remove()
  clearSession()
}

// ── Athlete lookup — no session side effects ──────────────────

async function findAthleteByCode(raw) {
  const code = raw.trim()
  if (DEMO_MODE) {
    if (DEMO_TRAINER.athlete_code === code) return DEMO_TRAINER
    const all = [...DEMO_ATHLETES, ...(lsGet('p3_demo_athletes') || [])]
    return all.find(a => a.athlete_code === code) || null
  }
  const { data } = await window._supabase
    .from('profiles').select('*').eq('athlete_code', code).single()
  return data || null
}

// Pre-fetch workouts for an athlete across a 5-week window (−1 to +3 from today)
async function prefetchAthleteWorkouts(athlete) {
  // Build the full date range: last week through 3 weeks ahead
  const allDates = []
  for (let w = -1; w <= 3; w++) allDates.push(...getWeekDatesForOffset(w))
  const startDate = allDates[0]
  const endDate   = allDates[allDates.length - 1]

  const groups       = lsGet('p3_athlete_groups') || []
  const userGroupIds = groups.filter(g => g.athlete_ids.includes(athlete.id)).map(g => g.id)
  const inGroup      = w => w.group_id && userGroupIds.includes(w.group_id)

  let weekWorkouts = []
  if (DEMO_MODE) {
    const all = [...(lsGet('p3_demo_workouts') || []), ...DEMO_WORKOUTS]
    weekWorkouts = all.filter(w =>
      w.scheduled_date >= startDate && w.scheduled_date <= endDate &&
      (w.athlete_id === athlete.id || inGroup(w) || (!w.athlete_id && !w.group_id))
    )
  } else {
    // Use RPC so athlete-specific workouts are visible without a Supabase auth session
    const { data } = await window._supabase.rpc('get_athlete_workouts_by_code', {
      p_code:  athlete.athlete_code,
      p_start: startDate,
      p_end:   endDate,
    })
    weekWorkouts = (data || []).map(w => ({ ...w, exercises: w.exercises || [] }))
  }

  const byDate = {}
  allDates.forEach(date => {
    byDate[date] = weekWorkouts.find(w =>
      w.scheduled_date === date &&
      (w.athlete_id === athlete.id ||
       (w.group_id && userGroupIds.includes(w.group_id)) ||
       (!w.athlete_id && !w.group_id))
    ) || null
  })
  return byDate
}

function getWorkoutForAthlete(athlete, date = TODAY) {
  // Read from the pre-fetched cache stored on the slot
  const slot = Object.values(_slots).find(s => s?.user?.id === athlete.id)
  const w    = slot?.workoutsByDate?.[date] || null
  const exercises = w
    ? [...(w.exercises || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    : []
  return { workout: w, exercises }
}

// ── Draft state — preserves unsaved input across slot switches ─

function captureDraft(slot) {
  const s = _slots[slot]
  if (!s) { _drafts[slot] = null; return }
  const { exercises } = getWorkoutForAthlete(s.user, s.selectedDate || TODAY)
  const metrics = {}
  const logs    = {}

  getMetricDefs(s.user).forEach(({ id }) => {
    const el = document.getElementById(`metric_${id}`)
    if (el) metrics[id] = el.value
  })

  exercises.forEach(ex => {
    const setRows = document.querySelectorAll(`[data-set-row="${ex.id}"]`)
    if (!setRows.length) return
    logs[ex.id] = {
      sets:  Array.from(setRows).map((row, i) => ({
        set:    i + 1,
        weight: row.querySelector('.set-weight')?.value || '',
        reps:   row.querySelector('.set-reps')?.value   || '',
      })),
      notes: document.getElementById(`log_${ex.id}_notes`)?.value || '',
    }
  })

  _drafts[slot] = { metrics, logs }
}

// ── Slot management ───────────────────────────────────────────

function openCodeEntry(slot) {
  _entering = slot
  _codeBuf  = ''
  renderKiosk()
}

function kioskKey(ch) {
  if (_codeBuf.length < 3) {
    _codeBuf += ch
    refreshCodeDisplay()
  }
}

function kioskBackspace() {
  _codeBuf = _codeBuf.slice(0, -1)
  refreshCodeDisplay()
}

function kioskClear() {
  _codeBuf = ''
  refreshCodeDisplay()
}

function refreshCodeDisplay() {
  // Update the three digit boxes
  for (let i = 0; i < 3; i++) {
    const box = document.getElementById(`kiosk-digit-${i}`)
    if (!box) continue
    const ch = _codeBuf[i]
    box.textContent = ch || '·'
    box.style.borderColor = ch ? '#f97316' : '#27272a'
    box.style.color = ch ? 'white' : '#3f3f46'
  }
  const btn = document.getElementById('kiosk-submit-btn')
  if (btn) btn.style.background = _codeBuf.length === 3 ? '#f97316' : '#27272a'
}

async function kioskSubmit() {
  if (!_entering) return
  const padded  = _codeBuf.padStart(3, '0')
  const athlete = await findAthleteByCode(padded)
  if (!athlete) {
    showToast('Code not found — try again', 'error')
    _codeBuf = ''
    refreshCodeDisplay()
    return
  }
  const workoutsByDate  = await prefetchAthleteWorkouts(athlete)
  _slots[_entering]    = { user: athlete, selectedDate: TODAY, workoutsByDate }
  _drafts[_entering]   = null
  _active              = _entering
  _entering            = null
  _codeBuf             = ''
  _kioskWeekOffset     = 0
  _kioskWeekDates      = [...WEEK_DATES]
  renderKiosk()
}

function clearSlot(slot, e) {
  if (e) e.stopPropagation()
  _slots[slot]  = null
  _drafts[slot] = null
  if (_active === slot) {
    const other = slot === 'A' ? 'B' : 'A'
    _active = _slots[other] ? other : slot
  }
  renderKiosk()
}

function switchSlot(slot) {
  if (_entering) return
  if (slot === _active) return
  captureDraft(_active)
  _active   = slot
  _menuOpen = false
  renderKiosk()
}

function toggleKioskMenu() {
  _menuOpen = !_menuOpen
  const panel   = document.getElementById('kiosk-menu-panel')
  const overlay = document.getElementById('kiosk-menu-overlay')
  const btn     = document.getElementById('kiosk-menu-btn')
  if (panel)   panel.style.display   = _menuOpen ? 'block' : 'none'
  if (overlay) overlay.style.display = _menuOpen ? 'block' : 'none'
  if (btn) {
    btn.style.background   = _menuOpen ? 'rgba(249,115,22,0.12)' : '#1c1c1f'
    btn.style.borderColor  = _menuOpen ? 'rgba(249,115,22,0.4)'  : '#27272a'
    btn.style.color        = _menuOpen ? '#f97316' : '#a1a1aa'
  }
}

function closeKioskMenu() {
  _menuOpen = false
  const panel   = document.getElementById('kiosk-menu-panel')
  const overlay = document.getElementById('kiosk-menu-overlay')
  const btn     = document.getElementById('kiosk-menu-btn')
  if (panel)   panel.style.display = 'none'
  if (overlay) overlay.style.display = 'none'
  if (btn) { btn.style.background = '#1c1c1f'; btn.style.borderColor = '#27272a'; btn.style.color = '#a1a1aa' }
}

// ── Week day selection ────────────────────────────────────────

function kioskChangeWeek(delta) {
  _kioskWeekOffset += delta
  _kioskWeekDates   = getWeekDatesForOffset(_kioskWeekOffset)
  // If the slot's selected date is outside the new week, land on Monday
  const slot = _slots[_active]
  if (slot && !_kioskWeekDates.includes(slot.selectedDate)) {
    slot.selectedDate = _kioskWeekDates[0]
  }
  renderKiosk()
}

function kioskSwitchDay(date) {
  const slot = _slots[_active]
  if (!slot || slot.selectedDate === date) return
  slot.selectedDate = date
  _drafts[_active] = null
  renderKiosk()
}

function renderKioskDayTabs(slot) {
  const selectedDate = slot.selectedDate || TODAY
  const wkLabel = _kioskWeekOffset === 0 ? 'This Week'
                : _kioskWeekOffset < 0
                  ? `${Math.abs(_kioskWeekOffset)} Week${Math.abs(_kioskWeekOffset) > 1 ? 's' : ''} Ago`
                  : `${_kioskWeekOffset} Week${_kioskWeekOffset > 1 ? 's' : ''} Ahead`
  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const dayTabs = _kioskWeekDates.map((date, i) => {
    const { workout } = getWorkoutForAthlete(slot.user, date)
    const isSelected = date === selectedDate
    const isToday    = date === TODAY
    const hasLog     = Object.keys(lsGet(`p3_logs_${slot.user.id}_${date}`) || {}).length > 0
    const dateNum    = new Date(date + 'T00:00:00').getDate()
    return `
      <button onclick="kioskSwitchDay('${date}')"
        style="flex:1;padding:10px 4px;border-radius:12px;cursor:pointer;text-align:center;min-width:0;position:relative;
          background:${isSelected ? '#f97316' : isToday ? 'rgba(249,115,22,0.08)' : '#18181b'};
          border:2px solid ${isSelected ? '#f97316' : isToday ? 'rgba(249,115,22,0.35)' : '#27272a'};
          transition:all 0.15s;-webkit-tap-highlight-color:transparent;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;
          color:${isSelected ? 'rgba(255,255,255,0.75)' : '#71717a'};">${DAY_NAMES[i]}</div>
        <div style="font-size:20px;font-weight:900;line-height:1.2;margin:1px 0;
          color:${isSelected ? 'white' : isToday ? '#f97316' : '#d4d4d8'};">${dateNum}</div>
        <div style="font-size:9px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 3px;
          color:${isSelected ? 'rgba(255,255,255,0.65)' : '#52525b'};">${workout ? workout.title : '—'}</div>
        ${hasLog
          ? `<div style="font-size:9px;font-weight:800;color:${isSelected ? 'rgba(255,255,255,0.85)' : '#22c55e'};margin-top:2px;">✓ Done</div>`
          : '<div style="font-size:9px;color:transparent;">·</div>'}
      </button>`
  }).join('')

  return `
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <button onclick="kioskChangeWeek(-1)"
          style="display:flex;align-items:center;gap:5px;background:#18181b;border:1px solid #27272a;color:#a1a1aa;border-radius:10px;padding:9px 16px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.15s;-webkit-tap-highlight-color:transparent;"
          onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
          onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">← Prev</button>
        <div style="text-align:center;">
          <div style="font-size:14px;font-weight:700;color:${_kioskWeekOffset === 0 ? '#f97316' : '#a1a1aa'};">${wkLabel}</div>
          <div style="font-size:11px;color:#52525b;">${fmt(_kioskWeekDates[0])} – ${fmt(_kioskWeekDates[4])}</div>
        </div>
        <button onclick="kioskChangeWeek(1)"
          style="display:flex;align-items:center;gap:5px;background:#18181b;border:1px solid #27272a;color:#a1a1aa;border-radius:10px;padding:9px 16px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.15s;-webkit-tap-highlight-color:transparent;"
          onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
          onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">Next →</button>
      </div>
      <div style="display:flex;gap:5px;">${dayTabs}</div>
    </div>
  `
}

// ── Main render ───────────────────────────────────────────────

function renderKiosk() {
  document.getElementById('kiosk-root').innerHTML = `
    ${renderKioskHeader()}
    <div id="kiosk-main" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:24px 24px 60px;">
      ${_entering ? renderCodeEntry() : renderActiveSlot()}
    </div>
  `
}

// ── Header with slot toggle buttons ──────────────────────────

function renderKioskHeader() {
  const activeSlot = _slots[_active]

  const slotBtn = (slot) => {
    const s        = _slots[slot]
    const isActive = (_active === slot) && !_entering
    const name     = s?.user?.full_name || null

    return `
      <div onclick="switchSlot('${slot}')"
        style="flex:1;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:14px;cursor:pointer;
          background:${isActive ? 'rgba(249,115,22,0.1)' : '#111113'};
          border:2px solid ${isActive ? '#f97316' : name ? '#27272a' : '#1c1c1f'};
          transition:all 0.15s;">
        <div style="width:38px;height:38px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;
          background:${isActive ? '#f97316' : name ? '#27272a' : '#18181b'};
          color:${isActive ? 'white' : name ? '#d4d4d8' : '#3f3f46'};">
          ${name ? initials(name) : slot}
        </div>
        <div style="flex:1;min-width:0;overflow:hidden;">
          ${name
            ? `<div style="font-size:14px;font-weight:700;color:${isActive ? 'white' : '#d4d4d8'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
               <div style="font-size:11px;color:${isActive ? '#f97316' : '#52525b'};">Athlete ${slot}${isActive ? ' · active' : ' · tap to switch'}</div>`
            : `<div style="font-size:13px;font-weight:600;color:#52525b;">Athlete ${slot}</div>
               <div style="font-size:11px;color:#3f3f46;">Tap to add athlete</div>`
          }
        </div>
        ${name
          ? `<button onclick="clearSlot('${slot}', event)"
               style="width:28px;height:28px;border-radius:7px;border:1px solid #27272a;background:#18181b;color:#71717a;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;-webkit-tap-highlight-color:transparent;"
               onmouseover="this.style.color='#ef4444';this.style.borderColor='rgba(239,68,68,0.3)'"
               onmouseout="this.style.color='#71717a';this.style.borderColor='#27272a'">×</button>`
          : `<button onclick="event.stopPropagation();openCodeEntry('${slot}')"
               style="width:28px;height:28px;border-radius:7px;border:1px solid rgba(249,115,22,0.35);background:rgba(249,115,22,0.08);color:#f97316;font-size:18px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;-webkit-tap-highlight-color:transparent;">+</button>`
        }
      </div>
    `
  }

  const menuDropdown = activeSlot ? `
    <div style="position:relative;flex-shrink:0;">

      <!-- Menu button -->
      <button id="kiosk-menu-btn" onclick="toggleKioskMenu()"
        style="display:flex;align-items:center;gap:7px;padding:8px 14px;background:#1c1c1f;border:1px solid #27272a;border-radius:10px;color:#a1a1aa;font-size:16px;font-weight:700;cursor:pointer;transition:all 0.15s;-webkit-tap-highlight-color:transparent;white-space:nowrap;">
        ☰
        <span style="font-size:12px;font-weight:600;">Menu</span>
      </button>

      <!-- Full-screen overlay — closes menu on tap outside -->
      <div id="kiosk-menu-overlay" onclick="closeKioskMenu()"
        style="display:none;position:fixed;inset:0;z-index:49;"></div>

      <!-- Dropdown panel -->
      <div id="kiosk-menu-panel"
        style="display:none;position:absolute;top:50px;left:0;z-index:50;
          background:#111113;border:1px solid #27272a;border-radius:16px;
          padding:8px;min-width:250px;
          box-shadow:0 12px 40px rgba(0,0,0,0.7);">

        <!-- Athlete identity -->
        <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #1c1c1f;margin-bottom:6px;">
          <div style="width:40px;height:40px;border-radius:10px;background:#f97316;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;color:white;flex-shrink:0;">
            ${initials(activeSlot.user.full_name)}
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;color:white;">${activeSlot.user.full_name}</div>
            <div style="font-size:11px;color:#71717a;">${activeSlot.user.sport || 'Athlete'} · Code ${activeSlot.user.athlete_code || '—'}</div>
          </div>
        </div>

        <!-- My Profile -->
        <a href="#" onclick="openKioskPage('profile.html?id=${activeSlot.user.id}','${_active}');return false;"
          style="display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:11px;text-decoration:none;transition:background 0.12s;-webkit-tap-highlight-color:transparent;"
          onmouseover="this.style.background='#1c1c1f'" onmouseout="this.style.background='transparent'">
          <div style="width:36px;height:36px;border-radius:9px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">👤</div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:white;">My Profile</div>
            <div style="font-size:11px;color:#71717a;">Stats, progress &amp; attendance</div>
          </div>
          <span style="font-size:14px;color:#52525b;">→</span>
        </a>

        <!-- Leaderboard -->
        <a href="#" onclick="openKioskPage('leaderboard.html','${_active}');return false;"
          style="display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:11px;text-decoration:none;transition:background 0.12s;-webkit-tap-highlight-color:transparent;"
          onmouseover="this.style.background='#1c1c1f'" onmouseout="this.style.background='transparent'">
          <div style="width:36px;height:36px;border-radius:9px;background:rgba(234,179,8,0.15);border:1px solid rgba(234,179,8,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🏆</div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:white;">Leaderboard</div>
            <div style="font-size:11px;color:#71717a;">Team rankings</div>
          </div>
          <span style="font-size:14px;color:#52525b;">→</span>
        </a>

      </div>
    </div>` : ''

  return `
    <div style="padding:14px 18px;border-bottom:1px solid #1c1c1f;background:#0a0a0b;display:flex;align-items:center;gap:12px;flex-shrink:0;">

      <!-- Left: logo + home + menu -->
      <div style="display:flex;align-items:center;gap:8px;padding-right:14px;border-right:1px solid #27272a;flex-shrink:0;">
        <div style="width:34px;height:34px;border-radius:9px;background:#f97316;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(249,115,22,0.3);">
          <span style="color:white;font-weight:900;font-size:13px;">P3</span>
        </div>
        <a href="index.html"
          style="display:flex;align-items:center;gap:5px;padding:7px 12px;background:#1c1c1f;border:1px solid #27272a;border-radius:8px;color:#71717a;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;transition:all 0.15s;"
          onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
          onmouseout="this.style.color='#71717a';this.style.borderColor='#27272a'">
          ← Home
        </a>
        ${menuDropdown}
      </div>

      <!-- Slot toggle buttons -->
      <div style="display:flex;gap:8px;flex:1;">
        ${slotBtn('A')}
        ${slotBtn('B')}
      </div>
    </div>
  `
}

// ── Athlete tab switcher (shown when both slots are occupied) ──

function renderAthleteTabBar() {
  if (!_slots.A || !_slots.B) return ''

  const tab = (slot) => {
    const s        = _slots[slot]
    const isActive = slot === _active
    const savedLogs = lsGet(`p3_logs_${s.user.id}_${s.selectedDate || TODAY}`) || {}
    const logged    = Object.keys(savedLogs).length > 0

    return `
      <div onclick="${isActive ? '' : `switchSlot('${slot}')`}"
        style="flex:1;display:flex;align-items:center;gap:14px;padding:16px 20px;border-radius:16px;
          background:${isActive ? 'rgba(249,115,22,0.12)' : '#111113'};
          border:2px solid ${isActive ? '#f97316' : '#2a2a2f'};
          cursor:${isActive ? 'default' : 'pointer'};
          transition:all 0.15s;-webkit-tap-highlight-color:transparent;">
        <div style="width:48px;height:48px;border-radius:13px;flex-shrink:0;
          display:flex;align-items:center;justify-content:center;
          font-size:17px;font-weight:900;color:white;
          background:${isActive ? '#f97316' : '#27272a'};
          box-shadow:${isActive ? '0 4px 14px rgba(249,115,22,0.35)' : 'none'};">
          ${initials(s.user.full_name)}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:800;color:${isActive ? 'white' : '#a1a1aa'};
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${s.user.full_name}
          </div>
          <div style="font-size:12px;margin-top:2px;color:${isActive ? '#f97316' : '#52525b'};">
            ${isActive ? '● Viewing now' : '↑ Tap to view'}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">
          <span style="font-size:11px;font-weight:800;padding:3px 9px;border-radius:6px;
            background:${isActive ? '#f97316' : '#1c1c1f'};
            color:${isActive ? 'white' : '#52525b'};">
            Athlete ${slot}
          </span>
          ${logged ? `<span style="font-size:11px;font-weight:700;color:#22c55e;">✓ Logged</span>` : ''}
        </div>
      </div>
    `
  }

  return `
    <div style="display:flex;gap:10px;margin-bottom:24px;">
      ${tab('A')}
      ${tab('B')}
    </div>
  `
}

// ── Active slot content ───────────────────────────────────────

function renderActiveSlot() {
  const slot = _slots[_active]

  if (!slot) {
    const other     = _active === 'A' ? 'B' : 'A'
    const otherSlot = _slots[other]
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:20px;text-align:center;">
        <div style="font-size:60px;line-height:1;">🏋️</div>
        <div>
          <div style="font-size:24px;font-weight:900;color:white;margin-bottom:8px;">Ready to Train</div>
          <div style="font-size:15px;color:#71717a;">Enter your athlete code to load today's workout</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:4px;flex-wrap:wrap;justify-content:center;">
          <button onclick="openCodeEntry('${_active}')"
            style="padding:16px 32px;background:#f97316;border:none;border-radius:14px;color:white;font-size:16px;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent;">
            Athlete ${_active} — Enter Code
          </button>
          ${otherSlot ? `
          <button onclick="switchSlot('${other}')"
            style="padding:16px 32px;background:#1c1c1f;border:1px solid #27272a;border-radius:14px;color:#a1a1aa;font-size:16px;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent;">
            Switch to ${otherSlot.user.full_name.split(' ')[0]} (${other})
          </button>` : `
          <button onclick="openCodeEntry('${other}')"
            style="padding:16px 32px;background:#1c1c1f;border:1px solid #27272a;border-radius:14px;color:#a1a1aa;font-size:16px;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent;">
            Athlete ${other} — Enter Code
          </button>`}
        </div>
      </div>
    `
  }

  const { user } = slot
  const date         = slot.selectedDate || TODAY
  const { workout, exercises } = getWorkoutForAthlete(user, date)
  const savedLogs    = lsGet(`p3_logs_${user.id}_${date}`)               || {}
  const savedMetrics = lsGet(`p3_metrics_${user.id}_${date}`)            || {}
  const prevLogs     = lsGet(`p3_logs_${user.id}_${prevWeekDate(date)}`) || {}
  const firstName    = user.full_name.split(' ')[0]
  const alreadySaved = Object.keys(savedLogs).length > 0
  const isFuture     = date > TODAY
  const draft        = _drafts[_active]
  // Use draft logs (unsaved in-progress input) if available, else fall back to saved
  const displayLogs  = (draft?.logs && Object.keys(draft.logs).length) ? draft.logs : savedLogs

  return `
    <div style="max-width:720px;margin:0 auto;">

      <!-- Athlete tab switcher (both slots) or single header (one slot) -->
      ${_slots.A && _slots.B
        ? renderAthleteTabBar()
        : `<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
            <div style="width:48px;height:48px;border-radius:13px;background:#f97316;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900;color:white;box-shadow:0 4px 14px rgba(249,115,22,0.3);flex-shrink:0;">
              ${initials(user.full_name)}
            </div>
            <div>
              <div style="font-size:22px;font-weight:900;color:white;line-height:1.2;">${firstName}'s Workout</div>
              <div style="font-size:13px;color:#71717a;margin-top:2px;">${todayLabel()}</div>
            </div>
            ${alreadySaved ? `<div style="margin-left:auto;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:5px 12px;font-size:12px;font-weight:700;color:#22c55e;">✓ Logged</div>` : ''}
          </div>`
      }

      <!-- Week day tabs -->
      ${renderKioskDayTabs(slot)}

      <!-- Metrics (hide for future days) -->
      ${!isFuture ? `
      <div style="margin-bottom:28px;">
        <div class="section-label">Log Metrics</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;">
          ${getMetricDefs(user).map(d => {
            const draftVal = draft?.metrics?.[d.id]
            const val = draftVal !== undefined ? draftVal : (savedMetrics[d.id]?.value ?? '')
            return renderMetricInput(d.id, d.label, d.unit, val, d.step)
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Workout -->
      ${workout ? renderWorkoutSection(workout, exercises, isFuture ? {} : displayLogs, prevLogs, user.id) : renderRestDay()}

      <!-- Save / future notice -->
      ${isFuture
        ? `<div style="margin-top:28px;text-align:center;padding:14px 20px;background:#18181b;border:1px solid #27272a;border-radius:14px;">
             <span style="font-size:13px;color:#52525b;">Upcoming — log opens on the training day</span>
           </div>`
        : `<div style="margin-top:28px;display:flex;justify-content:flex-end;">
             <button onclick="saveKioskLog('${user.id}')"
               style="padding:18px 52px;background:#f97316;border:none;border-radius:14px;color:white;font-size:18px;font-weight:900;cursor:pointer;box-shadow:0 4px 16px rgba(249,115,22,0.35);transition:opacity 0.15s;-webkit-tap-highlight-color:transparent;"
               onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
               ${alreadySaved ? 'Update Log ✓' : 'Save Log ✓'}
             </button>
           </div>`
      }

    </div>
  `
}

// ── On-screen code entry keypad ───────────────────────────────

function renderCodeEntry() {
  const digits   = ['1','2','3','4','5','6','7','8','9','·','0','⌫']

  const dKey = (ch) => {
    const isBack  = ch === '⌫'
    const isBlank = ch === '·'
    return `
      <button class="kiosk-key${isBlank ? '' : ' digit'}"
        onclick="${isBack ? 'kioskBackspace()' : isBlank ? '' : `kioskKey('${ch}')`}"
        onmousedown="event.preventDefault()"
        style="${isBlank ? 'opacity:0;pointer-events:none;' : ''}font-size:${isBack ? '20px' : '22px'};">
        ${ch}
      </button>`
  }

  const boxStyle = (i) => {
    const ch = _codeBuf[i]
    return `
      id="kiosk-digit-${i}"
      style="width:80px;height:96px;border-radius:16px;background:#111113;
        border:2px solid ${ch ? '#f97316' : '#27272a'};
        display:flex;align-items:center;justify-content:center;
        font-size:52px;font-weight:900;font-family:monospace;
        color:${ch ? 'white' : '#3f3f46'};transition:border-color 0.15s,color 0.15s;">
      ${ch || '·'}`
  }

  return `
    <div style="max-width:380px;margin:0 auto;text-align:center;">

      <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:24px;">
        Athlete ${_entering} — Enter Your Code
      </div>

      <!-- 3-digit display -->
      <div style="display:flex;justify-content:center;gap:14px;margin-bottom:32px;">
        <div ${boxStyle(0)}></div>
        <div ${boxStyle(1)}></div>
        <div ${boxStyle(2)}></div>
      </div>

      <!-- Numpad (3×4 like a phone) -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
        ${digits.map(dKey).join('')}
      </div>

      <!-- Cancel / Enter -->
      <div style="display:flex;gap:10px;margin-top:4px;">
        <button onclick="_entering=null;_codeBuf='';renderKiosk()" onmousedown="event.preventDefault()"
          style="flex:1;padding:18px;background:#1c1c1f;border:1px solid #27272a;color:#71717a;border-radius:13px;font-size:15px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent;">
          Cancel
        </button>
        <button id="kiosk-submit-btn" onclick="kioskSubmit()" onmousedown="event.preventDefault()"
          style="flex:2;padding:18px;background:${_codeBuf.length === 3 ? '#f97316' : '#27272a'};border:none;border-radius:13px;color:white;font-size:17px;font-weight:900;cursor:pointer;transition:background 0.2s;-webkit-tap-highlight-color:transparent;">
          Enter →
        </button>
      </div>
    </div>
  `
}

// ── Save ──────────────────────────────────────────────────────

async function saveKioskLog(userId) {
  const slotKey = _slots.A?.user.id === userId ? 'A' : 'B'
  const slot = _slots[slotKey]
  if (!slot) return
  const { user } = slot
  const date = slot.selectedDate || TODAY
  const { exercises: exes } = getWorkoutForAthlete(user, date)

  const metrics = {}
  getMetricDefs(user).forEach(({ id, unit }) => {
    const el = document.getElementById(`metric_${id}`)
    if (el && el.value !== '') metrics[id] = { value: parseFloat(el.value), unit }
  })

  const logs = {}
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
    lsSet(`p3_metrics_${userId}_${date}`, metrics)
    lsSet(`p3_logs_${userId}_${date}`, logs)

    _drafts[slotKey] = null

    const history = lsGet(`p3_lift_history_${userId}`) || {}
    exes.forEach(ex => {
      const sets = logs[ex.id]?.sets || []
      if (sets.some(s => s.weight)) {
        history[ex.name.trim().toLowerCase()] = { date, sets, notes: logs[ex.id]?.notes || '' }
      }
    })
    lsSet(`p3_lift_history_${userId}`, history)

    const liftLog = lsGet(`p3_lift_log_${userId}`) || []
    exes.forEach(ex => {
      const trackAs = ex.track_as || 'lift'
      if (trackAs === 'none') return
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
        const dayMetrics = lsGet(`p3_metrics_${userId}_${date}`) || {}
        dayMetrics[ex.name] = { value: bestSet.weight, unit: 'lbs' }
        lsSet(`p3_metrics_${userId}_${date}`, dayMetrics)
      } else {
        liftLog.push({ exercise_name: ex.name, date, weight: bestSet.weight, reps: bestSet.reps })
      }
    })
    lsSet(`p3_lift_log_${userId}`, liftLog)

    markAttendance(userId, date)
  } else {
    try {
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
          actual_sets:   logged.length   || null,
          actual_reps:   bestReps        || null,
          actual_weight: bestWeight      || null,
          notes:         logs[ex.id]?.notes || null,
        }
      }).filter(r => r.actual_sets || r.actual_weight)

      const { error } = await window._supabase.rpc('save_kiosk_log', {
        p_code:          slot.user.athlete_code,
        p_date:          date,
        p_metrics:       Object.keys(metrics).length ? metrics : null,
        p_exercise_logs: logRows.length ? logRows : null,
      })
      if (error) throw error

      _drafts[slotKey] = null
    } catch(e) {
      showToast('Error saving — check connection', 'error')
      return
    }
  }

  const firstName = user.full_name.split(' ')[0]
  showToast(`${firstName}'s log saved!`, 'success')
  renderKiosk()
}
