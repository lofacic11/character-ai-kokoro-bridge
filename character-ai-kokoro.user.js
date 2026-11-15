// ==UserScript==
// @name         Character.AI -> Local Kokoro (Pipelined Paragraphs)
// @namespace    local.kokoro.characterai
// @version      0.4.0
// @description  Synthesizes finished paragraphs early and plays them sequentially through local Kokoro.
// @match        https://character.ai/*
// @match        https://*.character.ai/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  if (window.__caiKokoroV4) return;
  window.__caiKokoroV4 = true;

  const ENDPOINT = 'http://127.0.0.1:8880/speak';
  const VOICE = 'af_heart';
  const PREFIX = '[c.ai Kokoro]';
  const log = (...args) => console.log(PREFIX, ...args);
  let enabled = true;
  let initialized = false;
  let activeGroup = null;
  let generation = 0;
  let pipeline = null;
  let audio = null;
  let objectURL = null;
  let lastURL = location.href;
  const requests = new Set();
  const PREFETCH = 2;
  const SETTLE_MS = 650;

  const initialGroups = new WeakSet();

  const panel = document.createElement('div');
  panel.id = 'kokoro-controls-v4';
  Object.assign(panel.style, {
    position: 'fixed', bottom: '75px', right: '18px', zIndex: '2147483647',
    display: 'flex', gap: '5px', fontFamily: 'system-ui,sans-serif',
    background: '#211f2a', padding: '7px', borderRadius: '12px',
    boxShadow: '0 4px 20px #0009'
  });
  function button(label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    Object.assign(b.style, {background:'#45405d', color:'white', border:'0',
      borderRadius:'8px', cursor:'pointer', padding:'8px 10px', fontSize:'12px'});
    return b;
  }
  const toggle = button('🔊 ON');
  const test = button('Test voice');
  const stop = button('Stop');
  panel.append(toggle, test, stop);
  (document.body || document.documentElement).append(panel);

  function clearPlayback() {
    generation++;
    for (const req of requests) { try { req.abort(); } catch (_) {} }
    requests.clear();
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
    if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = null; }
    if (pipeline) for (const item of pipeline.items) {
      if (item.url) URL.revokeObjectURL(item.url);
    }
    pipeline = null;
  }

  function normalize(s) {
    return s.replace(/\s+/g,' ').replace(/[*_`#]/g,'').trim();
  }

  function paragraphs(prose) {
    let blocks = [...prose.children]
      .map(el => normalize(el.innerText || el.textContent || ''))
      .filter(Boolean);
    if (blocks.length < 2) {
      const fallback = (prose.innerText || prose.textContent || '')
        .split(/\n\s*\n/).map(normalize).filter(Boolean);
      if (fallback.length > blocks.length) blocks = fallback;
    }
    return blocks;
  }

  function startPipeline(group) {
    pipeline = {group, accepted: [], items: [], next: 0, stableText: '',
      stableSince: 0, finished: false, playing: false};
  }

  function addParagraph(p, text) {
    text = normalize(text);
    while (text.length > 2000) {
      let split = text.lastIndexOf(' ', 2000);
      if (split < 1000) split = 2000;
      p.items.push({text: text.slice(0, split), status: 'queued', url: null});
      text = text.slice(split).trim();
    }
    if (text.length > 1) p.items.push({text, status: 'queued', url: null});
  }

  function pump(p, run) {
    if (!enabled || p !== pipeline || run !== generation) return;
    let capacity = PREFETCH - p.items.filter(i => i.status === 'loading').length;
    for (const item of p.items) {
      if (capacity <= 0) break;
      if (item.status !== 'queued') continue;
      item.status = 'loading';
      capacity--;
      let req;
      req = GM_xmlhttpRequest({
        method: 'POST', url: ENDPOINT,
        headers: {'Content-Type': 'application/json'},
        data: JSON.stringify({text:item.text,voice:VOICE,speed:1.0}),
        responseType:'blob',timeout:60000,
        onload: res => {
          requests.delete(req);
          if (run !== generation || p !== pipeline) return;
          if (res.status === 200 && res.response) {
            const blob = res.response instanceof Blob ? res.response :
              new Blob([res.response], {type:'audio/wav'});
            item.url = URL.createObjectURL(blob);
            item.status = 'ready';
            log('Audio ready for block', p.items.indexOf(item)+1);
          } else {
            item.status = 'failed';
            console.error(PREFIX,'Kokoro returned HTTP',res.status);
          }
          pump(p,run); playReady(p,run);
        },
        onerror: err => { requests.delete(req); if(run!==generation)return;
          console.error(PREFIX,'Synthesis failed',err);
          item.status='failed';pump(p,run);playReady(p,run); },
        ontimeout: () => { requests.delete(req); if(run!==generation)return;
          console.error(PREFIX,'Synthesis timeout');
          item.status='failed';pump(p,run);playReady(p,run); }
      });
      requests.add(req);
      log('Generating block',p.items.indexOf(item)+1);
    }
  }

  function playReady(p,run) {
    if (!enabled || p !== pipeline || run !== generation || p.playing) return;
    while (p.items[p.next] && p.items[p.next].status === 'failed') p.next++;
    const item = p.items[p.next];
    if (!item || item.status !== 'ready') return;
    p.next++;
    p.playing = true;
    objectURL = item.url; item.url = null;
    audio = new Audio(objectURL);
    const player = audio;
    const done = () => {
      if (run !== generation || p !== pipeline || audio !== player) return;
      audio = null;
      if (objectURL) URL.revokeObjectURL(objectURL);
      objectURL = null;
      item.status='played';p.playing=false;
      playReady(p,run);
    };
    player.onended=done;
    player.onerror=()=>{console.error(PREFIX,'Audio playback error');done();};
    log('Playing block',p.next);
    player.play().catch(err=>{console.error(PREFIX,'Playback blocked',err);done();});
  }

  function enqueue(text) {
    clearPlayback();
    activeGroup = {test:true};
    startPipeline(activeGroup);
    addParagraph(pipeline,text);
    pump(pipeline,generation);
  }

  function isCharacter(message) {
    // Grounded in actual Character.AI page: AI messages are left aligned and
    // have bg-surface-elevation-2; user messages use elevation-3 / items-end.
    const parent = message.parentElement;
    if (!parent) return false;
    if (parent.classList.contains('items-end')) return false;
    if (parent.classList.contains('items-start')) return true;
    return message.classList.contains('bg-surface-elevation-2') &&
      !message.classList.contains('bg-surface-elevation-3');
  }

  function newestCharacterMessage(root) {
    // Chat uses flex-col-reverse: the first immediate .group contains newest reply.
    const groups = [...root.children].filter(el => el.matches('div.group'));
    for (const group of groups.slice(0, 3)) {
      const msg = group.querySelector('[data-testid="streaming-message"], [data-testid="completed-message"]');
      if (msg && isCharacter(msg) && msg.querySelector('.prose')) return {group,msg};
    }
    return null;
  }

  function processText(group, message) {
    const p = pipeline;
    if (!p || p.group !== group || p.finished) return;
    const prose = message.querySelector('.prose');
    if (!prose) return;
    const blocks = paragraphs(prose);
    const complete = message.getAttribute('data-testid') === 'completed-message';
    const full = blocks.join('\n\n');
    if (complete) {
      if (p.stableText !== full) {p.stableText=full;p.stableSince=Date.now();}
    } else {p.stableText='';p.stableSince=0;}
    const settled = complete && Date.now()-p.stableSince >= SETTLE_MS;
    // A newly started paragraph confirms the preceding paragraph is complete.
    const safe = settled ? blocks.length : Math.max(0,blocks.length-1);
    for (let i=0;i<Math.min(safe,p.accepted.length);i++) {
      if (blocks[i] !== p.accepted[i]) {
        log('Previously finalized paragraph changed; resetting');
        clearPlayback();startPipeline(group);return;
      }
    }
    while (p.accepted.length < safe) {
      const text = blocks[p.accepted.length];
      p.accepted.push(text);
      addParagraph(p,text);
    }
    if(settled) p.finished=true;
    pump(p,generation);playReady(p,generation);
  }

  function scan() {
    if(location.href !== lastURL) {
      lastURL=location.href;clearPlayback();initialized=false;activeGroup=null;
    }
    const root=document.getElementById('chat-messages');
    if(!root||!enabled)return;
    const newest=newestCharacterMessage(root);
    if(!initialized) {
      for(const g of root.children)initialGroups.add(g);
      initialized=true;
      log('Watching chat. Existing messages ignored.');
      return;
    }
    if(!newest)return;
    const {group,msg}=newest;
    if(group!==activeGroup) {
      if(initialGroups.has(group))return;
      const first=[...root.children].find(el=>el.matches('div.group'));
      if(group!==first)return;
      clearPlayback();activeGroup=group;startPipeline(group);
      log('New reply detected. Paragraph pipeline ready.');
    }
    processText(group,msg);
  }

  toggle.onclick=()=>{
    enabled=!enabled;
    toggle.textContent=enabled?'🔊 ON':'🔇 OFF';
    clearPlayback();
    if(enabled){initialized=false;activeGroup=null;scan();}
    log('Enabled:',enabled);
  };
  test.onclick=()=>{
    enabled=true;toggle.textContent='🔊 ON';
    enqueue('Hello! Your local Kokoro paragraph pipeline is working.');
  };
  stop.onclick=()=>clearPlayback();

  setInterval(scan, 180);
  scan();
  log('v0.4 loaded. Paragraphs are synthesized early and played in order.');
})();
