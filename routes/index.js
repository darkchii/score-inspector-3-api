var routeAuth = require('./routeAuth');
var routeUser = require('./routeUser');

let routes = [
    {
        path: '/auth',
        route: routeAuth
    },
    {
        path: '/user',
        route: routeUser
    }
];

module.exports.ApplyRoutes = ApplyRoutes;
function ApplyRoutes(app){
    routes.forEach((route) => {
        app.use(route.path, route.route);
    });
}