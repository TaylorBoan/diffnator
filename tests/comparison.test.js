const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const puppeteer = require('puppeteer');
const { decodeOrigin, rewriteHtml } = require('../local-relay');

test('local relay rejects external origins and preserves scoped asset paths', () => {
  const token = value => Buffer.from(value).toString('base64url');
  assert.equal(decodeOrigin(token('http://127.0.0.1:4323')), 'http://127.0.0.1:4323');
  for (const origin of ['https://example.com', 'file:///etc', 'http://user@localhost', 'http://localhost/path']) {
    assert.throws(() => decodeOrigin(token(origin)));
  }
  const html = rewriteHtml('<head><base href="/old/"><link href="/styles.css"></head><img src="//cdn.test/img">', '/local/token', '/nested/page');
  assert.match(html, /base href="\/local\/token\/nested\/"/);
  assert.match(html, /href="\/local\/token\/styles.css"/);
  assert.match(html, /src="\/\/cdn.test\/img"/);
});

test('live panes fill and resize without reloading; fixed width, scroll sync and swipe work', { timeout: 45000 }, async t => {
  const fixtures = [];
  for (const color of ['red', 'blue']) {
    const server = http.createServer((req, res) => {
      if (req.url === '/icon.svg') {
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${color}"/></svg>`);
      }
      res.setHeader('Content-Type', 'text/html');
      res.end(`<html><head><style>body{margin:0;height:1800px}.panel{height:240px;overflow:auto}.content{height:1200px}</style></head><body><div class="panel"><div class="content"><button onclick="this.textContent='Clicked'">${color}</button></div></div><script>localStorage.setItem('fixture-color','${color}');const image=new Image();image.src='/icon.svg';document.body.append(image);fetch(new Request(location.origin+'/icon.svg')).then(r=>r.text()).then(text=>document.body.dataset.fetched=text.includes('fill=\"${color}\"')?'ok':'wrong');</script></body></html>`);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    fixtures.push(server);
    t.after(() => new Promise(resolve => server.close(resolve)));
  }
  const reserve = net.createServer().listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => { child.stdout.on('data', chunk => { if (String(chunk).includes('DiffNator running')) resolve(); }); child.once('error', reject); child.once('exit', code => reject(new Error(`Server exited ${code}`))); });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 800 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const params = new URLSearchParams({ u1: `http://127.0.0.1:${fixtures[0].address().port}/`, u2: `http://127.0.0.1:${fixtures[1].address().port}/`, w: '650', ra: 'iframe', rb: 'iframe', mode: 'sbs', branchA: 'codex/avif-media-workflow', branchB: 'GBranch' });
  await page.goto(`http://127.0.0.1:${port}/?${params}`);
  await page.waitForFunction(() => [...document.querySelectorAll('#sbsIframe1,#sbsIframe2')].every(f => f.contentDocument?.querySelector('img')?.naturalWidth === 8 && f.contentDocument.body.dataset.fetched === 'ok'));
  assert.deepEqual(await page.$$eval('.branch-label', labels => labels.map(e => ({text: e.textContent, hidden: e.hidden, pointerEvents: getComputedStyle(e).pointerEvents}))), [
    { text: 'codex/avif-media-workflow', hidden: false, pointerEvents: 'none' },
    { text: 'GBranch', hidden: false, pointerEvents: 'none' },
  ]);
  let frames = page.frames().filter(f => f.url().includes('/local/'));
  assert.equal(frames.length, 2);
  assert.deepEqual(await Promise.all(frames.map(f => f.evaluate(() => localStorage.getItem('fixture-color')))), ['red', 'blue']);
  const pixels = await Promise.all(frames.map(f => f.evaluate(() => {
    const image = document.querySelector('img');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  })));
  assert.deepEqual(pixels, [[255, 0, 0, 255], [0, 0, 255, 255]]);
  const assertFit = async (width, height) => {
    await page.setViewport({ width, height });
    await page.waitForFunction(() => [...document.querySelectorAll('#sbsIframe1,#sbsIframe2')].every(f => {
      const r = f.getBoundingClientRect();
      return Math.abs(r.width - innerWidth / 2) < 1 && r.height === innerHeight && f.contentWindow.innerWidth === Math.round(r.width);
    }));
    assert.deepEqual(await page.$$eval('.sbs-col', cols => cols.map(c => ({ x: c.offsetLeft, width: c.clientWidth, height: c.clientHeight, overflow: c.scrollWidth > c.clientWidth || c.scrollHeight > c.clientHeight }))), [
      { x: 0, width: width / 2, height, overflow: false },
      { x: width / 2, width: width / 2, height, overflow: false },
    ]);
  };
  await frames[0].click('button');
  await assertFit(1400, 800);
  await assertFit(2400, 1100);
  await assertFit(900, 650);
  await assertFit(1400, 800);
  assert.equal(await frames[0].$eval('button', e => e.textContent), 'Clicked');
  // Fixed width is explicit and survives a shared link/reload.
  await page.select('#sbsSizing', 'fixed');
  assert.deepEqual(await Promise.all(frames.map(f => f.evaluate(() => innerWidth))), [650, 650]);
  assert.equal(new URL(page.url()).searchParams.get('sizing'), 'fixed');
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('#sbsIframe1,#sbsIframe2')].every(f => f.contentDocument?.querySelector('img')?.naturalWidth === 8));
  assert.equal(await page.$eval('#sbsSizing', e => e.value), 'fixed');
  assert.equal(await page.$eval('#branchLabelB', e => e.textContent), 'GBranch');
  await page.select('#sbsSizing', 'fit');
  await assertFit(1400, 800);
  frames = page.frames().filter(f => f.url().includes('/local/'));
  const positions = () => Promise.all(frames.map(f => f.$eval('.panel', e => e.scrollTop)));
  await frames[0].hover('.panel'); await page.mouse.wheel({ deltaY: 160 });
  await page.waitForFunction(() => document.querySelector('#sbsIframe2').contentDocument.querySelector('.panel').scrollTop === 160);
  assert.deepEqual(await positions(), [160, 160]);
  await frames[1].hover('.panel'); await page.mouse.wheel({ deltaY: -70 });
  await page.waitForFunction(() => document.querySelector('#sbsIframe1').contentDocument.querySelector('.panel').scrollTop === 90);
  assert.deepEqual(await positions(), [90, 90]);
  // A shorter peer must not bounce the source back when it reaches its limit.
  await frames[1].$eval('.content', e => e.style.height = '300px');
  await frames[0].$eval('.panel', e => e.scrollTop = 400);
  await page.waitForFunction(() => document.querySelector('#sbsIframe2').contentDocument.querySelector('.panel').scrollTop === 60);
  assert.deepEqual(await positions(), [400, 60]);
  await frames[0].evaluate(() => scrollTo(0, 300));
  await page.waitForFunction(() => document.querySelector('#sbsIframe2').contentWindow.scrollY === 300);
  await frames[1].evaluate(() => scrollTo(0, 180));
  await page.waitForFunction(() => document.querySelector('#sbsIframe1').contentWindow.scrollY === 180);
  // Repeated renders must not leave old document listeners behind.
  await page.click('#toggleDrawer');
  await page.click('#refreshBtn');
  await page.waitForFunction(() => [...document.querySelectorAll('#sbsIframe1,#sbsIframe2')].every(f => f.contentDocument?.querySelector('img')?.naturalWidth === 8 && f.contentDocument.body.dataset.fetched === 'ok'));
  await page.select('#compareMode', 'overlay');
  await page.select('#overlayMode', 'swipe');
  await page.waitForFunction(() => document.querySelector('#overlayView').classList.contains('mode-swipe') && document.querySelector('#iframe1').contentDocument?.querySelector('.panel'));
  await page.$eval('#closeDrawer', e => e.click());
  const handle = await page.$eval('#swipeHandle', e => ({ visible: getComputedStyle(e).display !== 'none', x: e.getBoundingClientRect().x + 2, y: e.getBoundingClientRect().y + e.clientHeight / 2 }));
  assert.equal(handle.visible, true);
  await page.mouse.move(handle.x, handle.y); await page.mouse.down(); await page.mouse.move(handle.x + 100, handle.y, { steps: 5 }); await page.mouse.up();
  assert.ok(Number(await page.$eval('#swipe', e => e.value)) > 50);
  assert.deepEqual(errors, []);
});


test('live highlights find text, style, layout and same-path image changes, clear on toggle, and follow navigation', { timeout: 45000 }, async t => {
  const sites = [];
  for (const side of ['a', 'b']) {
    const fixture = http.createServer((req, res) => {
      if (req.url === '/same-image.svg') {
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${side === 'a' ? 'red' : 'blue'}"/></svg>`);
      }
      const changed = req.url === '/changed' && side === 'b';
      res.setHeader('Content-Type', 'text/html');
      res.end(`<html><body style="margin:0;height:2400px"><span style="position:absolute;width:1px;height:1px;clip:rect(0,0,0,0)">${side} hidden accessibility copy</span><h1 id="heading">${changed ? 'Changed title' : 'Same title'}</h1><p id="color" style="color:${changed ? 'red' : 'black'}">Same paragraph</p><div id="layout" style="width:${changed ? '120' : '80'}px;height:20px;background:#abc"></div>${req.url === '/images' ? '<img id="image" src="/same-image.svg">' : ''}${changed ? '<p id="added">Added text</p>' : '<p id="removed">Removed text</p>'}<div style="margin-top:1200px"><p id="lower">${changed ? 'Changed lower text' : 'Same lower text'}</p></div><img loading="lazy" src="/never-loaded.png" style="margin-top:1000px"><a id="navigate" href="/same">Next page</a></body></html>`);
    }).listen(0, '127.0.0.1');
    await once(fixture, 'listening'); sites.push(fixture);
    t.after(() => new Promise(resolve => fixture.close(resolve)));
  }
  const reserve = net.createServer().listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => { child.stdout.on('data', data => { if (String(data).includes('DiffNator running')) resolve(); }); child.once('error', reject); });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] }); t.after(() => browser.close());
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 800 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const target = (i, path) => `http://127.0.0.1:${sites[i].address().port}${path}`;
  const go = async (path, enabled = '1') => {
    const params = new URLSearchParams({ u1: target(0, path), u2: target(1, path), mode: 'sbs', ra: 'iframe', rb: 'iframe', highlights: enabled });
    await page.goto(`http://127.0.0.1:${port}/?${params}`);
    await page.waitForFunction(() => document.querySelector('#highlightStatus').dataset.state === 'ready');
  };
  await go('/same');
  assert.equal(await page.$eval('#highlightStatus', e => e.dataset.count), '0');
  assert.equal(await page.$$eval('.diff-mark', els => els.length), 0);
  await go('/changed');
  assert.ok(Number(await page.$eval('#highlightStatus', e => e.dataset.count)) >= 5);
  for (const kind of ['content', 'style', 'layout', 'added', 'removed']) {
    assert.ok(await page.$$eval(`.diff-mark[data-kind~="${kind}"]`, els => els.length), kind);
  }
  const first = page.frames().find(f => f.url().includes('/local/') && f.url().endsWith('/changed'));
  // Marks cannot intercept clicks; the point on a highlighted heading still hits the iframe.
  assert.equal(await page.$eval('.diff-layer', e => getComputedStyle(e).pointerEvents), 'none');
  const stamp = await first.evaluate(() => window.testStamp = Math.random());
  await page.click('#highlightToggle');
  assert.equal(await page.$$eval('.diff-mark', els => els.length), 0);
  assert.equal(new URL(page.url()).searchParams.get('highlights'), '0');
  assert.equal(await first.evaluate(() => window.testStamp), stamp);
  await page.click('#highlightToggle');
  await page.waitForFunction(() => document.querySelectorAll('.diff-mark').length > 0);
  await first.evaluate(() => scrollTo(0, 1250));
  await page.waitForFunction(() => document.querySelector('#sbsIframe2').contentWindow.scrollY === 1250);
  await page.waitForFunction(() => [...document.querySelectorAll('#diffLayerA .diff-mark')].some(e => parseFloat(e.style.top) < 800));
  await page.setViewport({ width: 1800, height: 900 });
  await page.waitForFunction(() => document.querySelector('#sbsIframe1').contentWindow.innerWidth === 900 && document.querySelectorAll('.diff-mark').length > 0);
  // Matching pages stay clean despite their different ports and origin-scoped relay paths.
  await go('/images');
  assert.equal(await page.$$eval('.diff-mark[data-kind~="image"]', els => els.length), 2);
  // In-frame navigation rebinds comparison/scroll handlers and removes stale marks.
  const frames = page.frames().filter(f => f.url().includes('/local/'));
  await Promise.all(frames.map(f => f.goto(f.url().replace('/images', '/same'))));
  await page.waitForFunction(() => document.querySelector('#highlightStatus').dataset.count === '0');
  // Dynamic text edits are detected without a page reload.
  await frames[1].$eval('#heading', e => e.textContent = 'Edited in place');
  await page.waitForFunction(() => Number(document.querySelector('#highlightStatus').dataset.count) > 0);
  // Inaccessible comparisons report unavailable; they must never claim zero differences.
  await page.$eval('#sbsIframe2', f => f.src = 'data:text/html,<h1>Inaccessible</h1>');
  await page.waitForFunction(() => document.querySelector('#highlightStatus').dataset.state === 'unavailable');
  assert.equal(await page.$eval('#highlightStatus', e => e.hasAttribute('data-count')), false);
  assert.deepEqual(errors, []);
});
