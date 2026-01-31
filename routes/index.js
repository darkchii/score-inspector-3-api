var routeAuth = require('./routeAuth');
var routeUser = require('./routeUser');
var routeBeatmap = require('./routeBeatmap');
var routePack = require('./routePack');
var routeDifficulty = require('./routeDifficulty');
var routeReplay = require('./routeReplay');
var routeScore = require('./routeScore');
var routeLeaderboard = require('./routeLeaderboard');
var routeTeam = require('./routeTeam');
var routeStats = require('./routeStats');

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
    },
    {
        path: '/team',
        route: routeTeam
    },
    {
        path: '/stats',
        route: routeStats
    }
];

module.exports.ApplyRoutes = ApplyRoutes;
function ApplyRoutes(app){
    routes.forEach((route) => {
        app.use(route.path, route.route);
    });
}