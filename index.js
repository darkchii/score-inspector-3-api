const compression = require('compression');
const express = require('express');
const cors = require('cors');
const { ApplyRoutes } = require('./routes');
const app = express();
const port = 3863;

app.use(cors());
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
