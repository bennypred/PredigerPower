// ============================================================
// Food Log
// ============================================================

const FL_MEALS = [
  { id: 'breakfast', label: 'Breakfast', icon: '🍳', placeholder: 'e.g. 3 eggs, oatmeal, banana…' },
  { id: 'lunch',     label: 'Lunch',     icon: '🥗', placeholder: 'e.g. chicken rice bowl, salad…' },
  { id: 'dinner',    label: 'Dinner',    icon: '🍽️', placeholder: 'e.g. salmon, sweet potato, broccoli…' },
  { id: 'snacks',    label: 'Snacks',    icon: '🍎', placeholder: 'e.g. protein shake, almonds, apple…' },
]

let _flUser         = null
let _flSelectedDate = null
let _flWeekOffset   = 0
let _flWeekDates    = []
let _flAthletes     = []
let _flViewingId    = null   // trainer only: which athlete's log to view
let _flSaveTimer    = null   // debounce handle

async function initFoodLog(user) {
  _flUser         = user
  _flWeekOffset   = 0
  _flWeekDates    = getWeekDatesForOffset(0)
  _flSelectedDate = TODAY

  if (isTrainer(user)) {
    if (DEMO_MODE) {
      _flAthletes = [...DEMO_ATHLETES, ...(lsGet('p3_demo_athletes') || [])]
    } else {
      const { data } = await window._supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'athlete')
        .order('full_name')
      _flAthletes = data || []
    }
  }

  await renderFoodLogPage()
}

async function flChangeWeek(delta) {
  _flWeekOffset  += delta
  _flWeekDates    = getWeekDatesForOffset(_flWeekOffset)
  _flSelectedDate = _flWeekOffset === 0 ? TODAY : _flWeekDates[0]
  await renderFoodLogPage()
}

async function flSwitchDay(date) {
  if (_flSelectedDate === date) return
  _flSelectedDate = date
  await renderFoodLogPage()
}

async function flSwitchAthlete() {
  const sel = document.getElementById('fl-athlete-select')
  _flViewingId = sel ? (sel.value || null) : null
  await renderFoodLogPage()
}

// ── Auto-save ─────────────────────────────────────────────────

function flOnInput() {
  flSetStatus('typing')
  clearTimeout(_flSaveTimer)
  _flSaveTimer = setTimeout(flDoSave, 1500)
}

function flSetStatus(state) {
  const el = document.getElementById('fl-save-status')
  if (!el) return
  if (state === 'typing')  { el.textContent = 'Unsaved…';  el.style.color = '#52525b' }
  if (state === 'saving')  { el.textContent = 'Saving…';   el.style.color = '#71717a' }
  if (state === 'saved')   { el.textContent = '✓ Saved';   el.style.color = '#22c55e' }
  if (state === 'error')   { el.textContent = 'Error — try again'; el.style.color = '#ef4444' }
}

async function flDoSave() {
  const trainer  = isTrainer(_flUser)
  const targetId = trainer ? _flViewingId : _flUser.id
  if (!targetId) return

  flSetStatus('saving')

  const entry = {}
  FL_MEALS.forEach(m => {
    const el = document.getElementById(`fl_meal_${m.id}`)
    entry[m.id] = el ? el.value : ''
  })

  if (DEMO_MODE) {
    lsSet(`p3_food_${targetId}_${_flSelectedDate}`, entry)
    flSetStatus('saved')
    return
  }

  // Athletes log in via 3-digit code and have no Supabase auth session — use
  // a security definer RPC that authenticates via athlete_code to bypass RLS.
  // Trainers have a real auth session so they can upsert directly.
  let error
  if (!trainer && _flUser.athlete_code) {
    ;({ error } = await window._supabase.rpc('save_food_log', {
      p_code:      _flUser.athlete_code,
      p_date:      _flSelectedDate,
      p_breakfast: entry.breakfast || null,
      p_lunch:     entry.lunch     || null,
      p_dinner:    entry.dinner    || null,
      p_snacks:    entry.snacks    || null,
    }))
  } else {
    ;({ error } = await window._supabase
      .from('food_logs')
      .upsert(
        { athlete_id: targetId, log_date: _flSelectedDate, ...entry },
        { onConflict: 'athlete_id,log_date' }
      ))
  }
  flSetStatus(error ? 'error' : 'saved')
}

// ── Data helpers ──────────────────────────────────────────────

async function flGetEntry(athleteId, date) {
  if (DEMO_MODE) {
    return lsGet(`p3_food_${athleteId}_${date}`) || {}
  }
  const { data } = await window._supabase
    .from('food_logs')
    .select('breakfast, lunch, dinner, snacks')
    .eq('athlete_id', athleteId)
    .eq('log_date', date)
    .maybeSingle()
  return data || {}
}

// ── Render ────────────────────────────────────────────────────

async function renderFoodLogPage() {
  const user    = _flUser
  const trainer = isTrainer(user)
  const date    = _flSelectedDate
  const viewId  = trainer ? _flViewingId : user.id

  const wkLabel = _flWeekOffset === 0 ? 'This Week'
    : _flWeekOffset < 0 ? `${Math.abs(_flWeekOffset)} Week${Math.abs(_flWeekOffset) > 1 ? 's' : ''} Ago`
    : `${_flWeekOffset} Week${_flWeekOffset > 1 ? 's' : ''} Ahead`

  const fmtShort = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const navArrows = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <button onclick="flChangeWeek(-1)"
        style="display:flex;align-items:center;gap:5px;background:#18181b;border:1px solid #27272a;color:#a1a1aa;border-radius:10px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;"
        onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
        onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">← Prev</button>
      <div style="text-align:center;">
        <div style="font-size:14px;font-weight:700;color:${_flWeekOffset === 0 ? '#f97316' : 'white'};">${wkLabel}</div>
        <div style="font-size:11px;color:#52525b;margin-top:1px;">${fmtShort(_flWeekDates[0])} – ${fmtShort(_flWeekDates[4])}</div>
      </div>
      <button onclick="flChangeWeek(1)"
        style="display:flex;align-items:center;gap:5px;background:#18181b;border:1px solid #27272a;color:#a1a1aa;border-radius:10px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;"
        onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
        onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">Next →</button>
    </div>`

  const tabsHTML = _flWeekDates.map((d, i) => {
    const isActive = d === date
    const isToday  = d === TODAY
    const dateNum  = new Date(d + 'T00:00:00').getDate()
    return `
      <button onclick="flSwitchDay('${d}')"
        style="flex:1;padding:10px 4px;border-radius:12px;cursor:pointer;text-align:center;min-width:0;
          background:${isActive ? '#f97316' : isToday ? 'rgba(249,115,22,0.08)' : '#18181b'};
          border:2px solid ${isActive ? '#f97316' : isToday ? 'rgba(249,115,22,0.35)' : '#27272a'};
          transition:all 0.15s;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${isActive ? 'rgba(255,255,255,0.75)' : '#71717a'};">
          ${['Mon','Tue','Wed','Thu','Fri'][i]}
        </div>
        <div style="font-size:20px;font-weight:900;line-height:1.2;margin:1px 0;color:${isActive ? 'white' : isToday ? '#f97316' : '#d4d4d8'};">${dateNum}</div>
      </button>`
  }).join('')

  let trainerSelectorHTML = ''
  if (trainer) {
    const opts = _flAthletes.map(a =>
      `<option value="${a.id}" ${_flViewingId === a.id ? 'selected' : ''}>${escapeHtml(a.full_name)}</option>`
    ).join('')
    trainerSelectorHTML = `
      <div style="margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">View Athlete</div>
        <select id="fl-athlete-select" onchange="flSwitchAthlete()"
          style="background:#1c1c1f;border:2px solid ${_flViewingId ? '#f97316' : '#27272a'};border-radius:10px;
            color:${_flViewingId ? 'white' : '#71717a'};font-size:13px;font-weight:600;
            padding:9px 36px 9px 14px;min-width:220px;max-width:100%;cursor:pointer;outline:none;
            appearance:none;-webkit-appearance:none;
            background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E&quot;);
            background-repeat:no-repeat;background-position:right 12px center;background-size:16px;">
          <option value="">— Select athlete —</option>
          ${opts}
        </select>
      </div>`
  }

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })

  let pageHTML = `
    <div class="page-header">
      <h1>Food Log</h1>
      <p>Track daily nutrition — Breakfast, Lunch, Dinner &amp; Snacks.</p>
    </div>
    ${trainerSelectorHTML}
    ${navArrows}
    <div style="display:flex;gap:6px;margin-bottom:24px;">${tabsHTML}</div>`

  if (trainer && !_flViewingId) {
    pageHTML += `
      <div style="background:#111113;border:1px solid #27272a;border-radius:16px;padding:48px 24px;text-align:center;">
        <div style="font-size:40px;margin-bottom:16px;">🥗</div>
        <div style="font-size:16px;font-weight:700;color:white;margin-bottom:8px;">Select an athlete above</div>
        <div style="font-size:13px;color:#52525b;">You'll see their food log for any day of the week.</div>
      </div>`
    document.getElementById('page-content').innerHTML = pageHTML
    return
  }

  pageHTML += `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div style="font-size:13px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">${dateLabel}</div>
      ${!trainer ? `<div id="fl-save-status" style="font-size:12px;font-weight:600;color:#52525b;transition:color 0.2s;"></div>` : ''}
    </div>
    <div id="fl-meals-area">
      <div style="text-align:center;padding:40px;color:#52525b;font-size:13px;">Loading…</div>
    </div>`

  document.getElementById('page-content').innerHTML = pageHTML

  const entry      = viewId ? await flGetEntry(viewId, date) : {}
  const isFuture   = date > TODAY
  const hasContent = Object.values(entry).some(v => v && v.trim())

  let mealsHTML = ''

  if (isFuture && !trainer) {
    mealsHTML = `
      <div style="background:#18181b;border:1px solid #27272a;border-radius:14px;padding:40px 24px;text-align:center;">
        <div style="font-size:13px;color:#52525b;">Log opens on the day — come back then!</div>
      </div>`
  } else if (trainer && !hasContent) {
    mealsHTML = `
      <div style="background:#111113;border:1px solid #27272a;border-radius:14px;padding:40px 24px;text-align:center;">
        <div style="font-size:13px;color:#52525b;">No food logged for this day.</div>
      </div>`
  } else {
    mealsHTML = FL_MEALS.map(m => {
      const val = entry[m.id] || ''
      if (trainer && !val) return ''   // skip empty meals in read-only view
      return `
        <div class="meal-card">
          <div class="meal-label">
            <span class="meal-icon">${m.icon}</span>
            ${m.label}
          </div>
          ${trainer
            ? `<div class="meal-readonly" style="color:${val ? 'white' : '#3f3f46'};">${val ? escapeHtml(val) : 'Nothing logged'}</div>`
            : `<textarea id="fl_meal_${m.id}" class="meal-textarea" placeholder="${m.placeholder}"
                 oninput="flOnInput()">${escapeHtml(val)}</textarea>`
          }
        </div>`
    }).filter(Boolean).join('')

    if (!trainer && !mealsHTML) mealsHTML = FL_MEALS.map(m => `
        <div class="meal-card">
          <div class="meal-label"><span class="meal-icon">${m.icon}</span>${m.label}</div>
          <textarea id="fl_meal_${m.id}" class="meal-textarea" placeholder="${m.placeholder}"
            oninput="flOnInput()"></textarea>
        </div>`).join('')
  }

  const mealsArea = document.getElementById('fl-meals-area')
  if (mealsArea) mealsArea.innerHTML = mealsHTML
}
