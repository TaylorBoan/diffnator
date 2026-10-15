/* Pair real scroll containers, including nested application panels. */
(function (global) {
  function documentOf(frame) {
    try { return frame.contentWindow.document; } catch (_) { return null; }
  }
  function selectorFor(element, doc) {
    if (element === doc.scrollingElement) return null;
    if (element.id) return '#' + CSS.escape(element.id);
    const parts = [];
    while (element && element !== doc.documentElement) {
      const siblings = [...element.parentElement.children].filter(e => e.tagName === element.tagName);
      parts.unshift(element.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(element) + 1) + ')');
      element = element.parentElement;
    }
    return parts.join(' > ');
  }
  function connect(frames) {
    const cleanups = [];
    const documents = new Map();
    let disposed = false;
    function bind(source) {
      const doc = documentOf(source);
      if (!doc || disposed) return;
      const onScroll = event => {
        const element = event.target === doc ? doc.scrollingElement : event.target;
        if (!element || !('scrollTop' in element)) return;
        const previous = mirrored.get(element);
        if (previous && previous.x === element.scrollLeft && previous.y === element.scrollTop) {
          mirrored.delete(element);
          return;
        }
        const selector = selectorFor(element, doc);
        for (const other of frames) {
          if (other === source) continue;
          const otherDoc = documentOf(other);
          if (!otherDoc) continue;
          const target = selector ? otherDoc.querySelector(selector) : otherDoc.scrollingElement;
          if (!target) continue;
          // Suppress mirrored events even when the other page has a shorter panel.
          target.scrollLeft = element.scrollLeft;
          target.scrollTop = element.scrollTop;
          mirrored.set(target, { x: target.scrollLeft, y: target.scrollTop });
        }
      };
      doc.addEventListener('scroll', onScroll, true);
      documents.set(source, () => doc.removeEventListener('scroll', onScroll, true));
    }
    const mirrored = new WeakMap();
    frames.forEach(frame => {
      const load = () => {
        documents.get(frame)?.();
        bind(frame);
      };
      frame.addEventListener('load', load);
      cleanups.push(() => frame.removeEventListener('load', load));
      if (documentOf(frame)?.readyState === 'complete') bind(frame);
    });
    return () => {
      disposed = true;
      cleanups.splice(0).forEach(fn => fn());
      documents.forEach(fn => fn());
      documents.clear();
    };
  }
  function scrollBy(frame, dy) {
    const doc = documentOf(frame);
    if (!doc) return false;
    const candidates = [...doc.querySelectorAll('*')].filter(e =>
      /auto|scroll/.test(doc.defaultView.getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1);
    candidates.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    const target = candidates[0] || doc.scrollingElement;
    target.scrollTop += dy;
    return true;
  }
  global.DiffNatorScroll = { connect, scrollBy };
})(window);
