// server.js
// Run: node server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'change_me'; // token agents use to register
const AGENT_CALL_TOKEN = process.env.AGENT_CALL_TOKEN || AUTH_TOKEN; // token server uses to call agents

const AGENTS_FILE = path.join(__dirname, 'agents.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.static(PUBLIC_DIR));

let agents = {}; // id -> { id, name, host, lastSeen, files, meta }

function loadAgents() {
  try {
    const raw = fs.readFileSync(AGENTS_FILE, 'utf8');
    agents = JSON.parse(raw);
  } catch (e) { agents = {}; }
}
function saveAgents() {
  try { fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2)); } catch (e) {}
}
loadAgents();

// SSE clients
const sseClients = new Set();
function broadcastAgents() {
  const list = Object.values(agents).map(a => {
    const online = (Date.now() - (a.lastSeen || 0)) < 90_000; // 90s
    return { id: a.id, name: a.name, host: a.host, files: a.files||[], lastSeen: a.lastSeen, online, meta: a.meta||{} };
  });
  const payload = JSON.stringify(list);
  for (const res of sseClients) {
    try {
      res.write(`event: agents\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (e) {}
  }
}

// Helper: require Authorization Bearer token
function requireAuth(req, res, next){
  const h = req.get('authorization') || '';
  if(!h.startsWith('Bearer ')) return res.status(401).json({ error: 'auth required' });
  const token = h.slice(7).trim();
  if(token !== AUTH_TOKEN) return res.status(403).json({ error: 'invalid token' });
  next();
}

// AGENT REGISTRATION (agents call this periodically)
app.post('/register', (req, res) => {
  const h = req.get('authorization') || '';
  if(!h.startsWith('Bearer ')) return res.status(401).json({ error: 'auth required' });
  const token = h.slice(7).trim();
  if(token !== AUTH_TOKEN) return res.status(403).json({ error: 'invalid token' });

  const { id, name, host, files, meta } = req.body || {};
  if(!id || !host) return res.status(400).json({ error: 'id and host required' });

  agents[id] = {
    id, name: name || id, host, files: files || [], lastSeen: Date.now(), meta: meta || {}
  };
  saveAgents();
  broadcastAgents();
  return res.json({ ok: true });
});

// SSE endpoint for UI
app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  sseClients.add(res);
  // send immediate snapshot
  res.write(`event: agents\n`);
  res.write(`data: ${JSON.stringify(Object.values(agents))}\n\n`);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// API for frontend: list agents (fallback if SSE fails)
app.get('/api/agents', (req, res) => {
  const list = Object.values(agents).map(a => {
    const online = (Date.now() - (a.lastSeen || 0)) < 90_000;
    return { id: a.id, name: a.name, host: a.host, files: a.files||[], lastSeen: a.lastSeen, online, meta: a.meta||{} };
  });
  res.json(list);
});

// Open image on specific agent (server calls agent)
app.post('/api/agents/:id/open', async (req, res) => {
  const id = req.params.id;
  const file = req.body && req.body.file;
  const a = agents[id];
  if(!a) return res.status(404).json({ error: 'agent not found' });
  try {
    const resp = await axios.post(`${a.host.replace(/\/$/, '')}/open-image`, { file }, {
      headers: { Authorization: `Bearer ${AGENT_CALL_TOKEN}` },
      timeout: 7000
    });
    return res.json({ ok: true, response: resp.data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Ask agent to download update (agent will decide how to apply)
app.post('/api/agents/:id/update', async (req, res) => {
  const id = req.params.id;
  const { url } = req.body || {};
  if(!url) return res.status(400).json({ error: 'url required' });
  const a = agents[id];
  if(!a) return res.status(404).json({ error: 'agent not found' });
  try {
    const resp = await axios.post(`${a.host.replace(/\/$/, '')}/update`, { url }, {
      headers: { Authorization: `Bearer ${AGENT_CALL_TOKEN}` },
      timeout: 15000
    });
    return res.json({ ok: true, response: resp.data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Trigger self-destruct for a single agent
app.post('/api/agents/:id/selfdestruct', async (req, res) => {
  const id = req.params.id;
  const a = agents[id];
  if(!a) return res.status(404).json({ error: 'agent not found' });
  try {
    const resp = await axios.post(`${a.host.replace(/\/$/, '')}/self-destruct`, {}, {
      headers: { Authorization: `Bearer ${AGENT_CALL_TOKEN}` },
      timeout: 10000
    });
    return res.json({ ok: true, response: resp.data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Endpoint for manual removal from server
app.post('/api/agents/:id/remove', (req, res) => {
  const id = req.params.id;
  if(agents[id]) delete agents[id];
  saveAgents();
  broadcastAgents();
  return res.json({ ok: true });
});

// Simple health
app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
  console.log('AUTH_TOKEN env variable must be set for agent registration.');
});
