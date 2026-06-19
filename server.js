/**
 * Music Player Pro — Backend Server
 * Deploy ke Railway: https://railway.app
 *
 * Fitur:
 *  - GET /api/info?url=   → ambil info video YouTube
 *  - GET /api/download?url=&format=mp3  → download & stream audio
 *  - GET /api/search?q=   → cari video YouTube
 */

const express   = require('express');
const cors      = require('cors');
const youtubedl = require('youtube-dl-exec');
const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── CORS: izinkan semua origin agar index.html dari mana saja bisa konek ─── */
app.use(cors({
  origin: '*',
  exposedHeaders: ['X-Title', 'X-Filename', 'X-Duration', 'Content-Disposition']
}));
app.use(express.json());

/* ─── Halaman root — konfirmasi server aktif ─── */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    name:   'Music Player Pro Backend',
    endpoints: ['/api/info', '/api/download', '/api/search']
  });
});

/* ─── /api/info — ambil metadata video ─── */
app.get('/api/info', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Parameter url diperlukan' });

  try {
    const info = await youtubedl(url, {
      dumpSingleJson:      true,
      noCheckCertificates: true,
      noWarnings:          true,
      preferFreeFormats:   true,
      addHeader:           ['referer:youtube.com', 'user-agent:googlebot'],
    });

    res.json({
      title:     info.title     || 'Tidak diketahui',
      uploader:  info.uploader  || '',
      duration:  info.duration  || 0,
      thumbnail: info.thumbnail || '',
      id:        info.id        || '',
    });
  } catch (e) {
    console.error('[/api/info]', e.message);
    res.status(500).json({ error: 'Gagal mengambil info: ' + e.message });
  }
});

/* ─── /api/search — cari video YouTube ─── */
app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Parameter q diperlukan' });

  try {
    /* yt-dlp bisa search dengan prefix "ytsearch5:" */
    const results = await youtubedl(`ytsearch5:${q}`, {
      dumpSingleJson:      true,
      noCheckCertificates: true,
      noWarnings:          true,
      flatPlaylist:        true,
    });

    const entries = results.entries || [];
    res.json(entries.map(e => ({
      id:       e.id,
      title:    e.title,
      duration: e.duration,
      url:      'https://www.youtube.com/watch?v=' + e.id,
      thumbnail: e.thumbnail || ('https://i.ytimg.com/vi/' + e.id + '/mqdefault.jpg'),
    })));
  } catch (e) {
    console.error('[/api/search]', e.message);
    res.status(500).json({ error: 'Gagal mencari: ' + e.message });
  }
});

/* ─── /api/download — download & stream audio ─── */
app.get('/api/download', async (req, res) => {
  const url    = req.query.url;
  const format = ['mp3','m4a','wav','ogg'].includes(req.query.format) ? req.query.format : 'mp3';
  if (!url) return res.status(400).json({ error: 'Parameter url diperlukan' });

  const tmpId   = crypto.randomBytes(8).toString('hex');
  const tmpPath = path.join('/tmp', tmpId + '.' + format);

  try {
    /* Ambil judul dulu untuk header */
    let title = 'audio';
    try {
      const info = await youtubedl(url, {
        dumpSingleJson:      true,
        noCheckCertificates: true,
        noWarnings:          true,
      });
      title = info.title || 'audio';
    } catch(e) { /* tidak fatal */ }

    /* Download & convert */
    await youtubedl(url, {
      extractAudio:        true,
      audioFormat:         format,
      audioQuality:        '0',          /* kualitas terbaik */
      output:              tmpPath,
      noCheckCertificates: true,
      noWarnings:          true,
    });

    if (!fs.existsSync(tmpPath)) {
      return res.status(500).json({ error: 'File hasil download tidak ditemukan' });
    }

    const stat     = fs.statSync(tmpPath);
    const safeName = title.replace(/[^\w\s\-\(\)]/g, '').trim().substring(0, 100);
    const filename = safeName + '.' + format;

    res.setHeader('Content-Type',        'audio/' + format);
    res.setHeader('Content-Length',      stat.size);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('X-Title',             encodeURIComponent(safeName));
    res.setHeader('X-Filename',          encodeURIComponent(filename));

    const stream = fs.createReadStream(tmpPath);
    stream.pipe(res);

    stream.on('end', () => {
      try { fs.unlinkSync(tmpPath); } catch(e) {}
    });
    stream.on('error', (e) => {
      console.error('[stream error]', e);
      try { fs.unlinkSync(tmpPath); } catch(e2) {}
      if (!res.headersSent) res.status(500).json({ error: 'Stream error' });
    });

  } catch (e) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch(e2) {}
    console.error('[/api/download]', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Gagal download: ' + e.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Music Player Pro Backend berjalan di port ${PORT}`);
});
