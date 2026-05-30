const express = require('express')
const cors = require('cors')
require('dotenv').config()
const supabase = require('./db')

const app = express()
app.use(cors())
app.use(express.json())

// ── AUTH: REGISTER ──
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body
  const { data: existing } = await supabase
    .from('users').select('*').eq('email', email).single()
  if (existing) return res.status(400).json({ error: 'Email already exists' })
  const { data, error } = await supabase
    .from('users').insert([{ name, email, password, role }]).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ user: data })
})

// ── AUTH: LOGIN ──
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  const { data, error } = await supabase
    .from('users').select('*').eq('email', email).eq('password', password).single()
  if (error || !data) return res.status(401).json({ error: 'Invalid email or password' })
  res.json({ user: data })
})

// ── BATCHES: GET ALL ──
app.get('/api/batches', async (req, res) => {
  const { data, error } = await supabase
    .from('medicines').select('*').order('registered_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── BATCHES: GET BY MANUFACTURER ──
app.get('/api/batches/mine', async (req, res) => {
  const { email } = req.query
  const { data, error } = await supabase
    .from('medicines').select('*').eq('registered_by', email).order('registered_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── BATCHES: REGISTER NEW ──
app.post('/api/batches', async (req, res) => {
  const { drug_name, brand, composition, production_date, expiry_date, units, storage, license_no, registered_by, manufacturer_id } = req.body
  const batch_id = 'B-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 9000 + 1000)
  const { data, error } = await supabase
    .from('medicines').insert([{ batch_id, drug_name, brand, composition, production_date, expiry_date, units, storage, license_no, registered_by, manufacturer_id, status: 'active' }]).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ batch: data })
})

// ── BATCHES: RECALL ──
app.patch('/api/batches/:batch_id/recall', async (req, res) => {
  const { batch_id } = req.params
  const { data, error } = await supabase
    .from('medicines').update({ status: 'recalled' }).eq('batch_id', batch_id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ batch: data })
})

// ── VERIFY BATCH ──
app.post('/api/verify', async (req, res) => {
  const { batch_id, scanned_by } = req.body
  const { data: batch } = await supabase
    .from('medicines').select('*').eq('batch_id', batch_id).single()
  let result = 'not_found'
  if (batch) {
    result = batch.status === 'recalled' ? 'counterfeit' : 'authentic'
  }
  await supabase.from('verifications').insert([{ batch_id, scanned_by, result }])
  res.json({ result, batch: batch || null })
})

// ── SUPPLY CHAIN: LOG TRANSFER ──
app.post('/api/transfer', async (req, res) => {
  const { batch_id, from_entity, to_entity, units, notes } = req.body
  const { data, error } = await supabase
    .from('supply_chain_log').insert([{ batch_id, from_entity, to_entity, units, notes }]).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ transfer: data })
})

// ── SUPPLY CHAIN: GET BY BATCH ──
app.get('/api/transfer/:batch_id', async (req, res) => {
  const { data, error } = await supabase
    .from('supply_chain_log').select('*').eq('batch_id', req.params.batch_id).order('transfer_date', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── COMPLAINTS: FILE ──
app.post('/api/complaints', async (req, res) => {
  const { batch_id, pharmacy, issue_type, notes, filed_by } = req.body
  const { data, error } = await supabase
    .from('complaints').insert([{ batch_id, pharmacy, issue_type, notes, filed_by }]).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ complaint: data })
})

// ── COMPLAINTS: GET ALL ──
app.get('/api/complaints', async (req, res) => {
  const { data, error } = await supabase
    .from('complaints').select('*').order('filed_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── COMPLAINTS: RESOLVE ──
app.patch('/api/complaints/:id/resolve', async (req, res) => {
  const { data, error } = await supabase
    .from('complaints').update({ status: 'resolved' }).eq('complaint_id', req.params.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ complaint: data })
})

// ── REGULATOR DASHBOARD ──
app.get('/api/dashboard', async (req, res) => {
  const [batches, scans, complaints, transfers] = await Promise.all([
    supabase.from('medicines').select('*'),
    supabase.from('verifications').select('*'),
    supabase.from('complaints').select('*'),
    supabase.from('supply_chain_log').select('*'),
  ])
  res.json({
    totalBatches:    batches.data?.length || 0,
    totalScans:      scans.data?.length || 0,
    totalComplaints: complaints.data?.length || 0,
    totalTransfers:  transfers.data?.length || 0,
    recalled:        batches.data?.filter(b => b.status === 'recalled').length || 0,
    recentComplaints: complaints.data?.slice(0, 5) || [],
    recentTransfers:  transfers.data?.slice(0, 5) || [],
    recentBatches:    batches.data?.slice(0, 5) || [],
  })
})

// ── AUDIT LOG ──
app.get('/api/audit', async (req, res) => {
  const { data, error } = await supabase
    .from('audit_log').select('*').order('triggered_at', { ascending: false }).limit(50)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── SCAN HISTORY ──
app.get('/api/history', async (req, res) => {
  const { user_id } = req.query
  const { data, error } = await supabase
    .from('verifications').select('*').eq('scanned_by', user_id).order('scan_time', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.listen(process.env.PORT, () => {
  console.log('MediTrace backend running on port ' + process.env.PORT)
})
