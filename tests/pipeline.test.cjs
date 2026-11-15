// Smoke tests for the userscript in a minimal simulated Character.AI DOM.
// No real Character.AI requests or Kokoro synthesis occur.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
  let interval, now = 0;
  const requests = [];
  const players = [];
  const controls = [];
  const root = { children: [] };
  const logs = [];
  const document = {
    body: { append: el => controls.push(el) },
    documentElement: {},
    createElement: () => ({
      style: {}, append(...children) { this.children = children; },
      removeAttribute() {}, load() {}, pause() {},
    }),
    getElementById: id => id === 'chat-messages' ? root : null,
  };
  class Audio {
    constructor(src) { this.src = src; players.push(this); }
    play() { this.started = true; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  }
  const ctx = {
    window: {}, document, location: { href: 'https://character.ai/chat/test' },
    GM_xmlhttpRequest: opts => {
      const request = {opts, aborted:false, abort(){this.aborted=true;}};
      requests.push(request);
      return request;
    },
    setInterval: fn => { interval = fn; },
    Date: { now: () => now },
    Audio, Blob, console: {
      log: (...x) => logs.push(x),
      error: (...x) => logs.push(x),
    },
    URL: {
      createObjectURL: () => 'blob:audio-' + Math.random(),
      revokeObjectURL: () => {},
    },
  };
  vm.runInNewContext(fs.readFileSync('character-ai-kokoro.user.js','utf8'),ctx);
  function message(texts, complete=false) {
    const prose = {
      children: texts.map(text => ({innerText:text})),
      innerText: texts.join('\n\n'),
    };
    return {
      parentElement:{classList:{contains: x=>x==='items-start'}},
      classList:{contains:()=>false},
      getAttribute: () => complete ? 'completed-message' : 'streaming-message',
      querySelector: selector => selector === '.prose' ? prose : null,
    };
  }
  function group(msg) {
    return {
      matches: selector => selector === 'div.group',
      querySelector: () => msg,
    };
  }
  function tick(ms=200) { now+=ms;interval(); }
  function finish(request,code=200) {
    request.opts.onload({
      status:code,
      response:new Blob(['wav'],{type:'audio/wav'}),
    });
  }
  return {root,requests,players,controls,logs,message,group,tick,finish};
}

test('starts first finished paragraph before the reply completes, and plays in order', () => {
  const x=setup();
  const msg=x.message(['First paragraph.','Second paragraph in progress'],false);
  x.root.children.unshift(x.group(msg));
  x.tick();
  assert.equal(x.requests.length,1);
  assert.equal(JSON.parse(x.requests[0].opts.data).text,'First paragraph.');
  x.finish(x.requests[0]);
  assert.equal(x.players.length,1);
  assert.equal(x.players[0].started,true);
  // Character.AI marks the final message completed. Wait for stable 650ms.
  msg.getAttribute=()=> 'completed-message';
  x.tick(200);
  x.tick(700);
  assert.equal(x.requests.length,2);
  assert.equal(JSON.parse(x.requests[1].opts.data).text,'Second paragraph in progress');
  x.finish(x.requests[1]);
  assert.equal(x.players.length,1,'second audio waits for first playback');
  x.players[0].onended();
  assert.equal(x.players.length,2);
  assert.equal(x.players[1].started,true);
});

test('never synthesizes a partial single paragraph', () => {
  const x=setup();
  const msg=x.message(['Still typing'],false);
  x.root.children.unshift(x.group(msg));
  x.tick();
  x.tick(1000);
  assert.equal(x.requests.length,0);
  msg.getAttribute=()=> 'completed-message';
  x.tick();
  x.tick(700);
  assert.equal(x.requests.length,1);
});

test('new character reply interrupts queued and playing audio', () => {
  const x=setup();
  const first=x.message(['First done.','Second typing'],false);
  x.root.children.unshift(x.group(first));x.tick();
  x.finish(x.requests[0]);
  assert.equal(x.players.length,1);
  const second=x.message(['New character message.','Typing more'],false);
  x.root.children.unshift(x.group(second));
  x.tick();
  assert.equal(x.players[0].paused,true);
  assert.equal(x.requests.length,2);
  assert.equal(JSON.parse(x.requests[1].opts.data).text,'New character message.');
});

test('test voice produces an HTTP request independently of the chat', () => {
  const x=setup();
  const panel=x.controls[0];
  const testVoice=panel.children[1];
  testVoice.onclick();
  assert.equal(x.requests.length,1);
  assert.match(JSON.parse(x.requests[0].opts.data).text,/paragraph pipeline/);
});

test('streams sentences within a single paragraph before completion', () => {
  const x=setup();
  const msg=x.message(['The first sentence is ready. The next one is typing'],false);
  x.root.children.unshift(x.group(msg));x.tick();
  assert.equal(x.requests.length,1);
  assert.equal(JSON.parse(x.requests[0].opts.data).text,'The first sentence is ready.');
  x.finish(x.requests[0]);
  assert.equal(x.players[0].started,true);
  msg.getAttribute=()=> 'completed-message';
  x.tick(200);x.tick(700);
  assert.equal(x.requests.length,2);
  assert.equal(JSON.parse(x.requests[1].opts.data).text,'The next one is typing');
  x.finish(x.requests[1]);
  assert.equal(x.players.length,1);
  x.players[0].onended();
  assert.equal(x.players.length,2);
});

test('does not synthesize unfinished trailing sentence while streaming', () => {
  const x=setup();
  const msg=x.message(['Hello there! This part is incompl'],false);
  x.root.children.unshift(x.group(msg));x.tick();
  assert.equal(x.requests.length,1);
  assert.equal(JSON.parse(x.requests[0].opts.data).text,'Hello there!');
  x.tick(1000);
  assert.equal(x.requests.length,1);
});


test('audiobook reads narration and quoted dialogue in order with the same voice', () => {
  const x = setup();
  const msg = x.message(['*Kafka takes a breath.* "Please stay." *She whispers softly.*'], true);
  x.root.children.unshift(x.group(msg));
  x.tick(); x.tick(700);
  assert.equal(x.requests.length, 3);
  const actual = x.requests.map(r => JSON.parse(r.opts.data));
  assert.deepEqual(actual.map(r => r.text), [
    'Kafka takes a breath.', 'Please stay.', 'She whispers softly.'
  ]);
  assert.deepEqual(actual.map(r => r.voice), ['af_heart', 'af_heart', 'af_heart']);
  assert.equal(actual[1].speed, 0.86, 'trailing whispered cue affects prior quote');
  assert.equal(actual[0].speed, 1.0, 'narration remains neutral');
});

test('holds quoted dialogue until the following stage direction arrives', () => {
  const x = setup();
  let line = '*She looks away.* "Stay here."';
  const msg = x.message([line], false);
  x.root.children.unshift(x.group(msg)); x.tick();
  assert.equal(x.requests.length, 1);
  assert.equal(JSON.parse(x.requests[0].opts.data).text, 'She looks away.');
  const prose = msg.querySelector('.prose');
  prose.children[0].innerText = line + ' *She whispers, trembling.*';
  prose.innerText = prose.children[0].innerText;
  x.tick();
  assert.equal(x.requests.length, 3);
  const spoken = x.requests.map(r => JSON.parse(r.opts.data));
  assert.equal(spoken[1].text, 'Stay here.');
  assert.equal(spoken[1].speed, 0.86);
});

test('persists expressive dialogue pacing across narration segments', () => {
  const x = setup();
  const msg = x.message(['*Her breathing becomes jagged.* "I need help." *She turns away.* "Please stay."'], true);
  x.root.children.unshift(x.group(msg)); x.tick(); x.tick(700);
  const spoken = x.requests.map(r => JSON.parse(r.opts.data));
  assert.deepEqual(spoken.filter(r => r.text.includes('help') || r.text.includes('stay')).map(r => r.speed), [0.9, 0.9]);
});

test('RP sounds are normalized only in TTS requests', () => {
  const x = setup();
  const msg = x.message(['*She groans.* "Mhm... Mmff."'], true);
  x.root.children.unshift(x.group(msg)); x.tick(); x.tick(700);
  assert.equal(JSON.parse(x.requests[1].opts.data).text, 'mm-hmm... mmm.');
  assert.equal(msg.querySelector('.prose').innerText, '*She groans.* "Mhm... Mmff."');
});
