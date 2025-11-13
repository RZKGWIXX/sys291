async function loadPCs(){
  const res = await fetch('/api/pcs');
  const pcs = await res.json();
  const container = document.getElementById('pcs');
  container.innerHTML = '';
  const tpl = document.getElementById('card-template');
  pcs.forEach(p=>{
    const node = tpl.content.cloneNode(true);
    node.querySelector('.pc-name').textContent = p.name;
    node.querySelector('.pc-status').textContent = p.status === 'on' ? 'Увімкнений' : (p.status === 'offline' ? 'Офлайн' : 'Невідомо');
    const openPanelBtn = node.querySelector('.open-panel');
    const panel = node.querySelector('.panel');
    const showImgBtn = node.querySelector('.show-image');
    const panelResult = node.querySelector('.panel-result');
    const select = node.querySelector('.file-select');
    const selfdestructBtn = node.querySelector('.selfdestruct.single');

    openPanelBtn.addEventListener('click', ()=> {
      panel.classList.toggle('hidden');
      // populate files list
      select.innerHTML = '';
      (p.files || []).forEach(f=>{
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        select.appendChild(opt);
      });
      if((p.files || []).length === 0){
        const opt = document.createElement('option');
        opt.textContent = 'Файлів не знайдено';
        select.appendChild(opt);
      }
    });

    showImgBtn.addEventListener('click', async ()=>{
      panelResult.textContent = 'Виконую...';
      try{
        const r = await fetch('/api/open', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ host: p.host, file: select.value })
        });
        const data = await r.json();
        if(r.ok && data.ok){
          panelResult.textContent = 'Команда відправлена — картинка повинна відкритися на ПК.';
        }else{
          panelResult.textContent = 'Помилка: ' + (data.error || JSON.stringify(data));
        }
      }catch(e){
        panelResult.textContent = 'Помилка мережі: ' + e.message;
      }
    });

    selfdestructBtn.addEventListener('click', async ()=>{
      if(!confirm('Ви впевнені? Ця дія видалить агента з цього ПК та його файли. Відновити буде неможливо.')) return;
      panelResult.textContent = 'Надсилаю команду самознищення...';
      try{
        const r = await fetch('/api/selfdestruct', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ host: p.host })
        });
        const data = await r.json();
        if(r.ok && data.ok){
          panelResult.textContent = 'Агент почав процес самознищення.';
        }else{
          panelResult.textContent = 'Помилка: ' + (data.error || JSON.stringify(data));
        }
      }catch(e){
        panelResult.textContent = 'Помилка мережі: ' + e.message;
      }
    });

    container.appendChild(node);
  });
}

document.getElementById('selfdestructAll').addEventListener('click', async ()=>{
  if(!confirm('Ви впевнені? Це запустить самознищення на ВСІХ агентах зі списку pcs.json.')) return;
  try{
    const r = await fetch('/api/selfdestruct-all', { method:'POST' });
    const res = await r.json();
    alert('Команди надіслані. Перевірте результати у консолі сервера або через статус агента.');
    loadPCs();
  }catch(e){
    alert('Помилка: ' + e.message);
  }
});

loadPCs();
setInterval(loadPCs, 8000);
