/**
 * Module Dependencies
 */
const errors = require('restify-errors');
const BuildError = require("../errors/buildError");
const utilsAsync = require("../helpers/utils.async");
const Application = require("../builder/application");
const _ = require("lodash");

const locales = require("../defaults/locales.json");

class App {
    static async client(req, res, next) {
        const body = req.body || {};
        const client = req.headers['client'] || req.query.client || body.client;
        const locale = req.headers['locale'] || req.query.locale || body.locale;
        const orgName = req.headers['organisation'] || req.query.organisation || body.organisation;
        const appName = req.headers['application'] || req.query.application || body.application;

        req._headers = {
            client: client,
            locale: locale,
            organisation: orgName,
            application: appName
        }

        req.buildMode = req.url == "/api/v1/$build"

        req._orgName = orgName;
        req._appName = appName;

        req._client = client;
        req._locale = locale || "en";

        req.fullPath = req._orgName + '.' + req._appName + '.' + req._locale;

        if (req.buildMode) {
            if (_.get(global.cache.apps, req.fullPath)) {
                delete global.cache.apps[req._orgName][req._appName][req._locale];
            }
            if (_.get(global.cache.queries, req.fullPath)) {
                delete global.cache.queries[req._orgName][req._appName][req._locale];
            }
        }

        req._errors = [];

        if (!req._options.useClient || !req._options.paths) {
            return next();
        }

        const clientsPath = req._options.paths.client ?
            req._options.paths.client :
            req._options.paths.apps + "/_clients.json";

        if (["true", "root", "app", "findAll"].indexOf(req.query.cache) > -1 && _.get(global, 'cache.clients')) {
            req._clients = global.cache.clients;
            console.log("clients from cache");
            next();
        } else {
            try {
                req._clients = await utilsAsync.readJSONFile(clientsPath);
            } catch (error) {
                await utilsAsync.handleError(error);
                req._errors.push(error);
                next();
            }

            if (!(req._client &&
                    req._clients &&
                    _.isArray(req._clients) &&
                    _.every(req._clients, (c) => _.isObject(c)) &&
                    _.find(req._clients, {
                        name: req._client
                    }))) {
                next(new errors.ResourceNotFoundError("Client not found in _clients.json. client: " + client));
            } else {
                global.cache.clients = req._clients;
                console.log("clients from file");
                next();
            }
        }

    }

    static async locale(req, res, next) {
        if (["true", "root", "app"].indexOf(req.query.cache) > -1 && _.get(global, 'cache.locales')) {
            req._locales = global.cache.locales;
            console.log("locales from cache");
            next();
        } else {
            try {
                req._locales = locales;
            } catch (error) {
                await utilsAsync.handleError(error);
                req._errors.push(error);
                next();
            }

            if (!(req._locale &&
                    req._locales &&
                    _.isArray(req._locales) &&
                    _.every(req._locales, (c) => _.isObject(c)) &&
                    _.find(req._locales, {
                        symbol: req._locale
                    }))) {
                next(new errors.ResourceNotFoundError("Locale not found in _locales.json. locale: " + req._locale));
            } else {
                global.cache.locales = req._locales;
                console.log("locales from file");
                next();
            }
        }

    }

    static async app(req, res, next) {
        // Clear application cache if it setted in query string
        const cachedApplication = _.get(global, 'cache.apps.' + req._orgName + '.' + req._appName + '.' + req._locale);
        if (req.query.cache == "clear" && cachedApplication) {
            delete global.cache.apps[req._orgName][req._appName][req._locale];
        }

        if ((_.get(cachedApplication, 'app.options.cache') == true || ["true", "app", "findAll"].indexOf(req.query.cache) > -1) && cachedApplication) {
            req._application = cachedApplication;
            req._app = req._application.app;
            req._applicationBuildResult = req._application.buildResult;
            console.log("app from cache:", req._orgName, req._appName);
            next();
        } else if (req.appName != "_root") {
            // build schemas for application in req._options.paths.apps
            try {
                const appsPath = req._options.paths.apps + '/' + req._orgName + '/apps';
                console.log(appsPath);
                const _app = await Application.readSchema(appsPath, req._appName);
                const appLocales = _app && _app.locales ?
                    _app.locales.map(locale => _.find(req._locales, {
                        symbol: locale
                    })) :
                    (_.get(_app, 'options.default.locale') ?
                        [_app.options.default.locale] :
                        ["en"]);

                const _application = req.buildMode == true ?
                    new Application(_app, appLocales, req._locale, req._orgName, true, req._user, req.buildMode) :
                    new Application(_app, appLocales, req._locale, req._orgName, true, req._user)

                const buildResult = await _application.build(_.get(req, '_options.paths.apps'));

                req._app = _app;
                req._application = _application;
                req._applicationBuildResult = buildResult;

                if (buildResult.errors && buildResult.errors.length) {
                    req._errors.push(...buildResult.errors);
                    // return next(new errors.BadRequestError({
                    //     //cause: priorError
                    //     info: buildResult
                    // }, "Error when build! app: " + req._appName));
                }

                global.cache.apps[req._orgName] = {};
                global.cache.apps[req._orgName][req._appName] = {};
                global.cache.apps[req._orgName][req._appName][req._locale] = _application;
                console.log("app from files:", req._orgName, req._appName);
                next();
            } catch (error) {
                //await utilsAsync.handleError(error);
                req._errors.push(error);
                return next(new errors.InternalServerError({
                    //cause: priorError
                    info: {
                        errors: [error].concat(req._errors)
                    }
                }, "UncaugthError: app: " + req._appName));
            }
        }
    }

    static async getLocales(req, res, next) {

    }

    static async setLocales(req, res, next) {

    }

    static async getClients(req, res, next) {

    }

    static async setClients(req, res, next) {

    }

    static async build(req, res, next) {
        if (req._application) {
            res.send({
                success: true,
                build: req._application.buildResult,
                app: req._application.app,
            });
        } else {
            res.send(new Error("Application not found!"));
        }

    }

    static async getApp(req, res, next) {
        if (req._application) {
            res.send({
                success: true,
                app: req._application.app,
                buildResult: req._application.buildResult
            });
        } else {
            res.send(new Error("Application not found!"));
        }

    }

    static async setApp(req, res, next) {
        const app = req.body.app;
        if (req._application) {
            res.send({
                success: true,
                app: req._application.app,
                buildResult: req._application.buildResult
            });
        } else {
            res.send(new Error("Application not found!"));
        }

    }
}

module.exports = App;