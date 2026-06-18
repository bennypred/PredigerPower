// ============================================================
// Prediger Power Performance — Authentication
// ============================================================

// Initialize Supabase client as soon as auth.js loads (covers all pages)
if (!DEMO_MODE && typeof supabase !== 'undefined' && !window._supabase) {
  window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
}

const SESSION_KEY    = 'p3_session'
const ATTEMPT_KEY    = 'p3_login_attempts'
const MAX_ATTEMPTS   = 10
const LOCKOUT_MS     = 15 * 60 * 1000

function _getAttempts() {
  try { return JSON.parse(localStorage.getItem(ATTEMPT_KEY) || 'null') } catch { return null }
}
function _recordAttempt() {
  const now  = Date.now()
  const data = _getAttempts()
  if (!data || now - data.windowStart > LOCKOUT_MS) {
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ count: 1, windowStart: now }))
    return { locked: false }
  }
  data.count++
  localStorage.setItem(ATTEMPT_KEY, JSON.stringify(data))
  return { locked: data.count > MAX_ATTEMPTS }
}
function _isLocked() {
  const data = _getAttempts()
  if (!data) return false
  if (Date.now() - data.windowStart > LOCKOUT_MS) { localStorage.removeItem(ATTEMPT_KEY); return false }
  return data.count > MAX_ATTEMPTS
}

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') }
  catch { return null }
}

function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

function isTrainer(user) {
  return user && user.role === 'trainer'
}

function requireAuth() {
  const user = getSession()
  if (!user) { window.location.href = 'index.html'; return null }
  return user
}

function redirectIfLoggedIn() {
  const user = getSession()
  if (user) window.location.href = 'dashboard.html'
}

async function loginWithCode(code) {
  if (_isLocked()) return { user: null, error: 'Too many attempts. Please wait 15 minutes.' }
  const clean = code.trim().toUpperCase()
  if (DEMO_MODE) {
    if (DEMO_TRAINER.athlete_code === clean) {
      setSession(DEMO_TRAINER)
      return { user: DEMO_TRAINER, error: null }
    }
    const local = lsGet('p3_demo_athletes') || []
    const all   = [...DEMO_ATHLETES, ...local]
    const athlete = all.find(a => a.athlete_code === clean)
    if (athlete) { setSession(athlete); return { user: athlete, error: null } }
    const { locked } = _recordAttempt()
    if (locked) return { user: null, error: 'Too many attempts. Please wait 15 minutes.' }
    return { user: null, error: 'Invalid athlete code. Check your code and try again.' }
  }
  const { data, error } = await window._supabase.from('profiles').select('*').eq('athlete_code', clean).single()
  if (error || !data) {
    const { locked } = _recordAttempt()
    if (locked) return { user: null, error: 'Too many attempts. Please wait 15 minutes.' }
    return { user: null, error: 'Invalid athlete code.' }
  }
  setSession(data)
  return { user: data, error: null }
}

async function login(email, password) {
  if (DEMO_MODE) {
    // Trainer
    if (email.toLowerCase() === DEMO_TRAINER.email.toLowerCase()) {
      if (DEMO_TRAINER.password !== password) {
        return { user: null, error: 'Incorrect password.' }
      }
      setSession(DEMO_TRAINER)
      return { user: DEMO_TRAINER, error: null }
    }
    // Built-in demo athletes
    const athlete = DEMO_ATHLETES.find(a => a.email.toLowerCase() === email.toLowerCase())
    if (athlete) {
      if (athlete.password !== password) {
        return { user: null, error: 'Incorrect password.' }
      }
      setSession(athlete)
      return { user: athlete, error: null }
    }
    // Self-registered athletes
    const local = lsGet('p3_demo_athletes') || []
    const localAthlete = local.find(a => a.email && a.email.toLowerCase() === email.toLowerCase())
    if (localAthlete) {
      if (localAthlete.password !== password) {
        return { user: null, error: 'Incorrect password.' }
      }
      setSession(localAthlete)
      return { user: localAthlete, error: null }
    }
    return { user: null, error: 'No account found for that email.' }
  }

  // Real Supabase login
  const { data, error } = await window._supabase.auth.signInWithPassword({ email, password })
  if (error) return { user: null, error: error.message }

  const { data: profile, error: pErr } = await window._supabase
    .from('profiles').select('*').eq('id', data.user.id).single()

  if (pErr || !profile) return { user: null, error: 'Profile not found. Contact your trainer.' }
  setSession(profile)
  return { user: profile, error: null }
}

function logout() {
  clearSession()
  if (!DEMO_MODE && window._supabase) window._supabase.auth.signOut()
  window.location.href = 'index.html'
}
