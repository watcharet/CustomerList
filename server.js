import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import pg from 'pg'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})

const db = {
  query: (text, params) => pool.query(text, params),
  one: async (text, params) => { const { rows } = await pool.query(text, params); return rows[0] },
  all: async (text, params) => { const { rows } = await pool.query(text, params); return rows },
}

const hashPwd = pwd => createHash('sha256').update(pwd).digest('hex')
// เก็บเวลาในโซน Bangkok (UTC+7)
const now = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ')

// สร้างตารางถ้ายังไม่มี
await db.query(`
  CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    created_at TEXT,
    created_by TEXT DEFAULT ''
  )
`)
await db.query(`CREATE INDEX IF NOT EXISTS idx_name ON customers (first_name, last_name)`)
await db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
  )
`)

// สร้าง admin เริ่มต้นถ้ายังไม่มี
const adminExists = await db.one(`SELECT id FROM users WHERE username = 'AdminCL'`)
if (!adminExists) {
  await db.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'admin')`, ['AdminCL', hashPwd('CL2025')])
}

const app = express()
const sessions = new Map()
const sseClients = new Set()
const SESSION_TTL = 72 * 60 * 60 * 1000

function broadcast() {
  for (const client of sseClients) client.write('event: update\ndata: {}\n\n')
}

setInterval(() => {
  const t = Date.now()
  for (const [token, session] of sessions) {
    if (t > session.expiresAt) sessions.delete(token)
  }
}, 30 * 60 * 1000)

app.use(cors())
app.use(express.json())

// Serve React build (production)
const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, 'client', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '') || (req.query.token || '')
  const session = sessions.get(token)
  if (!session) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' })
  if (Date.now() > session.expiresAt) {
    sessions.delete(token)
    return res.status(401).json({ error: 'หมดเวลาเซสชัน กรุณาเข้าสู่ระบบใหม่' })
  }
  req.user = session
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
  const user = await db.one(`SELECT * FROM users WHERE username = $1 AND password = $2`, [username.trim(), hashPwd(password)])
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
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
  res.flushHeaders()
  res.write('event: connected\ndata: {}\n\n')
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

// --- Stats ---
app.get('/api/stats', auth, async (_req, res) => {
  const { rows: [{ count: today }] } = await pool.query(`
    SELECT COUNT(*) as count FROM customers
    WHERE LEFT(created_at, 10) = TO_CHAR(NOW() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')
  `)
  const todayByUser = await db.all(`
    SELECT created_by, COUNT(*) as count FROM customers
    WHERE LEFT(created_at, 10) = TO_CHAR(NOW() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')
      AND created_by != ''
    GROUP BY created_by ORDER BY count DESC
  `)
  const { rows: [{ count: week }] } = await pool.query(`
    SELECT COUNT(*) as count FROM customers
    WHERE created_at >= TO_CHAR(
      DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Bangkok' - INTERVAL '6 days'),
      'YYYY-MM-DD HH24:MI:SS'
    )
  `)
  const { rows: [{ count: month }] } = await pool.query(`
    SELECT COUNT(*) as count FROM customers
    WHERE LEFT(created_at, 7) = TO_CHAR(NOW() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM')
  `)
  res.json({ today: Number(today), todayByUser, week: Number(week), month: Number(month) })
})

// --- Users (admin only) ---
app.get('/api/users', auth, adminOnly, async (_req, res) => {
  const users = await db.all(`SELECT id, username, role FROM users ORDER BY role DESC, username ASC`)
  res.json(users)
})

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const username = (req.body.username || '').trim()
  const password = (req.body.password || '').trim()
  const role = req.body.role === 'admin' ? 'admin' : 'user'
  if (!username || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' })
  try {
    const { id } = await db.one(`INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id`, [username, hashPwd(password), role])
    res.json({ id, username, role })
  } catch {
    res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' })
  }
})

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  if (Number(req.params.id) === req.user.userId)
    return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' })
  await db.query(`DELETE FROM users WHERE id = $1`, [Number(req.params.id)])
  res.json({ success: true })
})

// --- Export ---
app.get('/api/customers/export', auth, adminOnly, async (_req, res) => {
  const rows = await db.all(`SELECT first_name, last_name FROM customers ORDER BY first_name ASC, last_name ASC`)
  const csv = ['first_name,last_name', ...rows.map(r => `${r.first_name},${r.last_name}`)].join('\n')
  const date = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="customers_${date}.csv"`)
  res.send('\uFEFF' + csv)
})

// --- Customers ---
app.get('/api/customers', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
  const search = (req.query.search || '').trim()
  const offset = (page - 1) * limit

  const parts = search.split(/\s+/).filter(Boolean)
  let where, params

  if (parts.length >= 2) {
    const fn = `%${parts[0]}%`
    const ln = `%${parts.slice(1).join(' ')}%`
    const full = `%${search}%`
    where = '(first_name LIKE $1 AND last_name LIKE $2) OR first_name LIKE $3 OR last_name LIKE $4'
    params = [fn, ln, full, full]
  } else {
    const p = `%${search}%`
    where = 'first_name LIKE $1 OR last_name LIKE $2'
    params = [p, p]
  }

  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) as count FROM customers WHERE ${where}`, params)
  const customers = await db.all(
    `SELECT * FROM customers WHERE ${where} ORDER BY first_name ASC, last_name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )
  res.json({ customers, total: Number(count), page, limit })
})

app.post('/api/customers/check-duplicates', auth, async (req, res) => {
  const list = req.body.customers
  if (!Array.isArray(list)) return res.status(400).json({ error: 'invalid' })
  const results = await Promise.all(
    list.map(c => db.one(`SELECT id FROM customers WHERE first_name = $1 AND last_name = $2 LIMIT 1`, [c.first_name, c.last_name]))
  )
  const duplicates = [], unique = []
  list.forEach((c, i) => { if (results[i]) duplicates.push(c); else unique.push(c) })
  res.json({ duplicates, unique })
})

app.post('/api/customers/batch', auth, async (req, res) => {
  const list = req.body.customers
  if (!Array.isArray(list) || list.length === 0)
    return res.status(400).json({ error: 'ไม่มีข้อมูล' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ts = now()
    for (const { first_name, last_name } of list) {
      await client.query(
        `INSERT INTO customers (first_name, last_name, created_by, created_at) VALUES ($1, $2, $3, $4)`,
        [first_name, last_name, req.user.username, ts]
      )
    }
    await client.query('COMMIT')
    broadcast()
    res.json({ success: true, count: list.length })
  } catch {
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'บันทึกข้อมูลไม่สำเร็จ' })
  } finally {
    client.release()
  }
})

app.post('/api/customers', auth, async (req, res) => {
  const first_name = (req.body.first_name || '').trim()
  const last_name = (req.body.last_name || '').trim()
  if (!first_name || !last_name) return res.status(400).json({ error: 'กรุณากรอกชื่อและนามสกุล' })
  const { id } = await db.one(
    `INSERT INTO customers (first_name, last_name, created_by, created_at) VALUES ($1, $2, $3, $4) RETURNING id`,
    [first_name, last_name, req.user.username, now()]
  )
  broadcast()
  res.json({ id, first_name, last_name })
})

app.put('/api/customers/:id', auth, adminOnly, async (req, res) => {
  const first_name = (req.body.first_name || '').trim()
  const last_name = (req.body.last_name || '').trim()
  if (!first_name || !last_name) return res.status(400).json({ error: 'กรุณากรอกชื่อและนามสกุล' })
  const { rowCount } = await pool.query(
    `UPDATE customers SET first_name = $1, last_name = $2 WHERE id = $3`,
    [first_name, last_name, Number(req.params.id)]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบข้อมูล' })
  broadcast()
  res.json({ id: Number(req.params.id), first_name, last_name })
})

app.delete('/api/customers/:id', auth, adminOnly, async (req, res) => {
  await db.query(`DELETE FROM customers WHERE id = $1`, [Number(req.params.id)])
  broadcast()
  res.json({ success: true })
})

// Fallback → React SPA
if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(join(distPath, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`))
