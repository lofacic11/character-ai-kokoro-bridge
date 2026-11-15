// ==UserScript==
// @name         Character.AI -> Local Kokoro (Complete Replies)
// @namespace    local.kokoro.characterai
// @version      0.3.0
// @description  Reads each complete Character.AI reply aloud once through local Kokoro TTS.
// @match        https://character.ai/*
// @match        https://*.character.ai/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  if (window.__caiKokoroV3) return;
  window.__caiKokoroV3 = true;

  const ENDPOINT = 'http://127.0.0.1:8880/speak';
  const VOICE = 'af_heart';
  const PREFIX = '[c.ai Kokoro]';
  const log = (...args) => console.log(PREFIX, ...args);
  let enabled = true;
  let initialized = false;
  let activeGroup = null;
  let currentText = '';
  let completedText = '';
  let completedSince = 0;
  let spokenGroup = null;
  let generation = 0;
  let busy = false;
  let request = null;
  let audio = null;
  let objectURL = null;
  let queue = [];
  let lastURL = location.href;
  const initialGroups = new WeakSet();

  const panel = document.createElement('div');
  panel.id = 'kokoro-controls-v3';
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
    queue = [];
    if (request) { try { request.abort(); } catch (_) {} request = null; }
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
    if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = null; }
    busy = false;
  }

  function playNext() {
    if (!enabled || busy || !queue.length) return;
    const text = queue.shift();
    const myGeneration = generation;
    busy = true;
    log('Speaking:', text.slice(0, 90));
    request = GM_xmlhttpRequest({
      method: 'POST', url: ENDPOINT,
      headers: {'Content-Type': 'application/json'},
      data: JSON.stringify({text, voice: VOICE, speed: 1.0}),
      responseType: 'blob', timeout: 60000,
      onload: (response) => {
        request = null;
        if (myGeneration !== generation) return;
        if (response.status !== 200 || !response.response) {
          console.error(PREFIX, 'HTTP', response.status, response.responseText || '');
          busy = false; playNext(); return;
        }
        const blob = response.response instanceof Blob
          ? response.response : new Blob([response.response], {type:'audio/wav'});
        objectURL = URL.createObjectURL(blob);
        audio = new Audio(objectURL);
        const done = () => {
          if (myGeneration !== generation) return;
          if (objectURL) URL.revokeObjectURL(objectURL);
          objectURL = null; audio = null; busy = false; playNext();
        };
        audio.onended = done;
        audio.onerror = () => {console.error(PREFIX, 'Audio playback error'); done();};
        audio.play().catch(err => {console.error(PREFIX, 'Audio blocked:', err); done();});
      },
      onerror: err => {if (myGeneration !== generation) return;
        console.error(PREFIX, 'Kokoro request failed', err); request = null; busy = false; playNext();},
      ontimeout: () => {if (myGeneration !== generation) return;
        console.error(PREFIX, 'Kokoro timeout'); request = null; busy = false; playNext();}
    });
  }

  function enqueue(s) {
    s = s.replace(/\s+/g, ' ').replace(/[*_`#]/g,'').trim();
    if (s.length < 2) return;
    // One complete reply per synthesis request. Match server.py's 2000-char limit.
    if (s.length > 2000) {
      console.error(PREFIX, 'Complete reply exceeds the server 2000-character limit:', s.length,
        'Increase SpeechRequest.text max_length on the server if needed.');
      return;
    }
    queue.push(s);
    playNext();
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
    // The streaming-message element is still being updated by Character.AI.
    // Wait for its completed-message state, then for the text to settle.
    if (message.getAttribute('data-testid') !== 'completed-message') {
      completedText = '';
      completedSince = 0;
      return;
    }
    if (spokenGroup === group) return;
    const prose = message.querySelector('.prose');
    if (!prose) return;
    const text = (prose.innerText || prose.textContent || '').trim();
    if (!text) return;
    if (text !== completedText) {
      completedText = text;
      completedSince = Date.now();
      return;
    }
    if (Date.now() - completedSince < 650) return;
    spokenGroup = group;
    log('Complete character reply detected:', text.length, 'characters');
    enqueue(text);
  }

  function scan() {
    if (location.href !== lastURL) {
      lastURL = location.href;
      clearPlayback(); initialized = false; activeGroup = null;
      currentText = ''; completedText = ''; completedSince = 0; spokenGroup = null;
    }
    const root = document.getElementById('chat-messages');
    if (!root || !enabled) return;
    const newest = newestCharacterMessage(root);
    if (!initialized) {
      // Snapshot already-rendered history; never read history on page load.
      for (const g of root.children) initialGroups.add(g);
      initialized = true;
      log('Watching #chat-messages. Existing history ignored.');
      return;
    }
    if (!newest) return;
    const {group, msg} = newest;
    if (group !== activeGroup) {
      if (initialGroups.has(group)) return;
      // Only start a new reply if it belongs to the newest chat entry.
      const first = [...root.children].find(el => el.matches('div.group'));
      if (group !== first) return;
      clearPlayback(); activeGroup = group; currentText = ''; completedText = ''; completedSince = 0;
      log('New character reply detected');
    }
    processText(group, msg);
  }

  toggle.onclick = () => {
    enabled = !enabled;
    toggle.textContent = enabled ? '🔊 ON' : '🔇 OFF';
    if (!enabled) clearPlayback();
    else { initialized = false; activeGroup = null; currentText=''; completedText=''; completedSince=0; spokenGroup=null; scan(); }
    log('Enabled:', enabled);
  };
  test.onclick = () => {
    enabled = true; toggle.textContent = '🔊 ON';
    clearPlayback();
    enqueue('Hello! Your local Kokoro voice connection is working.');
  };
  stop.onclick = () => clearPlayback();
  setInterval(scan, 180);
  scan();
  log('v0.3 loaded. Each reply is spoken only after completion.');
})();
