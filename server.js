const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const PCS_FILE = path.join(__dirname, 'pcs.json');

app.use(express.static(path.join(__dirname, 'public')));

function readPCs(){
  try{
    const raw = fs.readFileSync(PCS_FILE, 'utf8');
    return JSON.parse(raw);
  }catch(e){
    return [];
  }
}

app.get('/api/pcs', async (req, res) => {
  const pcs = readPCs();
  const checks = await Promise.all(pcs.map(async pc=>{
    const result = { name: pc.name, host: pc.host, raw: pc };
    try{
      const resp = await axios.get(pc.host.replace(/\/$/, '') + '/status', { timeout: 1500 });
      result.status = (resp && resp.data && resp.data.status) ? resp.data.status : 'unknown';
      result.agentName = resp.data.name || null;
      result.files = resp.data.files || [];
    }catch(e){
      result.status = 'offline';
    }
    return result;
  }));
  res.json(checks);
});

app.post('/api/open', async (req, res) => {
  const { host, file } = req.body || {};
  if(!host) return res.status(400).json({ error: 'host required in body' });
  try{
    const resp = await axios.post(host.replace(/\/$/, '') + '/open-image', { file }, { timeout: 4000 });
    return res.json({ ok: true, response: resp.data });
  }catch(e){
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// trigger self-destruct on a single agent
app.post('/api/selfdestruct', async (req, res) => {
  const { host } = req.body || {};
  if(!host) return res.status(400).json({ error: 'host required' });
  try{
    const resp = await axios.post(host.replace(/\/$/, '') + '/self-destruct', {}, { timeout: 5000 });
    return res.json({ ok: true, response: resp.data });
  }catch(e){
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// trigger self-destruct on all agents from pcs.json
app.post('/api/selfdestruct-all', async (req, res) => {
  const pcs = readPCs();
  const results = await Promise.all(pcs.map(async pc=>{
    try{
      const r = await axios.post(pc.host.replace(/\/$/, '') + '/self-destruct', {}, { timeout: 5000 });
      return { host: pc.host, ok: true, response: r.data };
    }catch(e){
      return { host: pc.host, ok: false, error: e.message };
    }
  }));
  res.json(results);
});

app.listen(PORT, () => {
  console.log('Site server running on port', PORT);
  console.log('Open http://localhost:' + PORT);
});
