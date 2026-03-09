import express from 'express'
import cors from 'cors'
import { createClient } from '@libsql/client'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const hashPwd = pwd => createHash('sha256').update(pwd).digest('hex')
const nowStr = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

// DB: Turso ใน production, local file ใน dev
const db = createClient(
  process.env.TURSO_DATABASE_URL
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: 'file:customers.db' }
)

// JWT (ไม่ต้องใช้ library ภายนอก)
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex')
const SESSION_TTL_SEC = 72 * 3600

function signJWT(payload) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const b = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC })).toString('base64url')
  const s = createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url')
  return `${h}.${b}.${s}`
}

function verifyJWT(token) {
  try {
    const [h, b, s] = (token || '').split('.')
    if (!h || !b || !s) return null
    const expected = createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url')
    if (s !== expected) return null
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString())
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch { return null }
}

// Init DB
await db.execute(`CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL
)`)
await db.execute(`CREATE INDEX IF NOT EXISTS idx_name ON customers (first_name, last_name)`)

for (const sql of [
  "ALTER TABLE customers ADD COLUMN created_at TEXT",
  "ALTER TABLE customers ADD COLUMN created_by TEXT DEFAULT ''",
]) { try { await db.execute(sql) } catch {} }

await db.execute(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
)`)

const adminRow = await db.execute("SELECT id FROM users WHERE username = 'AdminCL'")
if (adminRow.rows.length === 0) {
  await db.execute({ sql: "INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')", args: ['AdminCL', hashPwd('CL2025')] })
}

const app = express()
app.use(cors())
app.use(express.json())

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '') || (req.query.token || '')
  const payload = verifyJWT(token)
  if (!payload) return res.status(401).json({ error: 'หมดเวลาเซสชัน กรุณาเข้าสู่ระบบใหม่' })
  req.user = payload
  next()
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'ไม่มีสิทธิ์' })
  next()
}

// --- Auth ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูล' })
  try {
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE username = ? AND password = ?', args: [username.trim(), hashPwd(password)] })
    const user = result.rows[0]
    if (!user) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
    const token = signJWT({ userId: Number(user.id), username: user.username, role: user.role })
    res.json({ token, username: user.username, role: user.role })
  } catch { res.status(500).json({ error: 'เกิดข้อผิดพลาด' }) }
})

app.post('/api/auth/logout', auth, (_req, res) => {
  res.json({ success: true })
})

// --- Stats ---
app.get('/api/stats', auth, async (_req, res) => {
  try {
    const today = Number((await db.execute("SELECT COUNT(*) as count FROM customers WHERE date(created_at) = date('now', 'localtime')")).rows[0].count)
    const todayByUser = (await db.execute("SELECT created_by, COUNT(*) as count FROM customers WHERE date(created_at) = date('now', 'localtime') AND created_by != '' GROUP BY created_by ORDER BY count DESC")).rows
      .map(r => ({ created_by: r.created_by, count: Number(r.count) }))
    const week = Number((await db.execute("SELECT COUNT(*) as count FROM customers WHERE created_at >= datetime('now', 'localtime', '-6 days', 'start of day')")).rows[0].count)
    const month = Number((await db.execute("SELECT COUNT(*) as count FROM customers WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', datetime('now', 'localtime'))")).rows[0].count)
    res.json({ today, todayByUser, week, month })
  } catch { res.status(500).json({ error: 'เกิดข้อผิดพลาด' }) }
})

// --- Users (admin only) ---
app.get('/api/users', auth, adminOnly, async (_req, res) => {
  const result = await db.execute("SELECT id, username, role FROM users ORDER BY role DESC, username ASC")
  res.json(result.rows)
})

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const username = (req.body.username || '').trim()
  const password = (req.body.password || '').trim()
  const role = req.body.role === 'admin' ? 'admin' : 'user'
  if (!username || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' })
  try {
    const result = await db.execute({ sql: 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)', args: [username, hashPwd(password), role] })
    res.json({ id: Number(result.lastInsertRowid), username, role })
  } catch { res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' }) }
})

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  if (Number(req.params.id) === req.user.userId)
    return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' })
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [Number(req.params.id)] })
  res.json({ success: true })
})

// --- Customers ---
app.get('/api/customers', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
  const search = (req.query.search || '').trim()
  const offset = (page - 1) * limit
  const pattern = `%${search}%`

  const count = Number((await db.execute({ sql: 'SELECT COUNT(*) as count FROM customers WHERE first_name LIKE ? OR last_name LIKE ?', args: [pattern, pattern] })).rows[0].count)
  const customers = (await db.execute({ sql: 'SELECT * FROM customers WHERE first_name LIKE ? OR last_name LIKE ? ORDER BY first_name ASC, last_name ASC LIMIT ? OFFSET ?', args: [pattern, pattern, limit, offset] })).rows

  res.json({ customers, total: count, page, limit })
})

app.post('/api/customers/check-duplicates', auth, async (req, res) => {
  const list = req.body.customers
  if (!Array.isArray(list)) return res.status(400).json({ error: 'invalid' })
  const duplicates = [], unique = []
  for (const c of list) {
    const result = await db.execute({ sql: 'SELECT id FROM customers WHERE first_name = ? AND last_name = ? LIMIT 1', args: [c.first_name, c.last_name] })
    if (result.rows.length > 0) duplicates.push(c)
    else unique.push(c)
  }
  res.json({ duplicates, unique })
})

app.post('/api/customers/batch', auth, async (req, res) => {
  const list = req.body.customers
  if (!Array.isArray(list) || list.length === 0)
    return res.status(400).json({ error: 'ไม่มีข้อมูล' })
  const ts = nowStr()
  try {
    await db.batch(
      list.map(({ first_name, last_name }) => ({
        sql: 'INSERT INTO customers (first_name, last_name, created_by, created_at) VALUES (?, ?, ?, ?)',
        args: [first_name, last_name, req.user.username, ts]
      })),
      'write'
    )
    res.json({ success: true, count: list.length })
  } catch { res.status(500).json({ error: 'บันทึกข้อมูลไม่สำเร็จ' }) }
})

app.post('/api/customers', auth, async (req, res) => {
  const first_name = (req.body.first_name || '').trim()
  const last_name = (req.body.last_name || '').trim()
  if (!first_name || !last_name) return res.status(400).json({ error: 'กรุณากรอกชื่อและนามสกุล' })
  const result = await db.execute({ sql: 'INSERT INTO customers (first_name, last_name, created_by, created_at) VALUES (?, ?, ?, ?)', args: [first_name, last_name, req.user.username, nowStr()] })
  res.json({ id: Number(result.lastInsertRowid), first_name, last_name })
})

app.put('/api/customers/:id', auth, adminOnly, async (req, res) => {
  const first_name = (req.body.first_name || '').trim()
  const last_name = (req.body.last_name || '').trim()
  if (!first_name || !last_name) return res.status(400).json({ error: 'กรุณากรอกชื่อและนามสกุล' })
  const result = await db.execute({ sql: 'UPDATE customers SET first_name = ?, last_name = ? WHERE id = ?', args: [first_name, last_name, Number(req.params.id)] })
  if (result.rowsAffected === 0) return res.status(404).json({ error: 'ไม่พบข้อมูล' })
  res.json({ id: Number(req.params.id), first_name, last_name })
})

app.delete('/api/customers/:id', auth, adminOnly, async (req, res) => {
  await db.execute({ sql: 'DELETE FROM customers WHERE id = ?', args: [Number(req.params.id)] })
  res.json({ success: true })
})

// Serve React build (local production)
if (!process.env.VERCEL) {
  const distPath = join(__dirname, 'client', 'dist')
  if (existsSync(distPath)) {
    app.use(express.static(distPath))
    app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')))
  }
}

export default app

// Start server เฉพาะตอนรันโดยตรง (ไม่ใช่ import โดย Vercel)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`))
}
