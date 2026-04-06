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
var routeSystem = require('./routeSystem');
var routeReputation = require('./routeReputation');
var routeVisitor = require('./routeVisitor');
var routeAdmin = require('./routeAdmin');

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
    },
    {
        path: '/system',
        route: routeSystem
    },
    {
        path: '/reputation',
        route: routeReputation
    },
    {
        path: '/visitor',
        route: routeVisitor
    },
    {
        path: '/admin',
        route: routeAdmin
    }
];

module.exports.ApplyRoutes = ApplyRoutes;
function ApplyRoutes(app){
    routes.forEach((route) => {
        app.use(route.path, route.route);
    });
}