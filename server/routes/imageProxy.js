import express from 'express';

const router = express.Router();
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const parseHttpUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
};

router.post('/', async (req, res) => {
  const imageUrl = parseHttpUrl(req.body?.url);
  const activeUrl = parseHttpUrl(req.body?.activeUrl);
  const token = String(req.body?.token || '').trim();

  if (!imageUrl) {
    return res.status(400).json({ error: 'Invalid image URL' });
  }
  if (!activeUrl || imageUrl.origin !== activeUrl.origin) {
    return res.status(403).json({ error: 'Image proxy only allows the active Home Assistant origin' });
  }

  try {
    const headers = { Accept: 'image/*' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const upstream = await fetch(imageUrl.href, { headers, redirect: 'follow' });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Image fetch failed: ${upstream.status}` });
    }

    const contentType = String(upstream.headers.get('content-type') || 'application/octet-stream');
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(415).json({ error: 'URL did not return an image' });
    }

    const declaredLength = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Image is too large' });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Image is too large' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Image proxy failed' });
  }
});

export default router;
