const compression = require('compression');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { ApplyRoutes } = require('./routes');
const app = express();
const port = 3863;

const allowedOrigins = new Set([
  'https://score.kirino.sh',
  'https://osualternative.com',
  'https://www.osualternative.com',
  'http://localhost:3006',
  'http://localhost:5173',
  'http://127.0.0.1:3006',
  'http://127.0.0.1:5173',
  'https://*.score-inspector-3-frontend.pages.dev'
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // curl/postman/server-to-server
    if (allowedOrigins.has(origin)) return callback(null, true);
    if (origin.endsWith('.score-inspector-3-frontend.pages.dev')) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(compression({ level: 9 }));

app.get('/', (req, res) => {
    res.send('Nothing to see here. Watch Mushoku Tensei instead.');
});

app.use('/ping', function (req, res, next) {
  res.send('https://cdn.donmai.us/original/e7/72/__kousaka_kirino_ore_no_imouto_ga_konna_ni_kawaii_wake_ga_nai_drawn_by_kina_asuki__e7724d517c6cfc29641fd6c1d9f3bb41.png')
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});

ApplyRoutes(app);
