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
    <div className="bg-blue-600 text-white text-xs py-1.5 overflow-hidden select-none">
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-8">
        <h1 className="text-xl font-bold text-gray-800 mb-1 text-center">CustomerList</h1>
        <p className="text-xs text-gray-400 text-center mb-6">กรุณาเข้าสู่ระบบ</p>
        {error && <p className="text-red-500 text-sm mb-4 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="ชื่อผู้ใช้"
            value={username}
            onChange={e => { setUsername(e.target.value); setError('') }}
            autoFocus
          />
          <input
            type="password"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="รหัสผ่าน"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
        </div>
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </div>
    </div>
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
    if (!res.ok) {
      const data = await res.json()
      setError(data.error)
      return
    }
    fetchUsers()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">จัดการผู้ใช้งาน</h2>

        {/* Add form */}
        <div className="border rounded-lg p-4 mb-4 bg-gray-50">
          <p className="text-xs text-gray-500 mb-3 font-medium">เพิ่มผู้ใช้ใหม่</p>
          {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
          <div className="flex gap-2 flex-wrap">
            <input
              className="flex-1 min-w-24 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="ชื่อผู้ใช้"
              value={form.username}
              onChange={e => { setForm({ ...form, username: e.target.value }); setError('') }}
            />
            <input
              type="password"
              className="flex-1 min-w-24 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="รหัสผ่าน"
              value={form.password}
              onChange={e => { setForm({ ...form, password: e.target.value }); setError('') }}
            />
            <select
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={handleAdd}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700"
            >
              เพิ่ม
            </button>
          </div>
        </div>

        {/* User list */}
        <div className="border rounded-lg overflow-hidden mb-4 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
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
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {u.role === 'admin' ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-red-500 hover:underline text-xs"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">ปิด</button>
        </div>
      </div>
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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
            <textarea
              ref={taRef}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none font-mono overflow-hidden"
              style={{ minHeight: '7.5rem' }}
              placeholder={isAdd ? 'สมชาย ใจดี\nสมหญิง รักเรียน\nมานะ พยายาม' : 'ชื่อจริง นามสกุล'}
              value={text}
              onChange={e => onChange(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">ยกเลิก</button>
              <button
                onClick={onCheck}
                disabled={checking}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
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
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
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
  const [showUsers, setShowUsers] = useState(false)
  const [stats, setStats] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

  // SSE: รับ push event จาก server ทันทีที่มีการเปลี่ยนแปลง
  useEffect(() => {
    fetchStats()
    const es = new EventSource(`/api/events?token=${auth.token}`)
    es.addEventListener('update', () => { fetchCustomers(); fetchStats() })
    es.onerror = () => es.close()
    return () => es.close()
  }, [auth.token, fetchCustomers, fetchStats])

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  function openAdd() { setText(''); setFormErrors([]); setPreview(null); setModal({ mode: 'add' }) }
  function openEdit(c) { setText(`${c.first_name} ${c.last_name}`); setFormErrors([]); setPreview(null); setModal({ mode: 'edit', id: c.id }) }
  function closeModal() { setModal(null); setPreview(null); setFormErrors([]) }

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
    if (customers.length === 1 && page > 1) setPage(p => p - 1)
    else fetchCustomers()
  }

  const startNum = (page - 1) * LIMIT + 1

  return (
    <div className="min-h-screen bg-gray-50">
      <StatsBar stats={stats} />
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">รายชื่อลูกค้า</h1>
          <div className="flex items-center gap-2">
            <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 font-medium">
              + เพิ่มลูกค้า
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="p-2 rounded-lg border hover:bg-gray-50 text-gray-600"
                aria-label="เมนู"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white border rounded-xl shadow-lg z-40 py-1">
                  <div className="px-4 py-2.5 border-b">
                    <p className="text-sm font-medium text-gray-800">{auth.username}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${auth.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {auth.role === 'admin' ? 'Admin' : 'User'}
                    </span>
                  </div>
                  {auth.role === 'admin' && (
                    <button
                      onClick={() => { setShowUsers(true); setMenuOpen(false) }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      จัดการผู้ใช้
                    </button>
                  )}
                  <button
                    onClick={onLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
                  >
                    ออกจากระบบ
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-4">
          <input
            type="text"
            placeholder="ค้นหาชื่อหรือนามสกุล..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full max-w-sm border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex items-center justify-between mb-3">
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
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-400">{startNum + i}</td>
                  <td className="px-3 py-1.5 text-gray-800">{c.first_name}</td>
                  <td className="px-3 py-1.5 text-gray-800">{c.last_name}</td>
                  <td className="px-3 py-1.5 text-right space-x-2">
                    {auth.role === 'admin' && <>
                      <button onClick={() => openEdit(c)} className="text-blue-600 hover:underline text-xs">แก้ไข</button>
                      <button onClick={() => setDeleteId(c.id)} className="text-red-500 hover:underline text-xs">ลบ</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-gray-500">หน้า {page} / {totalPages.toLocaleString()}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-100">«</button>
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-100">‹ ก่อนหน้า</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-100">ถัดไป ›</button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-100">»</button>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-xs w-full">
            <p className="text-sm text-gray-700 mb-5">ต้องการลบรายชื่อนี้ใช่หรือไม่?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">ยกเลิก</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">ลบ</button>
            </div>
          </div>
        </div>
      )}

      {showUsers && (
        <UserManagement apiFetch={apiFetch} onClose={() => setShowUsers(false)} />
      )}
    </div>
  )
}
