// ============================================================
// Athlete Self-Registration
// ============================================================

let _generatedCode  = null
let _generatedEmail = null

async function _nextSignupCode() {
  if (DEMO_MODE) {
    const local = lsGet('p3_demo_athletes') || []
    const all   = [...DEMO_ATHLETES, ...local]
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

async function createProfile() {
  const firstName = document.getElementById('first-name').value.trim()
  const lastName  = document.getElementById('last-name').value.trim()
  const email     = document.getElementById('email').value.trim().toLowerCase()
  const password  = document.getElementById('password').value
  const passwordC = document.getElementById('password-confirm').value
  const age       = document.getElementById('age').value.trim()
  const grade     = document.getElementById('grade').value
  const gender    = document.getElementById('gender').value
  const sport     = document.getElementById('sport').value
  const fullName  = firstName + ' ' + lastName

  const errBox = document.getElementById('error-box')
  errBox.style.display = 'none'

  if (!firstName || !lastName) {
    errBox.textContent = 'First and last name are required.'
    errBox.style.display = 'block'
    return
  }
  if (!email) {
    errBox.textContent = 'Email is required — your athlete code will be sent there.'
    errBox.style.display = 'block'
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errBox.textContent = 'Please enter a valid email address.'
    errBox.style.display = 'block'
    return
  }
  if (!password || password.length < 6) {
    errBox.textContent = 'Password must be at least 6 characters.'
    errBox.style.display = 'block'
    return
  }
  if (password !== passwordC) {
    errBox.textContent = 'Passwords do not match.'
    errBox.style.display = 'block'
    return
  }
  if (!grade || !gender || !sport) {
    errBox.textContent = 'Please fill in grade, gender, and sport.'
    errBox.style.display = 'block'
    return
  }

  if (DEMO_MODE) {
    const existing = lsGet('p3_demo_athletes') || []
    if (existing.find(a => a.email && a.email.toLowerCase() === email)) {
      errBox.textContent = 'An account with that email already exists. Try signing in.'
      errBox.style.display = 'block'
      return
    }

    const code    = await _nextSignupCode()
    _generatedCode  = code
    _generatedEmail = email

    const athlete = {
      id: 'da_' + Date.now(), full_name: fullName, email, password,
      role: 'athlete', sport, gender, grade,
      age: age ? parseInt(age) : null, athlete_code: code,
      created_at: new Date().toISOString().split('T')[0],
    }
    existing.push(athlete)
    lsSet('p3_demo_athletes', existing)

    _showSuccess(athlete)
    sendCodeEmail(athlete)
    return
  }

  // Production Supabase signup
  const submitBtn = document.querySelector('[onclick="createProfile()"]')
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating account…' }

  try {
    const code = await _nextSignupCode()
    const { data, error } = await window._supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role: 'athlete' } },
    })
    if (error) throw error

    // Trigger creates the base profile row; update it with the athlete's extra fields
    const { error: profErr } = await window._supabase.from('profiles')
      .update({ full_name: fullName, athlete_code: code, sport, gender, grade,
                age: age ? parseInt(age) : null })
      .eq('id', data.user.id)
    if (profErr) throw profErr

    _generatedCode  = code
    _generatedEmail = email
    _showSuccess({ full_name: fullName, athlete_code: code, email, sport, grade, gender, age })
    sendCodeEmail({ full_name: fullName, athlete_code: code, email, sport })
  } catch(e) {
    errBox.textContent = e.message || 'Error creating account. Try again.'
    errBox.style.display = 'block'
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Account' }
  }
}

function _showSuccess(athlete) {
  const grade = athlete.grade || ''
  document.getElementById('generated-code').textContent = athlete.athlete_code
  document.getElementById('athlete-summary').innerHTML = `
    <strong style="color:white;">${escapeHtml(athlete.full_name)}</strong><br>
    ${escapeHtml(athlete.sport)} &nbsp;·&nbsp; ${escapeHtml(grade)}${isNaN(grade) ? '' : 'th Grade'} &nbsp;·&nbsp;
    ${athlete.gender === 'male' ? 'Male' : athlete.gender === 'female' ? 'Female' : 'N/A'} &nbsp;·&nbsp;
    Age ${athlete.age || '—'}
  `
  document.getElementById('form-view').style.display    = 'none'
  document.getElementById('success-view').style.display = 'block'
}

async function sendCodeEmail(athlete) {
  const statusEl = document.getElementById('email-status')
  if (!statusEl) return

  // Skip if EmailJS hasn't been configured yet
  if (EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
    statusEl.innerHTML = `<span style="color:#52525b;">📧 Email delivery not configured yet — save your code above.</span>`
    statusEl.style.display = 'block'
    return
  }

  statusEl.innerHTML = `<span style="color:#71717a;">📧 Sending your code to ${athlete.email}…</span>`
  statusEl.style.display = 'block'

  try {
    emailjs.init(EMAILJS_PUBLIC_KEY)
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      athlete_name:  athlete.full_name,
      athlete_code:  athlete.athlete_code,
      athlete_email: athlete.email,
      sport:         athlete.sport,
      login_url:     window.location.origin + '/index.html',
    })
    statusEl.innerHTML = `<span style="color:#22c55e;">✓ Code sent to ${athlete.email}</span>`
  } catch {
    statusEl.innerHTML = `<span style="color:#f59e0b;">⚠ Couldn't send email — save your code above.</span>`
  }
}

function copyCode() {
  if (!_generatedCode) return
  navigator.clipboard?.writeText(_generatedCode).then(() => {
    const btn = document.getElementById('copy-btn')
    btn.textContent = 'Copied!'
    btn.style.borderColor = '#22c55e'
    btn.style.color = '#22c55e'
    setTimeout(() => {
      btn.textContent = 'Copy Code'
      btn.style.borderColor = '#3f3f46'
      btn.style.color = '#d4d4d8'
    }, 2000)
  })
}
