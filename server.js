const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const redis = require('redis');
const db = redis.createClient(process.env.REDIS_TLS_URL, { tls: { rejectUnauthorized: false } });

const CHAR_LIST = 'BCDFGHJKLMNPQRSTVWXYZ2356789';
const APP_STORE_URI = 'https://apps.apple.com/us/app/plexamp/id1561249120';
const PLAY_MARKET_URI = 'market://details?id=tv.plex.labs.plexamp';

app.use(express.json());

app.get('', (req, res) => {
  res.send('o hai.');
});

app.post('/code', (req, res) => {
  if (req.body.uri) {
    let code = '';
    for (let i = 0; i < 4; i++){ code += CHAR_LIST.charAt(Math.floor(Math.random() * CHAR_LIST.length)); }
    db.set(code, req.body.uri, 'EX', 60 * 60 * 24, (e, r) => {
      console.log(`Using URI: ${req.body.uri} for code: ${code}`);
      res.json({ code });
    });
  } else {
    res.status(400);
    res.send('POST me a URI, dogg.');
  }
});

app.get('/code/:code', (req, res) => {
  db.get(req.params.code, (err, uri) => {
    if (!uri) {
      res.status(404);
      res.send('Not found.')
    } else {
      res.json({ uri });
    }
  });
});

app.get('/appstore', (req, res) => {
  const userAgent = req.headers['user-agent'];
  // /iPad|iPhone|iPod/.test(userAgent), let iOS be the default
  // TODO(yurij): Change to 301 once we've update the URIs to point to the Plex & Chill app
  res.redirect(302, /android/i.test(userAgent) ? PLAY_MARKET_URI : APP_STORE_URI);
});

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
