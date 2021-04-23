const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const http = require('http');
const redis = require('redis');
const socketio = require('socket.io');
const socketioRedis = require('socket.io-redis');
const { promisify } = require('util');

const redisClient = redis.createClient(process.env.REDIS_TLS_URL, { tls: { rejectUnauthorized: false } });
const db = {
  get: promisify(redisClient.get).bind(redisClient),
  set: promisify(redisClient.set).bind(redisClient)
};

const port = process.env.PORT || 3000;
const app = new Koa();
const server = http.createServer(app.callback());
const io = socketio(server);
io.adapter(socketioRedis({ pubClient: redisClient, subClient: redisClient.duplicate() }));

const CHAR_LIST = 'BCDFGHJKLMNPQRSTVWXYZ2356789';
const CODE_LENGTH = 4;
const DAY_SECONDS = 60 * 60 * 24;
const APP_STORE_URI = 'https://apps.apple.com/us/app/plexamp/id1561249120';
const PLAY_MARKET_URI = 'market://details?id=tv.plex.labs.plexamp';

const router = new Router();

router.get('', ctx => ctx.body = 'o hai.');

router.post('/code', async ctx => {
  if (!ctx.request.body.uri) {
    ctx.throw(400, 'POST me a URI, dogg.');
  }
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++){ code += CHAR_LIST.charAt(Math.floor(Math.random() * CHAR_LIST.length)); }
  await db.set(code, ctx.request.body.uri, 'EX', DAY_SECONDS);
  console.log(`Using URI "${ctx.request.body.uri}" for code "${code}"`);
  ctx.body = { code };
});

router.get('/code/:code', async ctx => {
  const uri = await db.get(ctx.params.code);
  if (!uri) {
    ctx.throw(404);
  }
  ctx.body = { uri };
});

router.get('/appstore', ctx => {
  const userAgent = ctx.headers['user-agent'];
  // /iPad|iPhone|iPod/.test(userAgent), let iOS be the default
  // TODO(yurij): Change to 301 once we've update the URIs to point to the Plex & Chill app
  ctx.redirect(/android/i.test(userAgent) ? PLAY_MARKET_URI : APP_STORE_URI);
});

router.get('/log', ctx => {
  const { appName, level, msg } = ctx.query;
  console.log(`[${appName}] (${ctx.req.headers['x-forwarded-for'] || ctx.req.connection.remoteAddress}) ${level} ${msg}`);
  ctx.body = null;
})

app
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods());


io.use(async (socket, next) => {
  const originalSocketOn = socket.on.bind(socket);
  socket.on = (event, handler) => {
    originalSocketOn(event, async (...args) => {
      try {
        await handler(...args);
      } catch (err) {
        console.error(err.stack);
        socket.emit('error', err.toString());
      }
    });
  };
  next();
});

io.on('connection', socket => {
  socket.on('tv:auth', async code => {
    await db.set(`socket:${code}`, socket.id, 'EX', DAY_SECONDS);
    console.log(`Using socket "${socket.id}" for code "${code}"`);
  });

  socket.on('phone:request', async (code, request) => {
    const tvSocketId = await db.get(`socket:${code}`);
    if (!tvSocketId) {
      throw new Error(`cannot find socket for code ${code}`);
    }
    socket.to(tvSocketId).emit('phone:request', socket.id, request);
  });

  socket.on('tv:response', (phoneId, response) => socket.to(phoneId).emit('tv:response', response));
});

server.listen(port, () => console.log(`Listening at http://localhost:${port}`));
