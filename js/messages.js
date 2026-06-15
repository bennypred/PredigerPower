// ============================================================
// Message Board
// ============================================================

let _currentUser  = null
let _msgTab       = 'public'
let _mediaFile    = null
let _mediaDataUrl = null   // data URL (images) or blob URL (videos, session-only)

async function initPage(user) {
  _currentUser = user
  _msgTab = 'public'
  renderPage(user, await getMessages(user))
}

async function getMessages(user) {
  if (DEMO_MODE) {
    const local        = lsGet('p3_messages') || []
    const localPublic  = local.filter(m => !m.recipient_id)
    const localPrivate = local.filter(m =>  m.recipient_id)

    const allPublic = [...localPublic, ...DEMO_MESSAGES]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    const demoPriv   = isTrainer(user)
      ? DEMO_PRIVATE
      : DEMO_PRIVATE.filter(m => m.recipient_id === user.id)
    const filtPriv   = isTrainer(user)
      ? localPrivate
      : localPrivate.filter(m => m.recipient_id === user.id || m.author_id === user.id)
    const allPrivate = [...filtPriv, ...demoPriv]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    return { public: allPublic, private: allPrivate }
  }

  const { data: msgs } = await window._supabase
    .from('messages')
    .select('*, author:profiles!author_id(full_name, role)')
    .is('recipient_id', null)
    .order('created_at', { ascending: false })

  const { data: priv } = await window._supabase
    .from('messages')
    .select('*, author:profiles!author_id(full_name, role)')
    .not('recipient_id', 'is', null)
    .order('created_at', { ascending: false })

  return { public: msgs || [], private: priv || [] }
}

// ── Page render ───────────────────────────────────────────────

function renderPage(user, messages) {
  const privCount = messages.private.length

  document.getElementById('page-content').innerHTML = `
    <div class="page-header">
      <h1>Message Board</h1>
      <p>Team announcements and direct messages.</p>
    </div>

    <!-- Tab bar -->
    <div style="display:flex;gap:4px;background:#111113;border:1px solid #1c1c1f;border-radius:12px;padding:4px;margin-bottom:24px;">
      <button onclick="switchMsgTab('public')"
        style="flex:1;padding:11px 8px;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.15s;${_msgTab === 'public' ? 'background:#f97316;color:white;box-shadow:0 2px 8px rgba(249,115,22,0.3);' : 'background:transparent;color:#71717a;'}">
        Team Board
      </button>
      <button onclick="switchMsgTab('private')"
        style="flex:1;padding:11px 8px;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;justify-content:center;gap:7px;${_msgTab === 'private' ? 'background:#f97316;color:white;box-shadow:0 2px 8px rgba(249,115,22,0.3);' : 'background:transparent;color:#71717a;'}">
        Direct Messages
        ${privCount ? `<span style="background:${_msgTab === 'private' ? 'rgba(255,255,255,0.25)' : '#f97316'};color:white;border-radius:99px;padding:1px 7px;font-size:11px;font-weight:700;">${privCount}</span>` : ''}
      </button>
    </div>

    <!-- Tab content -->
    <div id="msg-tab-content">
      ${_msgTab === 'public' ? renderPublicTab(user, messages.public) : renderPrivateTab(user, messages.private)}
    </div>

    <!-- Shared hidden file input -->
    <input type="file" id="media-input" accept="image/*,video/*" style="display:none" onchange="onMediaSelected(this)">
  `
}

function renderPublicTab(user, publicMsgs) {
  const pinned = publicMsgs.filter(m => m.is_pinned)
  const feed   = publicMsgs.filter(m => !m.is_pinned)
  return `
    ${renderComposeBox(user, false)}

    ${pinned.length ? `
    <div style="margin-bottom:24px;">
      <div class="section-label" style="display:flex;align-items:center;gap:6px;">
        <span style="color:#f97316;">📌</span> Pinned
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${pinned.map(m => renderMsgCard(m, user, false)).join('')}
      </div>
    </div>` : ''}

    <div>
      <div class="section-label">Team Feed</div>
      ${feed.length
        ? `<div style="display:flex;flex-direction:column;gap:8px;">${feed.map(m => renderMsgCard(m, user, false)).join('')}</div>`
        : `<div class="empty-state"><p>No messages yet. Be the first to post!</p></div>`}
    </div>
  `
}

function renderPrivateTab(user, privateMsgs) {
  return `
    ${renderComposeBox(user, true)}

    <div>
      <div class="section-label" style="display:flex;align-items:center;gap:6px;">
        <span style="color:#eab308;">✉</span>
        ${isTrainer(user) ? 'All Direct Messages' : 'Messages with Your Trainer'}
      </div>
      ${privateMsgs.length
        ? `<div style="display:flex;flex-direction:column;gap:8px;">${privateMsgs.map(m => renderMsgCard(m, user, true)).join('')}</div>`
        : `<div class="empty-state"><p>No direct messages yet.</p></div>`}
    </div>
  `
}

function renderComposeBox(user, isPrivate) {
  const placeholder = isPrivate
    ? (isTrainer(user) ? 'Write a private message to an athlete…' : 'Write a message to your trainer…')
    : 'Write something to the team…'

  const allAthletes = [...(lsGet('p3_demo_athletes') || []), ...DEMO_ATHLETES]
    .filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i)

  return `
    <div style="background:#111113;border:1px solid #1c1c1f;border-radius:16px;padding:20px;margin-bottom:24px;">
      <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">
        ${isPrivate ? '✉ New Direct Message' : '📢 Post to Team Board'}
      </div>

      ${isPrivate && isTrainer(user) ? `
      <div style="margin-bottom:12px;">
        <select id="compose-recipient" class="form-select">
          <option value="">Select recipient…</option>
          ${allAthletes.map(a => `<option value="${a.id}">${a.full_name}</option>`).join('')}
        </select>
      </div>` : ''}

      <textarea id="compose-content" placeholder="${placeholder}" rows="3"
        style="width:100%;background:#1c1c1f;border:1px solid #2a2a2f;border-radius:10px;padding:12px 14px;color:white;font-size:14px;resize:vertical;min-height:80px;box-sizing:border-box;font-family:inherit;"></textarea>

      <!-- Media preview (filled in by onMediaSelected) -->
      <div id="media-preview" style="display:none;margin-top:10px;"></div>

      <div style="display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap;">
        <button onclick="document.getElementById('media-input').click()"
          style="display:flex;align-items:center;gap:6px;background:#1c1c1f;border:1px solid #2a2a2f;color:#71717a;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;white-space:nowrap;"
          onmouseover="this.style.color='white';this.style.borderColor='#3f3f46'"
          onmouseout="this.style.color='#71717a';this.style.borderColor='#2a2a2f'">
          📎 Photo / Video
        </button>
        <div style="flex:1;"></div>
        <button onclick="postMessage(${isPrivate})" class="btn-primary" style="padding:10px 28px;">
          Send
        </button>
      </div>
    </div>
  `
}

function renderMsgCard(msg, user, isPrivate) {
  const authorRole = msg.author?.role || 'athlete'
  const init       = initials(msg.author?.full_name || '?')
  const isOwn      = msg.author_id === user.id
  const isVideo    = msg.media_type?.startsWith('video')

  return `
    <div class="message-card ${msg.is_pinned ? 'pinned' : ''}">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div class="msg-avatar ${authorRole}">${init}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <span style="font-size:14px;font-weight:600;color:white;">${msg.author?.full_name || 'Unknown'}</span>
            <span class="badge badge-${authorRole}">${authorRole}</span>
            ${isPrivate ? `<span class="badge badge-private">Direct</span>` : ''}
            ${msg.is_pinned ? `<span class="badge badge-pinned">Pinned</span>` : ''}
            <span style="color:#52525b;font-size:12px;margin-left:auto;">${timeAgo(msg.created_at)}</span>
          </div>
          ${msg.content ? `<div style="font-size:14px;color:#d4d4d8;line-height:1.6;">${msg.content}</div>` : ''}
          ${msg.media_url ? (isVideo
            ? `<video src="${msg.media_url}" controls style="max-width:100%;max-height:320px;border-radius:10px;margin-top:10px;display:block;"></video>`
            : `<img src="${msg.media_url}" alt="attachment"
                style="max-width:100%;max-height:320px;border-radius:10px;margin-top:10px;display:block;cursor:zoom-in;object-fit:contain;"
                onclick="this.style.maxHeight=this.style.maxHeight==='none'?'320px':'none'">`
          ) : ''}
        </div>
        ${isOwn || isTrainer(user) ? `
        <button onclick="deleteMessage('${msg.id}')" class="btn-danger" style="flex-shrink:0;padding:4px 8px;">✕</button>` : ''}
      </div>
    </div>
  `
}

// ── Media handling ────────────────────────────────────────────

async function onMediaSelected(input) {
  const file = input.files[0]
  if (!file) return
  _mediaFile = file

  const preview = document.getElementById('media-preview')
  if (!preview) return

  if (file.type.startsWith('image/')) {
    _mediaDataUrl = await compressImage(file)
  } else if (file.type.startsWith('video/')) {
    _mediaDataUrl = URL.createObjectURL(file)
  } else {
    showToast('Only images and videos are supported.', 'error')
    _mediaFile = null; input.value = ''; return
  }

  const isVid = file.type.startsWith('video/')
  preview.style.display = 'block'
  preview.innerHTML = `
    <div style="position:relative;display:inline-block;">
      ${isVid
        ? `<video src="${_mediaDataUrl}" muted playsinline style="max-width:180px;max-height:130px;border-radius:8px;display:block;"></video>`
        : `<img src="${_mediaDataUrl}" style="max-width:180px;max-height:130px;border-radius:8px;object-fit:cover;display:block;">`}
      <button onclick="clearMedia()"
        style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#ef4444;border:none;color:white;font-size:12px;cursor:pointer;line-height:22px;text-align:center;padding:0;">✕</button>
    </div>
    ${isVid ? `<div style="font-size:11px;color:#52525b;margin-top:5px;">Videos are session-only in demo mode.</div>` : ''}
  `
  input.value = ''
}

function clearMedia() {
  _mediaFile    = null
  _mediaDataUrl = null
  const p = document.getElementById('media-preview')
  if (p) { p.style.display = 'none'; p.innerHTML = '' }
}

function compressImage(file, maxWidth = 960, quality = 0.75) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale  = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// ── Post / Delete / Switch tab ────────────────────────────────

async function postMessage(isPrivate = false) {
  const content  = document.getElementById('compose-content')?.value.trim() || ''
  const recipSel = document.getElementById('compose-recipient')
  let   recipient = null

  if (isPrivate) {
    if (isTrainer(_currentUser)) {
      recipient = recipSel?.value || null
      if (!recipient) { showToast('Select a recipient first.', 'error'); return }
    } else {
      recipient = DEMO_TRAINER.id
    }
  }

  if (!content && !_mediaDataUrl) {
    showToast('Write something or attach a photo/video.', 'error'); return
  }

  const newMsg = {
    id:           'local_' + Date.now(),
    author_id:    _currentUser.id,
    recipient_id: recipient,
    content,
    media_url:    _mediaDataUrl  || null,
    media_type:   _mediaFile?.type || null,
    is_pinned:    false,
    created_at:   new Date().toISOString(),
    author:       { full_name: _currentUser.full_name, role: _currentUser.role },
  }

  if (DEMO_MODE) {
    const local = lsGet('p3_messages') || []
    local.unshift(newMsg)
    lsSet('p3_messages', local)
    clearMedia()
    showToast('Message sent!', 'success')
    renderPage(_currentUser, await getMessages(_currentUser))
    return
  }

  try {
    await window._supabase.from('messages').insert({
      author_id: _currentUser.id, recipient_id: recipient,
      content, is_pinned: false,
    })
    clearMedia()
    showToast('Message sent!', 'success')
    initPage(_currentUser)
  } catch { showToast('Failed to send.', 'error') }
}

async function deleteMessage(id) {
  if (!confirm('Delete this message?')) return
  if (DEMO_MODE) {
    lsSet('p3_messages', (lsGet('p3_messages') || []).filter(m => m.id !== id))
    showToast('Deleted.', 'success')
    renderPage(_currentUser, await getMessages(_currentUser))
    return
  }
  await window._supabase.from('messages').delete().eq('id', id)
  showToast('Deleted.', 'success')
  initPage(_currentUser)
}

async function switchMsgTab(tab) {
  _msgTab = tab
  clearMedia()
  renderPage(_currentUser, await getMessages(_currentUser))
}
