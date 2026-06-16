// ===== GAS Web App 接続設定 =====
// GASをデプロイした際の「ウェブアプリのURL」をここに設定してください
const GAS_URL = 'https://script.google.com/macros/s/AKfycbz9By_v2dXvBRamwhpEf93L7I8cywE1UL2iPCbmJj8MXaDGIsloEJcIaMFbkEK5IG5QUw/exec'

async function apiGet(params) {
  const url = new URL(GAS_URL)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })
  const res = await fetch(url.toString(), { method: 'GET' })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'APIエラー')
  return json
}

async function apiPost(body) {
  // Content-Typeを指定しない（text/plainで送信）ことでCORSプリフライトを回避する
  const res = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'APIエラー')
  return json
}

// GASのフィールド名（body）をフロントエンドの形式（text）に変換する
function toRecord(r) {
  return {
    id: r.id,
    date: r.date,
    time: r.time || '',
    channel: r.channel || 'memo',
    text: r.body || ''
  }
}

const api = {
  // 月単位での記録一覧取得 — GASのrangeを使い1日〜末日で絞る
  list(year, month) {
    const y = String(year)
    const m = String(month).padStart(2, '0')
    const last = new Date(year, month, 0).getDate()
    return apiGet({ action: 'range', from: `${y}-${m}-01`, to: `${y}-${m}-${last}` })
      .then((json) => (json.items || []).map(toRecord))
  },

  // 範囲指定での記録一覧取得
  range(from, to) {
    return apiGet({ action: 'range', from, to })
      .then((json) => (json.items || []).map(toRecord))
  },

  // 指定日の記録一覧取得
  day(date) {
    return apiGet({ action: 'day', date })
      .then((json) => (json.items || []).map(toRecord))
  },

  // キーワード検索 — GASのパラメータ名は「q」
  search(keyword) {
    return apiGet({ action: 'search', q: keyword })
      .then((json) => (json.items || []).map(toRecord))
  },

  // 新規作成 — GASが期待するフラットな形式で送る（textはbodyにマップ）
  create(record) {
    return apiPost({
      action: 'create',
      date: record.date,
      time: record.time || '',
      channel: record.channel,
      body: record.text
    }).then((json) => ({ id: json.item?.id }))
  },

  // 更新
  update(record) {
    return apiPost({
      action: 'update',
      id: record.id,
      date: record.date,
      time: record.time || '',
      channel: record.channel,
      body: record.text
    })
  },

  // 削除
  remove(id) {
    return apiPost({ action: 'delete', id })
  }
}
