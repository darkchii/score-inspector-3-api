var routeAuth = require('./routeAuth');
var routeUser = require('./routeUser');
var routeBeatmap = require('./routeBeatmap');
var routeDifficulty = require('./routeDifficulty');
var routeReplay = require('./routeReplay');

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
        path: '/beatmap',
        route: routeBeatmap
    },
    {
        path: '/difficulty',
        route: routeDifficulty
    },
    {
        path: '/replay',
        route: routeReplay
    }
];

module.exports.ApplyRoutes = ApplyRoutes;
function ApplyRoutes(app){
    routes.forEach((route) => {
        app.use(route.path, route.route);
    });
}