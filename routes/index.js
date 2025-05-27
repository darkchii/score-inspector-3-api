var routeAuth = require('./routeAuth');

let routes = [
    {
        path: '/auth',
        route: routeAuth
    }
];

module.exports.ApplyRoutes = ApplyRoutes;
function ApplyRoutes(app){
    routes.forEach((route) => {
        app.use(route.path, route.route);
    });
}