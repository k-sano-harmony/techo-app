// ===== 定数 =====
const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土']
const CHANNEL_LABELS = { ga4: 'GA4', meta: 'Meta', memo: 'メモ', plan: '予定' }

// ===== 状態管理 =====
const state = {
  recordsByDate: new Map(),   // "YYYY-MM-DD" -> record[]
  loadedMonths: new Set(),    // データ取得済みの "YYYY-MM"
  renderedMonths: new Set(),  // DOM描画済みの "YYYY-MM"
  earliestMonth: null,        // { year, month } 表示範囲の最も古い月
  latestMonth: null,          // { year, month } 表示範囲の最も新しい月
  today: new Date(),
  currentDateStr: null,       // 現在開いている日詳細の日付
  editingRecord: null,        // 編集中の記録（新規時はnull）
  editingDate: null,
  editingChannel: 'memo',
  observer: null,
  searchDebounce: null,
  toastTimer: null
}

// ===== ユーティリティ =====
function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function dateToStr(date) {
  return formatDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDateJP(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${WEEK_LABELS[date.getDay()]})`
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function monthKey(year, month) {
  return `${year}-${pad2(month)}`
}

function addMonths(year, month, delta) {
  const total = year * 12 + (month - 1) + delta
  const newYear = Math.floor(total / 12)
  const newMonth = (total % 12) + 1
  return { year: newYear, month: newMonth }
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function isBeforeMonth(y1, m1, y2, m2) {
  return y1 * 12 + m1 < y2 * 12 + m2
}

function isAfterMonth(y1, m1, y2, m2) {
  return y1 * 12 + m1 > y2 * 12 + m2
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str ?? ''
  return div.innerHTML
}

// ===== 月・日の描画 =====
function buildDayRow(year, month, day) {
  const dateStr = formatDate(year, month, day)
  const date = new Date(year, month - 1, day)
  const weekIdx = date.getDay()

  const row = document.createElement('div')
  row.className = 'day-row'
  row.dataset.date = dateStr
  if (weekIdx === 0) row.classList.add('is-sunday')
  if (weekIdx === 6) row.classList.add('is-saturday')
  if (isSameDay(date, state.today)) row.classList.add('is-today')

  const dateCol = document.createElement('div')
  dateCol.className = 'day-date'
  dateCol.innerHTML = `<span class="day-num">${day}</span><span class="day-week">${WEEK_LABELS[weekIdx]}</span>`

  const contentCol = document.createElement('div')
  contentCol.className = 'day-content'
  fillDayContent(contentCol, dateStr)

  row.appendChild(dateCol)
  row.appendChild(contentCol)
  row.addEventListener('click', () => openDayDetail(dateStr))

  return row
}

function fillDayContent(el, dateStr) {
  const records = state.recordsByDate.get(dateStr) || []
  if (records.length === 0) {
    el.innerHTML = ''
    return
  }
  const visible = records.slice(0, 3)
  let html = visible
    .map(
      (r) => `
    <div class="record-pill">
      <span class="channel-dot ${r.channel}"></span>
      <span class="pill-text">${escapeHtml(r.text)}</span>
    </div>`
    )
    .join('')
  if (records.length > 3) {
    html += `<div class="record-more">+${records.length - 3}件</div>`
  }
  el.innerHTML = html
}

function refreshDayRow(dateStr) {
  const row = document.querySelector(`.day-row[data-date="${dateStr}"]`)
  if (!row) return
  fillDayContent(row.querySelector('.day-content'), dateStr)
}

function buildMonthFragment(year, month) {
  const fragment = document.createDocumentFragment()
  const section = document.createElement('div')
  section.className = 'month-section'
  section.dataset.month = monthKey(year, month)

  const header = document.createElement('div')
  header.className = 'month-header'
  header.textContent = `${year}年${month}月`
  section.appendChild(header)

  const days = daysInMonth(year, month)
  for (let d = 1; d <= days; d++) {
    section.appendChild(buildDayRow(year, month, d))
  }

  fragment.appendChild(section)
  return fragment
}

function renderMonthInto(year, month, position) {
  const key = monthKey(year, month)
  if (state.renderedMonths.has(key)) return
  state.renderedMonths.add(key)

  const fragment = buildMonthFragment(year, month)
  const container = document.getElementById('timeline-content')
  if (position === 'prepend') {
    container.insertBefore(fragment, container.firstChild)
  } else {
    container.appendChild(fragment)
  }
}

// ===== データ読み込み =====
function applyRecords(records) {
  records.forEach((r) => {
    if (!state.recordsByDate.has(r.date)) state.recordsByDate.set(r.date, [])
    state.recordsByDate.get(r.date).push(r)
  })
}

async function loadMonth(year, month) {
  const key = monthKey(year, month)
  if (state.loadedMonths.has(key)) return
  state.loadedMonths.add(key)

  try {
    const days = daysInMonth(year, month)
    for (let d = 1; d <= days; d++) {
      state.recordsByDate.set(formatDate(year, month, d), [])
    }

    const records = await api.list(year, month)
    applyRecords(records || [])

    for (let d = 1; d <= days; d++) {
      refreshDayRow(formatDate(year, month, d))
    }
  } catch (e) {
    state.loadedMonths.delete(key)
    console.error('月データの読み込みに失敗:', e)
    showToast('データの読み込みに失敗しました')
  }
}

// ===== 無限スクロール =====
function initTimeline() {
  const year = state.today.getFullYear()
  const month = state.today.getMonth() + 1

  state.earliestMonth = { year, month }
  state.latestMonth = { year, month }

  renderMonthInto(year, month, 'append')

  loadMonth(year, month).then(() => {
    scrollToToday()
    appendMonth()
    prependMonth()
  })

  setupObserver()
}

function setupObserver() {
  const timelineEl = document.getElementById('timeline')
  const topSentinel = document.getElementById('top-sentinel')
  const bottomSentinel = document.getElementById('bottom-sentinel')

  state.observer = new IntersectionObserver(handleIntersect, {
    root: timelineEl,
    rootMargin: '300px 0px'
  })
  state.observer.observe(topSentinel)
  state.observer.observe(bottomSentinel)
}

function handleIntersect(entries) {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return
    if (entry.target.id === 'top-sentinel') prependMonth()
    if (entry.target.id === 'bottom-sentinel') appendMonth()
  })
}

function appendMonth() {
  const { year, month } = addMonths(state.latestMonth.year, state.latestMonth.month, 1)
  state.latestMonth = { year, month }
  renderMonthInto(year, month, 'append')
  loadMonth(year, month)
}

function prependMonth() {
  const { year, month } = addMonths(state.earliestMonth.year, state.earliestMonth.month, -1)
  state.earliestMonth = { year, month }

  const timelineEl = document.getElementById('timeline')
  const contentEl = document.getElementById('timeline-content')
  const prevHeight = contentEl.scrollHeight
  const prevScrollTop = timelineEl.scrollTop

  renderMonthInto(year, month, 'prepend')

  const newHeight = contentEl.scrollHeight
  timelineEl.scrollTop = prevScrollTop + (newHeight - prevHeight)

  loadMonth(year, month)
}

function scrollToToday() {
  jumpToDate(dateToStr(state.today), { instant: true })
}

// ===== 日付ジャンプ =====
async function jumpToDate(dateStr, opts = {}) {
  const [year, month] = dateStr.split('-').map(Number)

  while (isBeforeMonth(year, month, state.earliestMonth.year, state.earliestMonth.month)) {
    const prev = addMonths(state.earliestMonth.year, state.earliestMonth.month, -1)
    state.earliestMonth = prev
    renderMonthInto(prev.year, prev.month, 'prepend')
    await loadMonth(prev.year, prev.month)
  }

  while (isAfterMonth(year, month, state.latestMonth.year, state.latestMonth.month)) {
    const next = addMonths(state.latestMonth.year, state.latestMonth.month, 1)
    state.latestMonth = next
    renderMonthInto(next.year, next.month, 'append')
    await loadMonth(next.year, next.month)
  }

  await loadMonth(year, month)

  const row = document.querySelector(`.day-row[data-date="${dateStr}"]`)
  if (row) row.scrollIntoView({ block: 'start', behavior: opts.instant ? 'auto' : 'smooth' })
}

// ===== 日詳細シート =====
async function openDayDetail(dateStr) {
  state.currentDateStr = dateStr
  document.getElementById('day-detail-title').textContent = formatDateJP(parseDate(dateStr))
  renderDayDetail(dateStr)
  showSheet('day-detail')

  await ensureDayLoaded(dateStr)
  if (state.currentDateStr === dateStr) renderDayDetail(dateStr)
}

async function ensureDayLoaded(dateStr) {
  const [year, month] = dateStr.split('-').map(Number)
  await loadMonth(year, month)
}

function renderDayDetail(dateStr) {
  const records = (state.recordsByDate.get(dateStr) || [])
    .slice()
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  const body = document.getElementById('day-detail-body')
  body.innerHTML =
    records.map((r) => renderRecordCard(r)).join('') +
    `<button type="button" class="add-record-btn" id="add-record-btn">+ 記録を追加</button>`

  document.getElementById('add-record-btn').addEventListener('click', () => {
    openEditForm(dateStr, null)
  })

  records.forEach((r) => {
    const card = body.querySelector(`.record-card[data-id="${r.id}"]`)
    if (!card) return
    card.querySelector('.edit-btn').addEventListener('click', () => openEditForm(dateStr, r))
    card.querySelector('.delete-btn').addEventListener('click', () => confirmDelete(r))
  })
}

function renderRecordCard(record) {
  const label = CHANNEL_LABELS[record.channel] || record.channel
  return `
    <div class="record-card" data-id="${record.id}">
      <div class="record-card-head">
        <span class="channel-dot ${record.channel}"></span>
        <span>${escapeHtml(label)}</span>
        ${record.time ? `<span class="record-card-time">${escapeHtml(record.time)}</span>` : ''}
      </div>
      <div class="record-card-text">${escapeHtml(record.text)}</div>
      <div class="record-card-actions">
        <button type="button" class="edit-btn">編集</button>
        <button type="button" class="delete-btn danger">削除</button>
      </div>
    </div>`
}

// ===== 編集フォーム =====
function openEditForm(dateStr, record) {
  state.editingRecord = record
  state.editingDate = dateStr

  document.getElementById('edit-form-title').textContent = record ? '記録を編集' : '記録を追加'
  document.getElementById('form-date').value = dateStr
  document.getElementById('form-time').value = record?.time || ''
  document.getElementById('form-text').value = record?.text || ''

  paintChip(record?.channel || 'memo')

  showSheet('edit-form')
  document.getElementById('form-text').focus()
}

function paintChip(channel) {
  state.editingChannel = channel
  document.querySelectorAll('.channel-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.channel === channel)
  })
}

// ===== CRUD（楽観的更新） =====
function addRecordToState(record) {
  if (!state.recordsByDate.has(record.date)) state.recordsByDate.set(record.date, [])
  state.recordsByDate.get(record.date).push(record)
}

function removeRecordFromState(id, date) {
  const list = state.recordsByDate.get(date)
  if (!list) return
  const idx = list.findIndex((r) => r.id === id)
  if (idx !== -1) list.splice(idx, 1)
}

async function saveRecord() {
  const date = document.getElementById('form-date').value
  const time = document.getElementById('form-time').value
  const text = document.getElementById('form-text').value.trim()
  const channel = state.editingChannel || 'memo'

  if (!date || !text) {
    showToast('日付と内容を入力してください')
    return
  }

  const isNew = !state.editingRecord
  closeSheets()

  if (isNew) {
    const tempId = `temp-${Date.now()}`
    const record = { id: tempId, date, time, text, channel }
    addRecordToState(record)
    refreshDayRow(date)
    if (state.currentDateStr === date) renderDayDetail(date)

    try {
      const result = await api.create({ date, time, text, channel })
      if (result?.id) record.id = result.id
      showToast('保存しました')
    } catch (e) {
      console.error('作成に失敗:', e)
      removeRecordFromState(tempId, date)
      refreshDayRow(date)
      if (state.currentDateStr === date) renderDayDetail(date)
      showToast('保存に失敗: ' + e.message)
    }
  } else {
    const oldDate = state.editingRecord.date
    const record = { ...state.editingRecord, date, time, text, channel }

    removeRecordFromState(record.id, oldDate)
    addRecordToState(record)
    refreshDayRow(oldDate)
    if (oldDate !== date) refreshDayRow(date)
    if (state.currentDateStr === oldDate || state.currentDateStr === date) {
      renderDayDetail(state.currentDateStr)
    }

    try {
      await api.update(record)
      showToast('更新しました')
    } catch (e) {
      console.error('更新に失敗:', e)
      showToast('更新に失敗しました')
    }
  }
}

function confirmDelete(record) {
  if (!confirm('この記録を削除しますか？')) return

  const date = record.date
  removeRecordFromState(record.id, date)
  refreshDayRow(date)
  if (state.currentDateStr === date) renderDayDetail(date)

  api
    .remove(record.id)
    .then(() => showToast('削除しました'))
    .catch((e) => {
      console.error('削除に失敗:', e)
      addRecordToState(record)
      refreshDayRow(date)
      if (state.currentDateStr === date) renderDayDetail(date)
      showToast('削除に失敗しました')
    })
}

// ===== シート表示/非表示 =====
function showSheet(id) {
  document.getElementById('overlay').classList.add('show')
  document.getElementById(id).classList.add('show')
}

function closeSheets() {
  document.getElementById('overlay').classList.remove('show')
  document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('show'))
}

// ===== 検索 =====
function showTimeline() {
  document.getElementById('search-view').classList.remove('show')
  document.getElementById('timeline').classList.remove('hide')
}

function showSearchResultsView() {
  document.getElementById('search-view').classList.add('show')
  document.getElementById('timeline').classList.add('hide')
}

async function performSearch(keyword) {
  if (!keyword.trim()) {
    showTimeline()
    return
  }
  showSearchResultsView()
  const view = document.getElementById('search-view')
  view.innerHTML = '<div class="loading-row">検索中...</div>'

  try {
    const records = await api.search(keyword.trim())
    if (!records || records.length === 0) {
      view.innerHTML = '<div class="search-empty">該当する記録がありません</div>'
      return
    }

    const sorted = records
      .slice()
      .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))

    view.innerHTML = sorted
      .map(
        (r) => `
      <div class="search-result-item" data-date="${r.date}">
        <div class="search-result-date">${formatDateJP(parseDate(r.date))}</div>
        <div class="record-pill">
          <span class="channel-dot ${r.channel}"></span>
          <span class="pill-text">${escapeHtml(r.text)}</span>
        </div>
      </div>`
      )
      .join('')

    view.querySelectorAll('.search-result-item').forEach((item) => {
      item.addEventListener('click', () => {
        const date = item.dataset.date
        document.getElementById('search-input').value = ''
        showTimeline()
        jumpToDate(date).then(() => openDayDetail(date))
      })
    })
  } catch (e) {
    console.error('検索に失敗:', e)
    view.innerHTML = '<div class="search-empty">検索に失敗しました</div>'
  }
}

// ===== トースト =====
function showToast(message) {
  const toast = document.getElementById('toast')
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(state.toastTimer)
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2000)
}

// ===== イベント登録 =====
function setupEventListeners() {
  const searchInput = document.getElementById('search-input')
  searchInput.addEventListener('input', (e) => {
    clearTimeout(state.searchDebounce)
    const value = e.target.value
    state.searchDebounce = setTimeout(() => performSearch(value), 300)
  })

  document.getElementById('today-btn').addEventListener('click', () => {
    searchInput.value = ''
    showTimeline()
    jumpToDate(dateToStr(state.today))
  })

  document.getElementById('overlay').addEventListener('click', closeSheets)
  document.getElementById('day-detail-close').addEventListener('click', closeSheets)
  document.getElementById('edit-form-close').addEventListener('click', closeSheets)
  document.getElementById('form-cancel').addEventListener('click', closeSheets)
  document.getElementById('form-save').addEventListener('click', saveRecord)

  document.querySelectorAll('.channel-chip').forEach((chip) => {
    chip.addEventListener('click', () => paintChip(chip.dataset.channel))
  })
}

// ===== Service Worker登録 =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.error('SW登録失敗:', e))
  })
}

// ===== 初期化 =====
setupEventListeners()
initTimeline()
