// Local iframe pages share DiffNator's origin so scroll events can be paired.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function decodeOrigin(token) {
  const url = new URL(Buffer.from(token, 'base64url').toString());
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK.has(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Only loopback HTTP origins are supported');
  }
  return url.origin;
}

function rewriteHtml(html, prefix, pathname) {
  const base = prefix + pathname.slice(0, pathname.lastIndexOf('/') + 1);
  return html.replace(/<base\b[^>]*>/gi, '')
    .replace(/\b(src|href|action|poster)=(['"])\/(?!\/)/gi, `$1=$2${prefix}/`)
    .replace(/<head\b[^>]*>/i, match => `${match}<base href="${base.replace(/"/g, '&quot;')}"><script src="/local-runtime.js" data-prefix="${prefix}"></script>`);
}

function installLocalRelay(app) {
  app.use('/local/:origin', async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).send('Read-only local comparison');
      const origin = decodeOrigin(req.params.origin);
      const prefix = `/local/${Buffer.from(origin).toString('base64url')}`;
      const target = new URL(origin + req.url);
      const upstream = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.has('location')) {
        const next = new URL(upstream.headers.get('location'), target);
        return res.redirect(upstream.status, next.origin === origin ? prefix + next.pathname + next.search : next.href);
      }
      const type = upstream.headers.get('content-type') || 'application/octet-stream';
      res.status(upstream.status).set('Content-Type', type).set('Cache-Control', 'no-store');
      if (req.method === 'HEAD') return res.end();
      if (type.includes('text/html')) return res.send(rewriteHtml(await upstream.text(), prefix, target.pathname));
      if (type.includes('text/css')) {
        return res.send((await upstream.text()).replace(/url\((['"]?)\/(?!\/)/gi, `url($1${prefix}/`));
      }
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      res.status(502).type('text/plain').send(`Local iframe relay failed: ${error.message}`);
    }
  });
}

module.exports = { decodeOrigin, rewriteHtml, installLocalRelay };
