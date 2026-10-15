// Keep dynamic root-relative resources inside this local page's origin scope.
(function () {
  const prefix = document.currentScript.dataset.prefix;
  // Relay pages share a browser origin; keep each site's draft state separate.
  function storageFor(storage) {
    const namespace = 'diffnator:' + prefix + ':';
    const keys = () => Object.keys(storage).filter(key => key.startsWith(namespace));
    const api = {
      getItem: key => storage.getItem(namespace + key),
      setItem: (key, value) => storage.setItem(namespace + key, value),
      removeItem: key => storage.removeItem(namespace + key),
      clear: () => keys().forEach(key => storage.removeItem(key)),
      key: index => keys()[index]?.slice(namespace.length) ?? null,
      get length() { return keys().length; },
    };
    return new Proxy(api, {
      get: (target, key) => key in target ? Reflect.get(target, key) : storage.getItem(namespace + key),
      set: (_target, key, value) => { storage.setItem(namespace + key, value); return true; },
      deleteProperty: (_target, key) => { storage.removeItem(namespace + key); return true; },
      ownKeys: () => keys().map(key => key.slice(namespace.length)),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const storage = storageFor(window[name]);
      Object.defineProperty(window, name, { configurable: true, get: () => storage });
    } catch (_) { /* Storage may be disabled by the browser. */ }
  }
  function scoped(value) {
    if (typeof value !== 'string') return value;
    if (/^https?:/.test(value)) {
      const url = new URL(value);
      if (url.origin === location.origin) value = url.pathname + url.search + url.hash;
    }
    if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith(prefix + '/')) return prefix + value;
    return value;
  }
  function html(value) {
    return String(value).replace(/\b(src|href|action|poster)=(['"])\/(?!\/|local\/)/gi, `$1=$2${prefix}/`);
  }
  function css(value) {
    return String(value).replace(/url\((['"]?)\/(?!\/|local\/)/gi, `url($1${prefix}/`);
  }
  function wrapSetter(proto, name, map) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (!descriptor?.set) return;
    Object.defineProperty(proto, name, { ...descriptor, set(value) { descriptor.set.call(this, map(value)); } });
  }
  for (const [proto, name] of [[HTMLImageElement.prototype, 'src'], [HTMLScriptElement.prototype, 'src'],
    [HTMLLinkElement.prototype, 'href'], [HTMLSourceElement.prototype, 'src'], [HTMLMediaElement.prototype, 'src']]) {
    wrapSetter(proto, name, scoped);
  }
  wrapSetter(Element.prototype, 'innerHTML', html);
  wrapSetter(Element.prototype, 'outerHTML', html);
  wrapSetter(CSSStyleDeclaration.prototype, 'backgroundImage', css);
  const insert = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (position, value) { return insert.call(this, position, html(value)); };
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (/^(src|href|action|poster)$/i.test(name)) value = scoped(value);
    if (name === 'style') value = css(value);
    return setAttribute.call(this, name, value);
  };
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) {
    return setProperty.call(this, name, css(value), priority);
  };
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (input instanceof Request) {
      const url = scoped(input.url);
      if (url !== input.url) input = new Request(url, input);
    } else if (input instanceof URL) input = scoped(input.href);
    else if (typeof input === 'string') input = scoped(input);
    return originalFetch.call(this, input, init);
  };
})();
