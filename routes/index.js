var routeAuth = require('./routeAuth');
var routeUser = require('./routeUser');
var routeBeatmap = require('./routeBeatmap');
var routePack = require('./routePack');
var routeDifficulty = require('./routeDifficulty');
var routeReplay = require('./routeReplay');
var routeScore = require('./routeScore');
var routeLeaderboard = require('./routeLeaderboard');

let routes = [
    {
        path: '/auth',
        route: routeAuth
    },
    {
        path: '/user',
        route: routeUser
    },
    {
        path: '/score',
        route: routeScore
    },
    {
        path: '/beatmap',
        route: routeBeatmap
    },
    {
        path: '/beatmappack',
        route: routePack
    },
    {
        path: '/difficulty',
        route: routeDifficulty
    },
    {
        path: '/replay',
        route: routeReplay
    },
    {
        path: '/leaderboard',
        route: routeLeaderboard
    }
];

module.exports.ApplyRoutes = ApplyRoutes;
function ApplyRoutes(app){
    routes.forEach((route) => {
        app.use(route.path, route.route);
    });
}