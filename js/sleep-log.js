// ============================================================
// Sleep Log
// ============================================================

let _slUser         = null
let _slSelectedDate = null
let _slWeekOffset   = 0
let _slWeekDates    = []
let _slAthletes     = []
let _slViewingId    = null
let _slSaveTimer    = null
let _slEnergy       = null   // currently selected energy level (1–10)

async function initSleepLog(user) {
  _slUser         = user
  _slWeekOffset   = 0
  _slWeekDates    = getWeekDatesForOffset(0)
  _slSelectedDate = TODAY

  if (isTrainer(user)) {
    if (DEMO_MODE) {
      _slAthletes = [...DEMO_ATHLETES, ...(lsGet('p3_demo_athletes') || [])]
    } else {
      const { data } = await window._supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'athlete')
        .order('full_name')
      _slAthletes = data || []
    }
  }

  await renderSleepLogPage()
}

async function slChangeWeek(delta) {
  _slWeekOffset  += delta
  _slWeekDates    = getWeekDatesForOffset(_slWeekOffset)
  _slSelectedDate = _slWeekOffset === 0 ? TODAY : _slWeekDates[0]
  await renderSleepLogPage()
}

async function slSwitchDay(date) {
  if (_slSelectedDate === date) return
  _slSelectedDate = date
  await renderSleepLogPage()
}

async function slSwitchAthlete() {
  const sel = document.getElementById('sl-athlete-select')
  _slViewingId = sel ? (sel.value || null) : null
  await renderSleepLogPage()
}

// ── Energy level picker ───────────────────────────────────────

function slPickEnergy(level) {
  _slEnergy = level
  // Re-render the energy row only
  const row = document.getElementById('sl-energy-row')
  if (row) row.innerHTML = energyBtnsHTML(level, false)
  slOnInput()
}

function energyBtnsHTML(selected, readOnly) {
  if (readOnly) {
    if (!selected) return `<div style="color:#3f3f46;font-size:13px;">Not recorded</div>`
    return `
      <div style="display:flex;gap:6px;align-items:center;">
        ${[1,2,3,4,5,6,7,8,9,10].map(n => {
          const color = n <= 3 ? '#ef4444' : n <= 6 ? '#eab308' : '#22c55e'
          const active = n === selected
          return `<div style="flex:1;padding:8px 2px;border-radius:8px;font-size:13px;font-weight:800;text-align:center;
            background:${active ? color + '22' : '#111113'};border:2px solid ${active ? color : '#27272a'};
            color:${active ? color : '#3f3f46'};">${n}</div>`
        }).join('')}
      </div>`
  }
  return `
    <div id="sl-energy-row" style="display:flex;gap:6px;">
      ${[1,2,3,4,5,6,7,8,9,10].map(n => {
        const color = n <= 3 ? '#ef4444' : n <= 6 ? '#eab308' : '#22c55e'
        const active = n === selected
        return `<button class="energy-btn" onclick="slPickEnergy(${n})"
          style="border-color:${active ? color : '#27272a'};
            background:${active ? color + '22' : '#111113'};
            color:${active ? color : '#52525b'};">${n}</button>`
      }).join('')}
    </div>`
}

// ── Auto-save ─────────────────────────────────────────────────

function slOnInput() {
  slSetStatus('typing')
  clearTimeout(_slSaveTimer)
  _slSaveTimer = setTimeout(slDoSave, 1500)
}

function slSetStatus(state) {
  const el = document.getElementById('sl-save-status')
  if (!el) return
  if (state === 'typing') { el.textContent = 'Unsaved…';         el.style.color = '#52525b' }
  if (state === 'saving') { el.textContent = 'Saving…';          el.style.color = '#71717a' }
  if (state === 'saved')  { el.textContent = '✓ Saved';          el.style.color = '#22c55e' }
  if (state === 'error')  { el.textContent = 'Error — try again'; el.style.color = '#ef4444' }
}

async function slDoSave() {
  const trainer  = isTrainer(_slUser)
  const targetId = trainer ? _slViewingId : _slUser.id
  if (!targetId) return

  slSetStatus('saving')

  const sleepEl = document.getElementById('sl_sleep_time')
  const wakeEl  = document.getElementById('sl_wake_time')
  const notesEl = document.getElementById('sl_notes')

  const entry = {
    sleep_time:   sleepEl ? (sleepEl.value || null) : null,
    wake_time:    wakeEl  ? (wakeEl.value  || null) : null,
    energy_level: _slEnergy || null,
    notes:        notesEl ? notesEl.value.trim() : '',
  }

  if (DEMO_MODE) {
    lsSet(`p3_sleep_${targetId}_${_slSelectedDate}`, entry)
    slSetStatus('saved')
    return
  }

  const { error } = await window._supabase
    .from('sleep_logs')
    .upsert(
      { athlete_id: targetId, log_date: _slSelectedDate, ...entry },
      { onConflict: 'athlete_id,log_date' }
    )
  slSetStatus(error ? 'error' : 'saved')
}

// ── Data helpers ──────────────────────────────────────────────

async function slGetEntry(athleteId, date) {
  if (DEMO_MODE) {
    return lsGet(`p3_sleep_${athleteId}_${date}`) || {}
  }
  const { data } = await window._supabase
    .from('sleep_logs')
    .select('sleep_time, wake_time, energy_level, notes')
    .eq('athlete_id', athleteId)
    .eq('log_date', date)
    .maybeSingle()
  return data || {}
}

// ── Render ────────────────────────────────────────────────────

async function renderSleepLogPage() {
  const user    = _slUser
  const trainer = isTrainer(user)
  const date    = _slSelectedDate
  const viewId  = trainer ? _slViewingId : user.id

  _slEnergy = null   // reset on page switch; filled after data loads

  const wkLabel = _slWeekOffset === 0 ? 'This Week'
    : _slWeekOffset < 0 ? `${Math.abs(_slWeekOffset)} Week${Math.abs(_slWeekOffset) > 1 ? 's' : ''} Ago`
    : `${_slWeekOffset} Week${_slWeekOffset > 1 ? 's' : ''} Ahead`

  const fmtShort = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const navArrows = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <button onclick="slChangeWeek(-1)"
        style="display:flex;align-items:center;gap:5px;background:#18181b;border:1px solid #27272a;color:#a1a1aa;border-radius:10px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;"
        onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
        onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">← Prev</button>
      <div style="text-align:center;">
        <div style="font-size:14px;font-weight:700;color:${_slWeekOffset === 0 ? '#a855f7' : 'white'};">${wkLabel}</div>
        <div style="font-size:11px;color:#52525b;margin-top:1px;">${fmtShort(_slWeekDates[0])} – ${fmtShort(_slWeekDates[4])}</div>
      </div>
      <button onclick="slChangeWeek(1)"
        style="display:flex;align-items:center;gap:5px;background:#18181b;border:1px solid #27272a;color:#a1a1aa;border-radius:10px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;"
        onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
        onmouseout="this.style.color='#a1a1aa';this.style.borderColor='#27272a'">Next →</button>
    </div>`

  const tabsHTML = _slWeekDates.map((d, i) => {
    const isActive = d === date
    const isToday  = d === TODAY
    const dateNum  = new Date(d + 'T00:00:00').getDate()
    return `
      <button onclick="slSwitchDay('${d}')"
        style="flex:1;padding:10px 4px;border-radius:12px;cursor:pointer;text-align:center;min-width:0;
          background:${isActive ? '#a855f7' : isToday ? 'rgba(168,85,247,0.08)' : '#18181b'};
          border:2px solid ${isActive ? '#a855f7' : isToday ? 'rgba(168,85,247,0.35)' : '#27272a'};
          transition:all 0.15s;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${isActive ? 'rgba(255,255,255,0.75)' : '#71717a'};">
          ${['Mon','Tue','Wed','Thu','Fri'][i]}
        </div>
        <div style="font-size:20px;font-weight:900;line-height:1.2;margin:1px 0;color:${isActive ? 'white' : isToday ? '#a855f7' : '#d4d4d8'};">${dateNum}</div>
      </button>`
  }).join('')

  let trainerSelectorHTML = ''
  if (trainer) {
    const opts = _slAthletes.map(a =>
      `<option value="${a.id}" ${_slViewingId === a.id ? 'selected' : ''}>${escapeHtml(a.full_name)}</option>`
    ).join('')
    trainerSelectorHTML = `
      <div style="margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">View Athlete</div>
        <select id="sl-athlete-select" onchange="slSwitchAthlete()"
          style="background:#1c1c1f;border:2px solid ${_slViewingId ? '#a855f7' : '#27272a'};border-radius:10px;
            color:${_slViewingId ? 'white' : '#71717a'};font-size:13px;font-weight:600;
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
      <h1>Sleep Log</h1>
      <p>Track sleep &amp; wake times, energy level, and recovery notes.</p>
    </div>
    ${trainerSelectorHTML}
    ${navArrows}
    <div style="display:flex;gap:6px;margin-bottom:24px;">${tabsHTML}</div>`

  if (trainer && !_slViewingId) {
    pageHTML += `
      <div style="background:#111113;border:1px solid #27272a;border-radius:16px;padding:48px 24px;text-align:center;">
        <div style="font-size:40px;margin-bottom:16px;">🌙</div>
        <div style="font-size:16px;font-weight:700;color:white;margin-bottom:8px;">Select an athlete above</div>
        <div style="font-size:13px;color:#52525b;">You'll see their sleep log for any day of the week.</div>
      </div>`
    document.getElementById('page-content').innerHTML = pageHTML
    return
  }

  pageHTML += `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div style="font-size:13px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">${dateLabel}</div>
      ${!trainer ? `<div id="sl-save-status" style="font-size:12px;font-weight:600;color:#52525b;transition:color 0.2s;"></div>` : ''}
    </div>
    <div id="sl-log-area">
      <div style="text-align:center;padding:40px;color:#52525b;font-size:13px;">Loading…</div>
    </div>`

  document.getElementById('page-content').innerHTML = pageHTML

  const entry = viewId ? await slGetEntry(viewId, date) : {}
  _slEnergy = entry.energy_level || null

  const fmtTime = t => {
    if (!t) return null
    const [h, m] = t.split(':')
    const hr = parseInt(h)
    const ampm = hr >= 12 ? 'PM' : 'AM'
    const h12 = hr % 12 || 12
    return `${h12}:${m} ${ampm}`
  }

  const hasEntry = entry.sleep_time || entry.wake_time || entry.energy_level || entry.notes

  let logHTML = ''

  if (trainer) {
    if (!hasEntry) {
      logHTML = `
        <div style="background:#111113;border:1px solid #27272a;border-radius:14px;padding:40px 24px;text-align:center;">
          <div style="font-size:13px;color:#52525b;">No sleep data logged for this day.</div>
        </div>`
    } else {
      // Read-only view for trainer
      logHTML = `
        <div class="sleep-card">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div>
              <div class="sleep-label">🌙 Sleep Time</div>
              <div style="font-size:22px;font-weight:800;color:${entry.sleep_time ? '#a855f7' : '#3f3f46'};">
                ${fmtTime(entry.sleep_time) || '—'}
              </div>
            </div>
            <div>
              <div class="sleep-label">☀️ Wake Time</div>
              <div style="font-size:22px;font-weight:800;color:${entry.wake_time ? '#f97316' : '#3f3f46'};">
                ${fmtTime(entry.wake_time) || '—'}
              </div>
            </div>
          </div>
          ${entry.sleep_time && entry.wake_time ? (() => {
            const [sh, sm] = entry.sleep_time.split(':').map(Number)
            const [wh, wm] = entry.wake_time.split(':').map(Number)
            let mins = (wh * 60 + wm) - (sh * 60 + sm)
            if (mins < 0) mins += 24 * 60
            const hrs = Math.floor(mins / 60)
            const rem = mins % 60
            return `<div style="font-size:12px;color:#71717a;margin-bottom:16px;">Duration: <span style="color:white;font-weight:700;">${hrs}h ${rem}m</span></div>`
          })() : ''}
        </div>

        <div class="sleep-card">
          <div class="sleep-label">⚡ Energy Level on Wake</div>
          ${energyBtnsHTML(entry.energy_level || null, true)}
        </div>

        ${entry.notes ? `
        <div class="sleep-card">
          <div class="sleep-label">📝 Notes</div>
          <div style="font-size:14px;color:white;line-height:1.6;white-space:pre-wrap;">${escapeHtml(entry.notes)}</div>
        </div>` : ''}`
    }
  } else {
    // Editable view for athlete
    logHTML = `
      <div class="sleep-card">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <div class="sleep-label">🌙 Sleep Time</div>
            <input id="sl_sleep_time" type="time" class="time-input"
              value="${entry.sleep_time || ''}" oninput="slOnInput()"
              style="width:100%;box-sizing:border-box;">
          </div>
          <div>
            <div class="sleep-label">☀️ Wake Time</div>
            <input id="sl_wake_time" type="time" class="time-input"
              value="${entry.wake_time || ''}" oninput="slOnInput()"
              style="width:100%;box-sizing:border-box;">
          </div>
        </div>
      </div>

      <div class="sleep-card">
        <div class="sleep-label">⚡ Energy Level on Wake <span style="color:#3f3f46;font-weight:400;">(1 = exhausted, 10 = great)</span></div>
        ${energyBtnsHTML(_slEnergy, false)}
      </div>

      <div class="sleep-card">
        <div class="sleep-label">📝 Notes</div>
        <textarea id="sl_notes" class="sleep-textarea"
          placeholder="How did you feel? Any dreams, interruptions, stress…"
          oninput="slOnInput()">${escapeHtml(entry.notes || '')}</textarea>
      </div>`
  }

  const logArea = document.getElementById('sl-log-area')
  if (logArea) logArea.innerHTML = logHTML
}
