import express from 'express'
import cors from 'cors'
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'

const db = new DatabaseSync('customers.db')
const hashPwd = pwd => createHash('sha256').update(pwd).digest('hex')
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL
  )
`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_name ON customers (first_name, last_name)`)

// Migration: เพิ่ม column ถ้ายังไม่มี (safe สำหรับ DB เก่า)
try { db.exec("ALTER TABLE customers ADD COLUMN created_at TEXT") } catch {}
try { db.exec("ALTER TABLE customers ADD COLUMN created_by TEXT DEFAULT ''") } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
  )
`)

if (!db.prepare("SELECT id FROM users WHERE username = 'AdminCL'").get()) {
  db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')")
    .run('AdminCL', hashPwd('CL2025'))
}

const app = express()
const sessions = new Map()
const sseClients = new Set()
const SESSION_TTL = 72 * 60 * 60 * 1000 // 72 ชั่วโมง

function broadcast() {
  for (const client of sseClients) client.write('event: update\ndata: {}\n\n')
}

// ลบ session ที่หมดอายุทุก 30 นาที
setInterval(() => {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token)
  }
}, 30 * 60 * 1000)

app.use(cors())
app.use(express.json())

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '') || (req.query.token || '')
  const session = sessions.get(token)
  if (!session) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' })
  if (Date.now() > session.expiresAt) { sessions.delete(token); return res.status(401).json({ error: 'หมดเวลาเซสชัน กรุณาเข้าสู่ระบบใหม่' }) }
  req.user = session
  next()
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'ไม่มีสิทธิ์' })
  next()
}

// --- Auth ---
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูล' })
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?')
    .get(username.trim(), hashPwd(password))
  if (!user) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
  const token = randomUUID()
  sessions.set(token, { userId: user.id, username: user.username, role: user.role, expiresAt: Date.now() + SESSION_TTL })
  res.json({ token, username: user.username, role: user.role })
})

app.post('/api/auth/logout', auth, (req, res) => {
  sessions.delete((req.headers.authorization || '').replace('Bearer ', ''))
  res.json({ success: true })
})

// --- SSE ---
app.get('/api/events', auth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  res.flushHeaders()
  res.write('event: connected\ndata: {}\n\n')
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

// --- Stats ---
app.get('/api/stats', auth, (req, res) => {
  const today = db.prepare(
    "SELECT COUNT(*) as count FROM customers WHERE date(created_at) = date('now', 'localtime')"
  ).get().count

  const todayByUser = db.prepare(
    "SELECT created_by, COUNT(*) as count FROM customers WHERE date(created_at) = date('now', 'localtime') AND created_by != '' GROUP BY created_by ORDER BY count DESC"
  ).all()

  const week = db.prepare(
    "SELECT COUNT(*) as count FROM customers WHERE created_at >= datetime('now', 'localtime', '-6 days', 'start of day')"
  ).get().count

  const month = db.prepare(
    "SELECT COUNT(*) as count FROM customers WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', datetime('now', 'localtime'))"
  ).get().count

  res.json({ today, todayByUser, week, month })
})

// --- Users (admin only) ---
app.get('/api/users', auth, adminOnly, (req, res) => {
  res.json(db.prepare("SELECT id, username, role FROM users ORDER BY role DESC, username ASC").all())
})

app.post('/api/users', auth, adminOnly, (req, res) => {
  const username = (req.body.username || '').trim()
  const password = (req.body.password || '').trim()
  const role = req.body.role === 'admin' ? 'admin' : 'user'
  if (!username || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' })
  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
      .run(username, hashPwd(password), role)
    res.json({ id: Number(lastInsertRowid), username, role })
  } catch {
    res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' })
  }
})

app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  if (Number(req.params.id) === req.user.userId)
    return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' })
  db.prepare('DELETE FROM users WHERE id = ?').run(Number(req.params.id))
  res.json({ success: true })
})

// --- Customers ---
app.get('/api/customers', auth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
  const search = (req.query.search || '').trim()
  const offset = (page - 1) * limit
  const pattern = `%${search}%`

  const { count } = db.prepare(
    'SELECT COUNT(*) as count FROM customers WHERE first_name LIKE ? OR last_name LIKE ?'
  ).get(pattern, pattern)

  const customers = db.prepare(
    'SELECT * FROM customers WHERE first_name LIKE ? OR last_name LIKE ? ORDER BY first_name ASC, last_name ASC LIMIT ? OFFSET ?'
  ).all(pattern, pattern, limit, offset)

  res.json({ customers, total: count, page, limit })
})

app.post('/api/customers/check-duplicates', auth, (req, res) => {
  const list = req.body.customers
  if (!Array.isArray(list)) return res.status(400).json({ error: 'invalid' })
  const check = db.prepare('SELECT id FROM customers WHERE first_name = ? AND last_name = ? LIMIT 1')
  const duplicates = [], unique = []
  for (const c of list) {
    if (check.get(c.first_name, c.last_name)) duplicates.push(c)
    else unique.push(c)
  }
  res.json({ duplicates, unique })
})

app.post('/api/customers/batch', auth, (req, res) => {
  const list = req.body.customers
  if (!Array.isArray(list) || list.length === 0)
    return res.status(400).json({ error: 'ไม่มีข้อมูล' })
  const insert = db.prepare('INSERT INTO customers (first_name, last_name, created_by, created_at) VALUES (?, ?, ?, ?)')
  db.exec('BEGIN')
  try {
    const ts = now()
    for (const { first_name, last_name } of list) insert.run(first_name, last_name, req.user.username, ts)
    db.exec('COMMIT')
  } catch {
    db.exec('ROLLBACK')
    return res.status(500).json({ error: 'บันทึกข้อมูลไม่สำเร็จ' })
  }
  broadcast()
  res.json({ success: true, count: list.length })
})

app.post('/api/customers', auth, (req, res) => {
  const first_name = (req.body.first_name || '').trim()
  const last_name = (req.body.last_name || '').trim()
  if (!first_name || !last_name) return res.status(400).json({ error: 'กรุณากรอกชื่อและนามสกุล' })
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO customers (first_name, last_name, created_by, created_at) VALUES (?, ?, ?, ?)'
  ).run(first_name, last_name, req.user.username, now())
  broadcast()
  res.json({ id: Number(lastInsertRowid), first_name, last_name })
})

app.put('/api/customers/:id', auth, adminOnly, (req, res) => {
  const first_name = (req.body.first_name || '').trim()
  const last_name = (req.body.last_name || '').trim()
  if (!first_name || !last_name) return res.status(400).json({ error: 'กรุณากรอกชื่อและนามสกุล' })
  const { changes } = db.prepare('UPDATE customers SET first_name = ?, last_name = ? WHERE id = ?')
    .run(first_name, last_name, Number(req.params.id))
  if (changes === 0) return res.status(404).json({ error: 'ไม่พบข้อมูล' })
  broadcast()
  res.json({ id: Number(req.params.id), first_name, last_name })
})

app.delete('/api/customers/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM customers WHERE id = ?').run(Number(req.params.id))
  broadcast()
  res.json({ success: true })
})

app.listen(3001, () => console.log('Server: http://localhost:3001'))
