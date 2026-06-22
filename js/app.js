// ============================================================
// Prediger Power Performance — Shared App Utilities
// ============================================================

// Init Supabase client if not in demo mode
function initSupabase() {
  if (!DEMO_MODE && typeof supabase !== 'undefined') {
    window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
  }
}

// ── Sidebar ──────────────────────────────────────────────────

function initSidebar(currentUser) {
  const trainer = isTrainer(currentUser)
  const _name = currentUser.full_name || 'User'
  const initials = _name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const path = window.location.pathname

  const navItems = [
    { href: 'dashboard.html',   label: 'Today\'s Workout', icon: workoutIcon(),   match: 'dashboard' },
    { href: 'messages.html',    label: 'Message Board',    icon: messageIcon(),   match: 'messages'  },
    { href: 'leaderboard.html', label: 'Leaderboard',      icon: trophyIcon(),    match: 'leaderboard' },
    { href: 'profile.html',     label: 'My Profile',       icon: profileIcon(),   match: 'profile'   },
    { href: 'food-log.html',    label: 'Food Log',         icon: foodIcon(),      match: 'food-log'  },
    { href: 'sleep-log.html',   label: 'Sleep Log',        icon: sleepIcon(),     match: 'sleep-log' },
  ]

  let navHTML = navItems.map(item => {
    const active = path.includes(item.match) ? 'active' : ''
    return `<a href="${item.href}" class="nav-item ${active}">${item.icon}<span>${item.label}</span></a>`
  }).join('')

  if (trainer) {
    navHTML += `
      <div style="height:1px;background:#1c1c1f;margin:12px 0"></div>
      <div class="section-label" style="padding:0 12px;margin:8px 0 4px">Trainer</div>
      <a href="admin.html" class="nav-item ${path.includes('admin') ? 'active' : ''}">${adminIcon()}<span>Admin Panel</span></a>
    `
  }

  const html = `
    <aside id="sidebar">
      <div style="padding:20px 20px 16px;border-bottom:1px solid #1c1c1f;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:12px;background:#f97316;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(249,115,22,0.3)">
            <span style="color:white;font-weight:900;font-size:16px;">P3</span>
          </div>
          <div>
            <div style="color:white;font-weight:800;font-size:13px;line-height:1.2;">Prediger Power</div>
            <div style="color:#f97316;font-weight:700;font-size:11px;letter-spacing:0.08em;">PERFORMANCE</div>
          </div>
        </div>
      </div>

      <nav style="flex:1;padding:12px;overflow-y:auto;">${navHTML}</nav>

      <div style="padding:12px;border-top:1px solid #1c1c1f;">
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;background:#1c1c1f;margin-bottom:8px;">
          <div class="avatar" style="width:32px;height:32px;font-size:12px;flex-shrink:0;">${initials}</div>
          <div style="flex:1;min-width:0;">
            <div style="color:white;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_name}</div>
            <div style="color:#71717a;font-size:11px;text-transform:capitalize;">${currentUser.role}</div>
          </div>
        </div>
        <button onclick="logout()" class="nav-item" style="width:100%;color:#71717a;font-size:13px;">
          ${logoutIcon()}<span>Sign Out</span>
        </button>
      </div>
    </aside>
    <div id="sidebar-overlay" onclick="closeSidebar()"></div>
  `

  document.getElementById('sidebar-container').innerHTML = html
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open')
  document.getElementById('sidebar-overlay').classList.add('show')
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open')
  document.getElementById('sidebar-overlay').classList.remove('show')
}

// ── Helpers ───────────────────────────────────────────────────

// Shared week-date helper used by dashboard, admin, and kiosk
function getWeekDatesForOffset(offset) {
  const d   = new Date(TODAY + 'T00:00:00')
  const dow = d.getDay()
  const mon = new Date(d)
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7)
  return [0,1,2,3,4].map(i => {
    const day = new Date(mon)
    day.setDate(mon.getDate() + i)
    return day.toISOString().split('T')[0]
  })
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 6e4)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div')
  t.className = `toast toast-${type}`
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300) }, 3000)
}

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function getAthleteById(id) {
  const local = lsGet('p3_demo_athletes') || []
  return DEMO_ATHLETES.find(a => a.id === id)
      || local.find(a => a.id === id)
      || null
}

// ── LocalStorage helpers (demo data persistence) ──────────────

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)) }

function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Mobile header builder ──────────────────────────────────────

function mobileHeader(title) {
  return `
    <header class="mobile-header">
      <button onclick="openSidebar()" class="hamburger">${hamburgerIcon()}</button>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:28px;height:28px;border-radius:8px;background:#f97316;display:flex;align-items:center;justify-content:center;">
          <span style="color:white;font-weight:900;font-size:11px;">P3</span>
        </div>
        <span style="color:white;font-weight:700;font-size:14px;">${title}</span>
      </div>
      <div style="width:36px;"></div>
    </header>
  `
}

// ── Icons (inline SVG) ────────────────────────────────────────

function workoutIcon() {
  return `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>`
}
function messageIcon() {
  return `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>`
}
function trophyIcon() {
  return `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`
}
function adminIcon() {
  return `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`
}
function profileIcon() {
  return `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>`
}
function logoutIcon() {
  return `<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>`
}
function hamburgerIcon() {
  return `<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>`
}
function foodIcon() {
  return `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>`
}
function sleepIcon() {
  return `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>`
}
function plusIcon() {
  return `<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>`
}
function trashIcon() {
  return `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`
}
