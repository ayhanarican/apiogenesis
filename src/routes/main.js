/**
 * Module Dependencies
 */
const errors = require('restify-errors');
const pluralize = require("pluralize");

const auth = require("./auth");
const crud = require("./crud");
const find = require("./find");
const apps = require("./apps");



module.exports = function (server, options) {
    const apiRoot = options.root;

    server.get('/', (req, res, next) => {
        res.status(200);
        res.send({
            message: "Welcome " + apiRoot
        })
        return next();
    });

    // Login
    server.post(apiRoot + '/$login', apps.client, apps.locale, apps.app, auth.login);

    // Manage Application
    server.get(apiRoot + '/$build', apps.client, apps.locale, apps.app, apps.build);
    server.get(apiRoot + '/$app', apps.client, apps.locale, apps.app, auth.user, apps.getApp);
    server.post(apiRoot + '/$app', apps.client, apps.locale, apps.app, auth.user, apps.setApp);


    // Validate documents
    server.post(apiRoot + '/:type/$validate/create/', apps.client, apps.locale, apps.app, auth.user, crud.validate);
    server.post(apiRoot + '/:type/$validate/update/:id', apps.client, apps.locale, apps.app, auth.user, crud.validate);
    
    // Run aggregate operations on mongoose
    server.post(apiRoot + '/:type/$aggregate', apps.client, apps.locale, apps.app, auth.checkAuth, find.aggregate);

    // Restful

    // Finding all documents. Paging, sorting and field selecting on documents using query string
    server.get(apiRoot + '/:type', apps.client, apps.locale, apps.app, auth.checkAuth, find.findAll);
    server.get(apiRoot + '/:type/$findAll', apps.client, apps.locale, apps.app, auth.checkAuth, find.findAll);
    server.post(apiRoot + '/:type/$findAll', apps.client, apps.locale, apps.app, auth.checkAuth, find.findAll);
    
    // In addition to find all, you can search and filter. This method supports both get and post.
    server.get(apiRoot + '/:type/$find', apps.client, apps.locale, apps.app, auth.checkAuth, find.find);
    server.post(apiRoot + '/:type/$find', apps.client, apps.locale, apps.app, auth.checkAuth, find.find);
    

    // Find by id
    server.get(apiRoot + '/:type/:id', apps.client, apps.locale, apps.app, auth.checkAuth, find.findById);

    // Create document
    server.post(apiRoot + '/:type', apps.client, apps.locale, apps.app, auth.checkAuth, crud.create);

    // Update document by id
    server.put(apiRoot + '/:type/:id', apps.client, apps.locale, apps.app, auth.checkAuth, crud.update);

    // Delete document by id
    server.del(apiRoot + '/:type/:id', apps.client, apps.locale, apps.app, auth.checkAuth, crud.delete);    
}