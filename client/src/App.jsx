import { useState, useEffect, useCallback, useRef } from 'react'

const API = '/api/customers'
const LIMIT = 50

// ---- Stats Ticker ----
function StatsBar({ stats }) {
  if (!stats) return null

  const userParts = stats.todayByUser.length > 0
    ? stats.todayByUser.map(u => `${u.created_by} เพิ่ม ${u.count.toLocaleString()} รายชื่อ`).join('  ·  ')
    : 'ยังไม่มีการเพิ่มข้อมูลวันนี้'

  const text = [
    `วันนี้  ${stats.today.toLocaleString()} รายชื่อ`,
    userParts,
    `สัปดาห์นี้  ${stats.week.toLocaleString()} รายชื่อ`,
    `เดือนนี้  ${stats.month.toLocaleString()} รายชื่อ`,
  ].join('     ✦     ')

  return (
    <div className="bg-red-950 text-amber-200 text-xs py-1.5 overflow-hidden select-none">
      <div style={{ display: 'flex', animation: 'marquee 35s linear infinite', willChange: 'transform' }}>
        <span className="whitespace-nowrap px-16">{text}</span>
        <span className="whitespace-nowrap px-16" aria-hidden>{text}</span>
      </div>
    </div>
  )
}

function parseLines(text) {
  const errors = []
  const customers = []
  text.split('\n').forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (/\s{2,}/.test(trimmed)) {
      errors.push(`บรรทัด ${i + 1}: มีช่องว่างเกิน — "${trimmed}"`)
      return
    }
    const parts = trimmed.split(' ')
    if (parts.length !== 2) {
      errors.push(`บรรทัด ${i + 1}: ต้องมีชื่อและนามสกุลคั่นด้วยช่องว่าง 1 ช่อง — "${trimmed}"`)
      return
    }
    customers.push({ first_name: parts[0], last_name: parts[1] })
  })
  return { customers, errors }
}

// ---- Login ----
function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!username || !password) { setError('กรุณากรอกข้อมูล'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      localStorage.setItem('auth', JSON.stringify(data))
      onLogin(data)
    } catch {
      setError('เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-8">
        <h1 className="text-xl font-bold text-red-900 mb-1 text-center">CustomerList</h1>
        <p className="text-xs text-gray-400 text-center mb-6">กรุณาเข้าสู่ระบบ</p>
        {error && <p className="text-red-500 text-sm mb-4 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="ชื่อผู้ใช้"
            value={username}
            onChange={e => { setUsername(e.target.value); setError('') }}
            autoFocus
          />
          <input
            type="password"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="รหัสผ่าน"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
        </div>
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full mt-4 bg-red-900 text-white py-2 rounded-lg text-sm hover:bg-red-800 disabled:opacity-60"
        >
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </div>
    </div>
  )
}

// ---- Shared Page Header ----
function PageHeader({ title, onBack }) {
  return (
    <header className="bg-red-900 shadow-md shrink-0">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
        <button onClick={onBack} className="text-amber-200 hover:text-white -ml-1 p-1">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-amber-100">{title}</h2>
      </div>
    </header>
  )
}

// ---- User Management (Admin only) ----
function UserManagement({ apiFetch, onClose }) {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ username: '', password: '', role: 'user' })
  const [error, setError] = useState('')

  const fetchUsers = useCallback(async () => {
    const res = await apiFetch('/api/users')
    if (res.ok) setUsers(await res.json())
  }, [apiFetch])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleAdd() {
    if (!form.username.trim() || !form.password.trim()) { setError('กรุณากรอกข้อมูลให้ครบ'); return }
    const res = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(form) })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }
    setForm({ username: '', password: '', role: 'user' })
    setError('')
    fetchUsers()
  }

  async function handleDelete(id) {
    const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
    if (!res.ok) { const data = await res.json(); setError(data.error); return }
    fetchUsers()
  }

  return (
    <div className="fixed inset-0 bg-stone-100 z-40 flex flex-col">
      <PageHeader title="จัดการผู้ใช้งาน" onBack={onClose} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">

          {/* Add form */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-3 font-medium">เพิ่มผู้ใช้ใหม่</p>
            {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
            <div className="flex gap-2 flex-wrap">
              <input
                className="flex-1 min-w-24 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="ชื่อผู้ใช้"
                value={form.username}
                onChange={e => { setForm({ ...form, username: e.target.value }); setError('') }}
              />
              <input
                type="password"
                className="flex-1 min-w-24 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="รหัสผ่าน"
                value={form.password}
                onChange={e => { setForm({ ...form, password: e.target.value }); setError('') }}
              />
              <select
                className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={handleAdd} className="bg-red-900 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-red-800">เพิ่ม</button>
            </div>
          </div>

          {/* User list */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">ชื่อผู้ใช้</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-medium">ระดับ</th>
                  <th className="px-4 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t">
                    <td className="px-4 py-2">{u.username}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                        {u.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleDelete(u.id)} className="text-red-500 hover:underline text-xs">ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  )
}

// ---- Settings ----
function Settings({ apiFetch, onClose }) {
  const [step, setStep] = useState('idle') // idle | checking | preview | done
  const [preview, setPreview] = useState(null)
  const [errors, setErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  function parseCSV(content) {
    const errs = [], customers = []
    content.trim().split('\n').forEach((line, i) => {
      const t = line.trim()
      if (!t || t.toLowerCase() === 'first_name,last_name') return
      let fn, ln
      if (t.includes(',')) { [fn, ln] = t.split(',').map(s => s.trim()) }
      else { const p = t.split(/\s+/); if (p.length !== 2) { errs.push(`บรรทัด ${i + 1}: "${t}"`); return }; fn = p[0]; ln = p[1] }
      if (!fn || !ln) { errs.push(`บรรทัด ${i + 1}: ข้อมูลไม่ครบ`); return }
      customers.push({ first_name: fn, last_name: ln })
    })
    return { customers, errors: errs }
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const content = await file.text()
    const { customers, errors: errs } = parseCSV(content)
    setErrors(errs)
    if (customers.length === 0) return
    setStep('checking')
    try {
      const res = await apiFetch('/api/customers/check-duplicates', { method: 'POST', body: JSON.stringify({ customers }) })
      const data = await res.json()
      setPreview(data)
      setStep('preview')
    } catch {
      setErrors(prev => [...prev, 'เกิดข้อผิดพลาดขณะตรวจสอบ'])
      setStep('idle')
    }
  }

  async function handleImport() {
    if (!preview?.unique.length) return
    setImporting(true)
    try {
      const res = await apiFetch('/api/customers/batch', { method: 'POST', body: JSON.stringify({ customers: preview.unique }) })
      if (res.ok) { setResult({ added: preview.unique.length, skipped: preview.duplicates.length }); setStep('done') }
    } finally { setImporting(false) }
  }

  async function handleExport() {
    const res = await apiFetch('/api/customers/export')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function resetImport() { setStep('idle'); setPreview(null); setErrors([]); setResult(null); if (fileRef.current) fileRef.current.value = '' }

  return (
    <div className="fixed inset-0 bg-stone-100 z-40 flex flex-col">
      <PageHeader title="ตั้งค่า" onBack={onClose} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">

          {/* Export */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-0.5">Export ฐานข้อมูล</p>
            <p className="text-xs text-gray-400 mb-3">ดาวน์โหลดรายชื่อทั้งหมดเป็นไฟล์ CSV</p>
            <button onClick={handleExport} className="bg-amber-700 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-amber-800">
              ดาวน์โหลด CSV
            </button>
          </div>

          {/* Import */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-0.5">Import ฐานข้อมูล</p>
            <p className="text-xs text-gray-400 mb-3">รายชื่อใหม่จะถูกเพิ่ม · รายชื่อซ้ำจะถูกข้าม</p>

            {(step === 'idle' || step === 'checking') && (
              <>
                {errors.length > 0 && <ul className="text-red-500 text-xs mb-2 space-y-0.5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={step === 'checking'}
                  className="w-full border-2 border-dashed border-gray-300 py-3 rounded-lg text-sm text-gray-500 hover:border-amber-500 hover:text-amber-600 disabled:opacity-50"
                >
                  {step === 'checking' ? 'กำลังตรวจสอบ...' : 'เลือกไฟล์ CSV'}
                </button>
              </>
            )}

            {step === 'preview' && preview && (
              <>
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                    <span className="text-sm text-green-700">เพิ่มใหม่</span>
                    <span className="font-bold text-green-700">{preview.unique.length.toLocaleString()} รายชื่อ</span>
                  </div>
                  <div className="flex justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2.5">
                    <span className="text-sm text-yellow-700">ซ้ำ (ข้าม)</span>
                    <span className="font-bold text-yellow-700">{preview.duplicates.length.toLocaleString()} รายชื่อ</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={resetImport} className="flex-1 border rounded-lg py-2 text-sm hover:bg-gray-50">ยกเลิก</button>
                  <button
                    onClick={handleImport}
                    disabled={importing || preview.unique.length === 0}
                    className="flex-1 bg-red-900 text-white rounded-lg py-2 text-sm hover:bg-red-800 disabled:opacity-50"
                  >
                    {importing ? 'กำลังนำเข้า...' : 'ยืนยันนำเข้า'}
                  </button>
                </div>
              </>
            )}

            {step === 'done' && result && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                นำเข้าสำเร็จ · เพิ่ม <strong>{result.added.toLocaleString()}</strong> รายชื่อ · ข้าม <strong>{result.skipped.toLocaleString()}</strong> รายชื่อ (ซ้ำ)
                <button onClick={resetImport} className="block mt-1.5 text-xs underline text-green-600">นำเข้าไฟล์อื่น</button>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}

// ---- Customer Modal ----
function Modal({ title, isAdd, text, onChange, onCheck, onClose, onConfirm, onBack, preview, formErrors, checking }) {
  const taRef = useRef(null)

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [text])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold mb-1">{title}</h2>

        {!preview ? (
          <>
            <p className="text-xs text-gray-400 mb-3">
              {isAdd
                ? 'กรอกชื่อจริง นามสกุล คั่นด้วยเว้นวรรค 1 ช่อง · เพิ่มได้หลายรายการทีละบรรทัด'
                : 'ชื่อจริง นามสกุล คั่นด้วยเว้นวรรค 1 ช่อง'}
            </p>
            {formErrors.length > 0 && (
              <ul className="text-red-500 text-xs mb-3 space-y-1 bg-red-50 rounded-lg px-3 py-2">
                {formErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            <div className="relative">
              <textarea
                ref={taRef}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none font-mono overflow-hidden"
                style={{ minHeight: '10rem', maxHeight: '50vh' }}
                placeholder={isAdd ? 'สมชาย ใจดี\nสมหญิง รักเรียน\nมานะ พยายาม' : 'ชื่อจริง นามสกุล'}
                value={text}
                onChange={e => onChange(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const t = await navigator.clipboard.readText()
                    onChange(text ? text + '\n' + t.trim() : t.trim())
                  } catch {}
                }}
                className="absolute bottom-2 right-2 text-gray-400 hover:text-amber-600"
                title="วางจาก Clipboard"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </button>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
              <button
                onClick={onCheck}
                disabled={checking}
                className="px-4 py-2 text-sm rounded-lg bg-red-900 text-white hover:bg-red-800 disabled:opacity-60"
              >
                {checking ? 'กำลังตรวจ...' : 'ถัดไป'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-4">ตรวจสอบข้อมูลก่อนบันทึก</p>
            <div className="space-y-2 mb-5">
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <span className="text-sm text-green-700">บันทึกใหม่</span>
                <span className="text-lg font-bold text-green-700">{preview.unique.length} รายชื่อ</span>
              </div>
              <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                <span className="text-sm text-yellow-700">ซ้ำ (ข้าม)</span>
                <span className="text-lg font-bold text-yellow-700">{preview.duplicates.length} รายชื่อ</span>
              </div>
              {preview.duplicates.length > 0 && (
                <ul className="text-xs text-yellow-600 bg-yellow-50 rounded-lg px-3 py-2 max-h-28 overflow-y-auto space-y-0.5">
                  {preview.duplicates.map((c, i) => <li key={i}>{c.first_name} {c.last_name}</li>)}
                </ul>
              )}
            </div>
            <div className="flex justify-between gap-2">
              <button onClick={onBack} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ย้อนกลับ</button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
                <button
                  onClick={onConfirm}
                  disabled={preview.unique.length === 0}
                  className="px-4 py-2 text-sm rounded-lg bg-red-900 text-white hover:bg-red-800 disabled:opacity-40"
                >
                  ยืนยันบันทึก
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---- Main App ----
export default function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('auth')) } catch { return null }
  })

  const apiFetch = useCallback((url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth?.token}`, ...options.headers }
    })
  }, [auth])

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem('auth')
    setAuth(null)
  }

  if (!auth) return <Login onLogin={data => setAuth(data)} />

  return <CustomerApp auth={auth} apiFetch={apiFetch} onLogout={handleLogout} />
}

function ActivityLog({ apiFetch, onClose }) {
  const [logs, setLogs] = useState([])
  const [online, setOnline] = useState({ count: 0, users: [] })

  useEffect(() => {
    apiFetch('/api/admin/logs').then(r => r.ok && r.json()).then(d => d && setLogs(d))
    apiFetch('/api/online').then(r => r.ok && r.json()).then(d => d && setOnline(d))
  }, [apiFetch])

  return (
    <div className="fixed inset-0 bg-stone-100 z-40 flex flex-col">
      <PageHeader title="ประวัติกิจกรรม" onBack={onClose} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">

          {/* ออนไลน์อยู่ */}
          <div className="bg-white border rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-green-700 mb-1">ออนไลน์อยู่ตอนนี้ ({online.count} คน)</p>
            <div className="flex flex-wrap gap-1.5">
              {online.users.length === 0
                ? <span className="text-xs text-gray-400">ไม่มีผู้ใช้ออนไลน์</span>
                : online.users.map(u => (
                  <span key={u} className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">{u}</span>
                ))
              }
            </div>
          </div>

          {/* Log table */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">ผู้ใช้</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">กิจกรรม</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">เวลา</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0
                  ? <tr><td colSpan={3} className="text-center py-6 text-gray-400">ยังไม่มีกิจกรรม</td></tr>
                  : logs.map(log => (
                    <tr key={log.id} className="border-t">
                      <td className="px-3 py-2 font-medium text-gray-700">{log.username}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${log.action === 'login' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {log.action === 'login' ? 'เข้าสู่ระบบ' : 'ออกจากระบบ'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{log.created_at}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  )
}

// ---- Menu Page ----
function MenuPage({ auth, onNavigate, onLogout }) {
  const [confirmLogout, setConfirmLogout] = useState(false)

  return (
    <div className="fixed inset-0 bg-stone-100 z-40 flex flex-col">
      <PageHeader title="เมนู" onBack={() => onNavigate(null)} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">

          {/* Account info */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">บัญชี</span>
            </div>
            <div className="px-4 py-3 flex items-center gap-2 border-b">
              <span className={`text-xs px-2 py-0.5 rounded-full ${auth.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                {auth.role === 'admin' ? 'Admin' : 'User'}
              </span>
              <span className="text-sm font-medium text-gray-700">{auth.username}</span>
            </div>
            {!confirmLogout ? (
              <button
                onClick={() => setConfirmLogout(true)}
                className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                ออกจากระบบ
              </button>
            ) : (
              <div className="px-4 py-3 bg-red-50 flex items-center justify-between gap-3">
                <span className="text-sm text-red-700">ยืนยันออกจากระบบ?</span>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmLogout(false)} className="px-3 py-1 text-xs border rounded-lg bg-white hover:bg-gray-50">ยกเลิก</button>
                  <button onClick={onLogout} className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">ออกจากระบบ</button>
                </div>
              </div>
            )}
          </div>

          {/* Admin tools */}
          {auth.role === 'admin' && (
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b">
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">การจัดการ</span>
              </div>
              {[
                { label: 'ผู้ใช้งาน', page: 'users', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
                { label: 'ประวัติกิจกรรม', page: 'activity', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
                { label: 'ตั้งค่า', page: 'settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
              ].map(({ label, page, icon }) => (
                <button
                  key={page}
                  onClick={() => onNavigate(page)}
                  className="w-full flex items-center justify-between px-4 py-3 border-t text-sm text-gray-700 hover:bg-amber-50 first:border-t-0"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                    </svg>
                    {label}
                  </div>
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

function CustomerApp({ auth, apiFetch, onLogout }) {
  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [text, setText] = useState('')
  const [formErrors, setFormErrors] = useState([])
  const [checking, setChecking] = useState(false)
  const [preview, setPreview] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [activePage, setActivePage] = useState(null) // null | 'menu' | 'users' | 'activity' | 'settings'
  const [stats, setStats] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const searchRef = useRef(null)

  const focusSearch = () => setTimeout(() => searchRef.current?.focus(), 50)

  const totalPages = Math.ceil(total / LIMIT) || 1

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`${API}?page=${page}&limit=${LIMIT}&search=${encodeURIComponent(search)}`)
      if (res.status === 401) { onLogout(); return }
      const data = await res.json()
      setCustomers(data.customers)
      setTotal(data.total)
      setLastUpdated(new Date())
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [page, search, apiFetch, onLogout])

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/stats')
      if (res.ok) setStats(await res.json())
    } catch { /* ignore */ }
  }, [apiFetch])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  useEffect(() => { focusSearch() }, [])

  // SSE: รับ push event จาก server
  useEffect(() => {
    fetchStats()
    const es = new EventSource(`/api/events?token=${auth.token}`)
    es.addEventListener('update', () => { fetchCustomers(); fetchStats() })
    return () => es.close()
  }, [auth.token, fetchCustomers, fetchStats])

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  function openAdd() { setText(''); setFormErrors([]); setPreview(null); setModal({ mode: 'add' }) }
  function openEdit(c) { setText(`${c.first_name} ${c.last_name}`); setFormErrors([]); setPreview(null); setModal({ mode: 'edit', id: c.id }) }
  function closeModal() { setModal(null); setPreview(null); setFormErrors([]); focusSearch() }

  async function handleCheck() {
    const { customers: parsed, errors } = parseLines(text)
    if (errors.length > 0) { setFormErrors(errors); return }
    if (parsed.length === 0) { setFormErrors(['กรุณากรอกข้อมูลอย่างน้อย 1 รายการ']); return }

    if (modal.mode === 'edit') {
      await doEdit(parsed[0]); return
    }

    setChecking(true)
    try {
      const res = await apiFetch(`${API}/check-duplicates`, { method: 'POST', body: JSON.stringify({ customers: parsed }) })
      const data = await res.json()
      setPreview(data)
    } catch {
      setFormErrors(['เกิดข้อผิดพลาดขณะตรวจสอบ'])
    } finally {
      setChecking(false)
    }
  }

  async function handleConfirm() {
    if (!preview || preview.unique.length === 0) return
    try {
      const res = await apiFetch(`${API}/batch`, { method: 'POST', body: JSON.stringify({ customers: preview.unique }) })
      const data = await res.json()
      if (!res.ok) { setFormErrors([data.error]); setPreview(null); return }
      closeModal(); fetchCustomers(); fetchStats()
    } catch {
      setFormErrors(['เกิดข้อผิดพลาด']); setPreview(null)
    }
  }

  async function doEdit({ first_name, last_name }) {
    try {
      const res = await apiFetch(`${API}/${modal.id}`, { method: 'PUT', body: JSON.stringify({ first_name, last_name }) })
      const data = await res.json()
      if (!res.ok) { setFormErrors([data.error]); return }
      closeModal(); fetchCustomers()
    } catch {
      setFormErrors(['เกิดข้อผิดพลาด'])
    }
  }

  async function handleDelete(id) {
    await apiFetch(`${API}/${id}`, { method: 'DELETE' })
    setDeleteId(null)
    focusSearch()
    if (customers.length === 1 && page > 1) setPage(p => p - 1)
    else fetchCustomers()
  }

  const startNum = (page - 1) * LIMIT + 1

  return (
    <div className="min-h-screen bg-stone-100">
      <StatsBar stats={stats} />
      <header className="bg-red-900 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-amber-100">รายชื่อลูกค้า</h1>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${auth.role === 'admin' ? 'bg-amber-600 text-white' : 'bg-red-800 text-red-200'}`}>
              {auth.role === 'admin' ? 'Admin' : 'User'}
            </span>
            <span className="text-sm text-amber-200 font-medium">{auth.username}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6" style={{ paddingBottom: '4.5rem' }}>
        <div className="mb-4">
          <div className="relative w-full">
            <input
              ref={searchRef}
              type="text"
              placeholder="ค้นหาชื่อหรือนามสกุล..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 ${searchInput ? 'pr-40' : 'pr-11'}`}
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); focusSearch() }}
                className="absolute right-11 top-0 bottom-0 flex items-center px-3 text-xs font-medium text-gray-400 hover:text-red-500"
                title="ล้างการค้นหา"
              >
                ล้างการค้นหา
              </button>
            )}
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  setSearchInput(text.trim())
                } catch {}
              }}
              className="absolute right-0 top-0 bottom-0 flex items-center px-3 text-gray-400 hover:text-amber-600"
              title="วางจาก Clipboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-0.5">
          <div className="text-sm text-gray-500">
            ทั้งหมด <span className="font-semibold text-gray-700">{total.toLocaleString()}</span> รายชื่อ
            {search && <span> · ค้นหา "{search}"</span>}
          </div>
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              อัปเดตล่าสุด {lastUpdated.toLocaleTimeString('th-TH')}
            </span>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 text-gray-500 font-medium w-12">#</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">ชื่อจริง</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">นามสกุล</th>
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400">กำลังโหลด...</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : customers.map((c, i) => (
                <tr key={c.id} className="border-t hover:bg-amber-50">
                  <td className="px-3 py-1.5 text-gray-400">{startNum + i}</td>
                  <td className="px-3 py-1.5 text-gray-800">{c.first_name}</td>
                  <td className="px-3 py-1.5 text-gray-800">{c.last_name}</td>
                  <td className="px-3 py-1.5 text-right space-x-3">
                    {auth.role === 'admin' && <>
                      <button onClick={() => openEdit(c)} className="text-amber-700 hover:underline text-xs py-1">แก้ไข</button>
                      <button onClick={() => setDeleteId(c.id)} className="text-red-500 hover:underline text-xs py-1">ลบ</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 gap-2">
            <span className="text-sm text-gray-500">หน้า {page} / {totalPages.toLocaleString()}</span>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1.5 text-sm border rounded disabled:opacity-40 hover:bg-stone-100">«</button>
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="px-3 py-1.5 text-sm border rounded disabled:opacity-40 hover:bg-stone-100">‹ ก่อนหน้า</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} className="px-3 py-1.5 text-sm border rounded disabled:opacity-40 hover:bg-stone-100">ถัดไป ›</button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1.5 text-sm border rounded disabled:opacity-40 hover:bg-stone-100">»</button>
            </div>
          </div>
        )}
      </main>

      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'เพิ่มลูกค้า' : 'แก้ไขข้อมูล'}
          isAdd={modal.mode === 'add'}
          text={text}
          onChange={t => { setText(t); setFormErrors([]) }}
          onCheck={handleCheck}
          onClose={closeModal}
          onConfirm={handleConfirm}
          onBack={() => setPreview(null)}
          preview={preview}
          formErrors={formErrors}
          checking={checking}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-xs w-full">
            <p className="text-sm text-gray-700 mb-5">ต้องการลบรายชื่อนี้ใช่หรือไม่?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">ยกเลิก</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">ลบ</button>
            </div>
          </div>
        </div>
      )}

      {activePage === 'menu' && (
        <MenuPage auth={auth} onNavigate={setActivePage} onLogout={onLogout} />
      )}
      {activePage === 'users' && (
        <UserManagement apiFetch={apiFetch} onClose={() => setActivePage('menu')} />
      )}
      {activePage === 'settings' && (
        <Settings apiFetch={apiFetch} onClose={() => setActivePage('menu')} />
      )}
      {activePage === 'activity' && (
        <ActivityLog apiFetch={apiFetch} onClose={() => setActivePage('menu')} />
      )}

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-stone-900 border-t border-stone-700 shadow-lg z-30 flex">
        <button
          onClick={() => setActivePage(null)}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 ${activePage === null ? 'text-amber-500' : 'text-stone-400 hover:text-amber-500'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="text-xs font-medium">หน้าหลัก</span>
        </button>

        <button onClick={openAdd} className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-stone-400 hover:text-amber-500 active:text-amber-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs">เพิ่ม</span>
        </button>

        <button
          onClick={() => setActivePage('menu')}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 ${activePage === 'menu' ? 'text-amber-500' : 'text-stone-400 hover:text-amber-500'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="text-xs">เมนู</span>
        </button>
      </nav>
    </div>
  )
}
