var routeAuth = require('./routeAuth');
var routeUser = require('./routeUser');
var routeBeatmap = require('./routeBeatmap');
var routeDifficulty = require('./routeDifficulty');

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
    }
];

module.exports.ApplyRoutes = ApplyRoutes;
function ApplyRoutes(app){
    routes.forEach((route) => {
        app.use(route.path, route.route);
    });
}