// ===== GAS Web App 接続設定 =====
// GASをデプロイした際の「ウェブアプリのURL」をここに設定してください
const GAS_URL = 'https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec'

async function apiGet(params) {
  const url = new URL(GAS_URL)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })
  const res = await fetch(url.toString(), { method: 'GET' })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function apiPost(body) {
  // Content-Typeを指定しない（text/plainで送信）ことでCORSプリフライトを回避する
  const res = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

const api = {
  // 月単位での記録一覧取得 { year, month } -> records[]
  list(year, month) {
    return apiGet({ action: 'list', year, month })
  },

  // 範囲指定での記録一覧取得 { from, to } (YYYY-MM-DD)
  range(from, to) {
    return apiGet({ action: 'range', from, to })
  },

  // 指定日の記録一覧取得 { date } -> records[]
  day(date) {
    return apiGet({ action: 'day', date })
  },

  // キーワード検索 { keyword } -> records[]
  search(keyword) {
    return apiGet({ action: 'search', keyword })
  },

  // 新規作成
  create(record) {
    return apiPost({ action: 'create', record })
  },

  // 更新
  update(record) {
    return apiPost({ action: 'update', record })
  },

  // 削除 { id }
  remove(id) {
    return apiPost({ action: 'delete', id })
  }
}
