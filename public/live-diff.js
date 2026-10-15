/* Live DOM comparison. All marks stay in DiffNator, outside the preview pages. */
(function (global) {
  const STYLE_KEYS = ['color', 'backgroundColor', 'backgroundImage', 'fontFamily', 'fontSize',
    'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textAlign', 'textTransform',
    'textDecorationLine', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
    'borderLeftWidth', 'borderTopColor', 'borderRightColor', 'borderBottomColor',
    'borderLeftColor', 'borderRadius', 'boxShadow', 'opacity', 'objectFit', 'fill', 'stroke'];
  const SKIP = /^(SCRIPT|STYLE|LINK|META|BASE|NOSCRIPT|TEMPLATE|HEAD|HTML|BODY)$/;
  const MEDIA = /^(IMG|SVG|VIDEO|CANVAS|INPUT|TEXTAREA|SELECT|BUTTON|IFRAME)$/;
  function normalize(value) {
    return String(value || '').replace(/\/local\/[A-Za-z0-9_-]+(?=\/)/g, '')
      .replace(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/g, 'http://local');
  }
  function pathFor(element) {
    const parts = [];
    while (element && element.tagName !== 'BODY') {
      if (element.id) { parts.unshift('#' + CSS.escape(element.id)); break; }
      const peers = [...element.parentElement.children].filter(e => e.tagName === element.tagName);
      parts.unshift(element.tagName + ':' + (peers.indexOf(element) + 1));
      element = element.parentElement;
    }
    return parts.join('/');
  }
  function pixels(element, doc) {
    const canvas = doc.createElement('canvas'); canvas.width = canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(element, 0, 0, 24, 24);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    let hash = 2166136261;
    for (const byte of data) hash = Math.imul(hash ^ byte, 16777619);
    return hash >>> 0;
  }
  function snapshot(frame) {
    const doc = frame.contentDocument;
    if (!doc?.body || doc.readyState !== 'complete') throw new Error('Waiting for both previews to load');
    const win = doc.defaultView;
    const entries = new Map();
    let pending = 0, unreadable = 0;
    for (const e of doc.body.querySelectorAll('*')) {
      if (SKIP.test(e.tagName) || e.closest('astro-dev-toolbar, [data-diffnator-ignore]')) continue;
      const style = win.getComputedStyle(e), rect = e.getBoundingClientRect();
      if (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)') continue;
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0 || !rect.width || !rect.height) continue;
      const text = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      const decorative = style.backgroundImage !== 'none' || (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') || parseFloat(style.borderTopWidth) > 0;
      if (!text && !MEDIA.test(e.tagName) && !decorative) continue;
      // SVG's children are represented by the normalized SVG markup, not separate boxes.
      if (e.ownerSVGElement) continue;
      let media = '', imagePixels = null;
      if (e.tagName === 'IMG') {
        media = normalize(new URL(e.currentSrc || e.src, doc.baseURI).href);
        if (!e.complete) {
          if (rect.bottom > 0 && rect.top < win.innerHeight && rect.right > 0 && rect.left < win.innerWidth) pending++;
        } else if (!e.naturalWidth) unreadable++;
        else { try { imagePixels = pixels(e, doc); } catch (_) { unreadable++; } }
      } else if (e.tagName === 'SVG') media = normalize(e.outerHTML);
      else if (e.tagName === 'CANVAS' || e.tagName === 'VIDEO' || e.tagName === 'IFRAME') unreadable++;
      if (style.backgroundImage !== 'none') unreadable++;
      const content = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName)
        ? JSON.stringify([e.type, e.value, e.checked, e.placeholder, e.disabled]) : text;
      const geometry = [rect.x, rect.y, rect.width, rect.height];
      entries.set(pathFor(e), { element: e, content, media, imagePixels, geometry,
        style: STYLE_KEYS.map(k => normalize(style[k])).join('|'),
        link: e.tagName === 'A' ? normalize(new URL(e.href, doc.baseURI).href) : '' });
    }
    return { entries, pending, unreadable, win };
  }
  function compare(a, b) {
    const differences = [];
    for (const key of new Set([...a.entries.keys(), ...b.entries.keys()])) {
      const left = a.entries.get(key), right = b.entries.get(key), kinds = [];
      if (!left || !right) kinds.push(left ? 'removed' : 'added');
      else {
        if (left.element.tagName !== right.element.tagName || left.content !== right.content || left.link !== right.link) kinds.push('content');
        if (left.style !== right.style) kinds.push('style');
        if (left.media !== right.media || (left.imagePixels !== null && right.imagePixels !== null && left.imagePixels !== right.imagePixels)) kinds.push('image');
        if (left.geometry.some((v, i) => Math.abs(v - right.geometry[i]) > 2)) kinds.push('layout');
      }
      if (kinds.length) differences.push({ left, right, kinds });
    }
    return differences;
  }
  function connect({ frames, layers, button, status, onToggle, enabled = false }) {
    let active = enabled, disposed = false, timer = null, interval = null;
    const bindings = new Map();
    function clear() { layers.forEach(layer => layer.replaceChildren()); }
    function setStatus(message) { if (status.textContent !== message) status.textContent = message; }
    function bind(frame) {
      bindings.get(frame)?.();
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        const scroll = () => { clear(); schedule(); };
        const change = () => schedule();
        doc.addEventListener('scroll', scroll, true);
        doc.addEventListener('input', change, true);
        doc.addEventListener('change', change, true);
        doc.addEventListener('load', change, true);
        bindings.set(frame, () => {
          doc.removeEventListener('scroll', scroll, true);
          doc.removeEventListener('input', change, true);
          doc.removeEventListener('change', change, true);
          doc.removeEventListener('load', change, true);
        });
      } catch (_) { /* update reports inaccessible frames explicitly */ }
    }
    function mark(entry, layer, kind) {
      if (!entry) return;
      const r = entry.element.getBoundingClientRect(), frame = frames[layers.indexOf(layer)];
      // Clip marks to the actual visible area, including nested scrolling panels.
      let x = Math.max(0, r.left), y = Math.max(0, r.top);
      let right = Math.min(frame.clientWidth, r.right), bottom = Math.min(frame.clientHeight, r.bottom);
      for (let p = entry.element.parentElement; p; p = p.parentElement) {
        const s = p.ownerDocument.defaultView.getComputedStyle(p), pr = p.getBoundingClientRect();
        if (/hidden|auto|scroll|clip/.test(s.overflowX)) { x = Math.max(x, pr.left); right = Math.min(right, pr.right); }
        if (/hidden|auto|scroll|clip/.test(s.overflowY)) { y = Math.max(y, pr.top); bottom = Math.min(bottom, pr.bottom); }
      }
      if (right <= x || bottom <= y) return;
      const box = document.createElement('div'); box.className = 'diff-mark'; box.dataset.kind = kind;
      box.style.cssText = `left:${x}px;top:${y}px;width:${right - x}px;height:${bottom - y}px`;
      layer.append(box);
    }
    function update() {
      timer = null;
      if (!active || disposed) return;
      try {
        if (frames.some(f => f.style.display === 'none')) throw new Error('Highlights need two live local previews');
        const a = snapshot(frames[0]), b = snapshot(frames[1]);
        if (Math.abs(a.win.innerWidth - b.win.innerWidth) > 1 || a.win.innerHeight !== b.win.innerHeight) throw new Error('Match preview sizes to compare');
        if (a.pending || b.pending || a.win.document.fonts.status !== 'loaded' || b.win.document.fonts.status !== 'loaded') throw new Error('Waiting for images and fonts');
        const diffs = compare(a, b);
        clear();
        diffs.forEach(d => { mark(d.left, layers[0], d.kinds.join(' ')); mark(d.right, layers[1], d.kinds.join(' ')); });
        const count = diffs.length;
        const message = count ? `${count} changed element${count === 1 ? '' : 's'}` : 'No element differences';
        setStatus(message + ((a.unreadable + b.unreadable) ? ' · some image pixels unchecked' : ''));
        status.dataset.count = String(count); status.dataset.state = 'ready';
      } catch (error) {
        clear(); delete status.dataset.count; status.dataset.state = 'unavailable';
        setStatus(error.message === 'Waiting for both previews to load' ? error.message :
          (error.name === 'SecurityError' ? 'Highlights need accessible local previews' : error.message));
      }
    }
    function schedule() {
      if (!active || disposed) return;
      clearTimeout(timer); timer = setTimeout(update, 120);
    }
    function resize() { clear(); schedule(); }
    function toggle() {
      active = !active; button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? 'Highlights: on' : 'Highlights: off';
      status.hidden = !active; clear(); delete status.dataset.count;
      clearInterval(interval); clearTimeout(timer);
      if (active) { setStatus('Comparing…'); schedule(); interval = setInterval(update, 800); }
      onToggle(active);
    }
    const loads = frames.map(frame => {
      const load = () => { clear(); bind(frame); schedule(); };
      frame.addEventListener('load', load); bind(frame);
      return () => frame.removeEventListener('load', load);
    });
    button.addEventListener('click', toggle); window.addEventListener('resize', resize);
    // Initialize without persisting a synthetic toggle.
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? 'Highlights: on' : 'Highlights: off'; status.hidden = !active;
    if (active) { schedule(); interval = setInterval(update, 800); }
    return () => {
      disposed = true; clearTimeout(timer); clearInterval(interval); clear();
      loads.forEach(fn => fn()); bindings.forEach(fn => fn());
      button.removeEventListener('click', toggle); window.removeEventListener('resize', resize);
    };
  }
  global.DiffNatorDiff = { connect };
})(window);
