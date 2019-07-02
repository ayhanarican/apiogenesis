const mongoose = require('mongoose');
const errors = require('restify-errors');
const errorsOptions = require('restify-errors-options');
const validator = require('validator');
const pluralize = require("pluralize");

const _ = require("lodash");

const utils = require("../helpers/utils");
const utilsAsync = require("../helpers/utils.async");

const AppManager = require("../builder/app.manager");
const RepositoryBase = require("../repository/repository.base");
const Repository = require("../repository/repository");

const BuildError = require("../errors/buildError");
const RequestError = require("../errors/requestError");
const CreateError = require("../errors/createError");
const UpdateError = require("../errors/updateError");
const DeleteError = require("../errors/deleteError");
const UnknownPropertyError = require("../errors/unknownPropertyError");

const MyLogger = require("../helpers/myLogger");
const myLogger = new MyLogger(true);
const auth = require("./auth");



class Find {
    static async findAll(req, res, next) {
        const typeName = pluralize(req.params.type, 1);
        let repository, manager, type;
        try {
            repository = new Repository(req._application, req._user);
            repository.dataValidation(typeName, null, [], false);
            manager = new AppManager(req._application.app);
            if(!manager.isAppType(typeName)) {
                return next(new errors.BadRequestError("Type not in app!"));
            }
            else if(typeName == req._application.app.options.default.defaults.types._root.__type){
                return next(new errors.BadRequestError("Can not run method on _root type! _root type is abstract!"));
            }
            type = manager.getType(typeName);
        }
        catch (uuidError) {
            console.log(uuidError)
            return next(new errors.BadRequestError(uuidError.message));
        }

        if (!req._user && _.get(type, 'options.public') && !(_.get(type, 'options.public') == true || _.get(type, 'options.public.readable') == true || _.get(type, 'options.public.findAll') == true)) {
            res.send({
                name: "UserAuthenticationError",
                message: "FindAll method not allowed!",
            });
            next();
        }

        const options = req.query;

        const cachePath = "cache.queries." + req._orgName + "." + req._appName + "." + req._locale + "." + req.url;
        let cachedData = _.get(global, cachePath);
        // Clear application cache if it setted in query string
        if (req.query.cache == "clear" && cachedData) {
            delete global.cache.queries[req._orgName][req._appName][req._locale][req.url];
            cachedData = null;
        }

        if (cachedData && ["true", "findAll"].indexOf(req.query.cache) > - 1) {
            console.log(typeName, "findAll from cache");
            res.send(cachedData);
            return next();
        }
        else {
            try {
                const orginalSelect = options.select;
                const select = options.select 
                    ? (options.select.split(' ').indexOf('_type') == -1 ? options.select + ' _type' : options.select) 
                    : options.select;
                if(select) options.select = select;

                const count = await repository.countAll(type.name);
                const result = await repository.findAll(type.name, options);

                if (options && options.populate
                    && utils.objectEquals(options.populate, options.treePopulate))
                    delete options.treePopulate;
                if(select)
                    options.select = orginalSelect;
                
                const data = {
                    success: true,
                    count: count,
                    headers: req._headers,
                    method: "findAll",
                    params: req.params,
                    build: req._application.buildResult,
                    query: options,
                    data: (result ? repository.sortDocumentsKeyByPropertyOrder(result, '', false, orginalSelect) : result)
                };

                if (options.cache != "clear") {
                    global.cache.queries[req._orgName] = {};
                    global.cache.queries[req._orgName][req._appName] = {};
                    global.cache.queries[req._orgName][req._appName][req._locale] = {};
                    global.cache.queries[req._orgName][req._appName][req._locale][req.url] = data;
                }


                console.log(typeName, "findAll from db", options);
                if (!req._user && (_.get(type, 'options.public') == true || _.get(type, 'options.public.readable') == true || _.get(type, 'options.public.findAll') == true)) {
                    res.send(data);
                }
                else if (!req._user && _.get(type, 'options.public')) {
                    res.send({
                        name: "UserAuthenticationError",
                        message: "FindAll method not allowed!",
                    })
                }
                else
                    res.send(data)
            }
            catch (error) {
                return next(error);
            }
        }
    }

    static async find(req, res, next) {
        const typeName = pluralize(req.params.type, 1);

        let repository, manager, type;
        try {
            repository = new Repository(req._application, req._user);
            repository.dataValidation(typeName, null, [], false);
            manager = new AppManager(req._application.app);
            if(!manager.isAppType(typeName)) {
                return next(new errors.BadRequestError("Type not in app!"));
            }
            else if(typeName == req._application.app.options.default.defaults.types._root.__type){
                return next(new errors.BadRequestError("Can not run method on _root type! _root type is abstract!"));
            }
            type = manager.getType(typeName);
        }
        catch (uuidError) {
            return next(new errors.BadRequestError(uuidError.message));
        }

        if (!req._user && _.get(type, 'options.public') && !(_.get(type, 'options.public') == true || _.get(type, 'options.public.readable') == true || _.get(type, 'options.public.find') == true)) {
            res.send({
                name: "UserAuthenticationError",
                message: "Find method not allowed!",
            });
            next();
        }

        const options = _.assignIn(req.query, req.body)
        const cachePath = "cache.queries." + req._orgName + "." + req._appName + "." + req._locale + "." + req.url + "." + JSON.stringify(req.body);
        let cachedData = _.get(global, cachePath);
        if (options.cache == "clear" && cachedData) {
            console.log(typeName, "find from cache");
            delete global.cache.apps[req._orgName][req._appName][req._locale];
            delete global.cache.queries[req._orgName][req._appName][req._locale][req.url][JSON.stringify(req.body)];
            cachedData = null;
        }

        if (cachedData && (["true", "find"].indexOf(options.cache) > - 1)) {
            res.send(cachedData);
        }
        else if (req._application) {
            try {
                let allFilter = options.filter;
                
                if(options.search) {
                    const searchFilter = repository.prepareSearchFilter(typeName, options);
                    allFilter = _.assignIn(allFilter, searchFilter);
                }

                const count = await repository.count(type.name, allFilter);

                /*
                if(options && options.options && options.options.skip && count < options.options.skip) {
                    options.options.skip = 0;
                }
                */
                const orginalSelect = options.select;
                const select = options.select 
                    ? (options.select.split(' ').indexOf('_type') == -1 ? options.select + ' _type' : options.select) 
                    : options.select;
                if(select) options.select = select;

                const result = await repository.find(type.name, options);

                if (options && options.populate && options.populate.length
                    && utils.objectEquals(options.populate, options.treePopulate))
                    delete options.treePopulate;

                    if(select)
                        options.select = orginalSelect;

                const data = {
                    success: true,
                    count: count,
                    headers: req._headers,
                    method: "find",
                    params: req.params,
                    build: req._application.buildResult,
                    query: options,
                    data: result ? repository.sortDocumentsKeyByPropertyOrder(result, '', false, orginalSelect) : result
                };

                if (options.cache != "clear") {
                    global.cache.queries[req._orgName] = {};
                    global.cache.queries[req._orgName][req._appName] = {};
                    global.cache.queries[req._orgName][req._appName][req._locale] = {};
                    global.cache.queries[req._orgName][req._appName][req._locale][req.url] = {};
                    global.cache.queries[req._orgName][req._appName][req._locale][req.url][JSON.stringify(req.body)] = data;
                }

                console.log(typeName, "find from db", options);
                if (!req._user && (_.get(type, 'options.public') == true || _.get(type, 'options.public.readable') == true || _.get(type, 'options.public.find') == true)) {
                    res.send(data);
                }
                else if (!req._user && _.get(type, 'options.public')) {
                    res.send({
                        name: "UserAuthenticationError",
                        message: "Find method not allowed!",
                    })
                }
                else
                    res.send(data);
            }
            catch (error) {
                await utilsAsync.handleError(error);
                /*
                res.send({
                    error: error
                });
                */
                return next(error);
            }
        }
    }

    static async findById(req, res, next) {
        const typeName = pluralize(req.params.type, 1);
        const id = req.params.id;
        const options = req.query;

        let repository, manager, type;
        try {
            repository = new Repository(req._application, req._user);
            repository.dataValidation(typeName, null, [], false);
            manager = new AppManager(req._application.app);
            if(!manager.isAppType(typeName)) {
                return next(new errors.BadRequestError("Type not in app!"));
            }
            else if(typeName == req._application.app.options.default.defaults.types._root.__type){
                return next(new errors.BadRequestError("Can not run method on _root type! _root type is abstract!"));
            }
            type = manager.getType(typeName);
            repository.checkId(id, null);
        }
        catch (uuidError) {
            return next(new errors.BadRequestError(uuidError.message));
        }

        if (!req._user && _.get(type, 'options.public') && !(_.get(type, 'options.public') == true || _.get(type, 'options.public.readable') == true || _.get(type, 'options.public.findById') == true)) {
            res.send({
                name: "UserAuthenticationError",
                message: "FindById method not allowed!",
            });
            return;
        }

        if (req.query.cache == "clear" && cachedData) {
            delete global.cache.queries[req._orgName][req._appName][req._locale][req.url];
            cachedData = null;
        }

        try {
            const orginalSelect = options.select;
            const select = options.select 
                ? (options.select.split(' ').indexOf('_type') == -1 ? options.select + ' _type' : options.select) 
                : options.select;
            if(select) options.select = select;
            
            const result = await repository.findById(type.name, id, options);

            

            if (options && options.populate && options.populate.length
                && utils.objectEquals(options.populate, options.treePopulate))
                delete options.treePopulate;
            
            console.log(typeName, "findById from db id:", id);
            
            options.select = orginalSelect;

            const data = {
                success: true,
                headers: req._headers,
                method: "findById",
                params: req.params,
                query: options,

                build: req._application.buildResult,
                data: result ? repository.sortDocumentKeyByPropertyOrder(result, '', false, orginalSelect) : result
            };

            if (!req._user && (_.get(type, 'options.public') == true || _.get(type, 'options.public.readable') == true || _.get(type, 'options.public.findById') == true)) {
                res.send(data);
            }
            else if (!req._user && _.get(type, 'options.public')) {
                res.send({
                    name: "UserAuthenticationError",
                    message: "FindById method not allowed!",
                })
            }
            else
                res.send(data);
            //res.send(data);
        }
        catch (error) {
            req._errors.push(error);
            return next(new errors.InternalServerError({
                cause: error,
                info: {
                    errors: [error].concat(req._errors)
                }
            }, "UncaugthError: app: " + req._appName));
        }
    }


    static async aggregate(req, res, next) {
        const typeName = pluralize(req.params.type, 1);
        let repository, manager, type;
        try {
            repository = new Repository(req._application, req._user);
            repository.dataValidation(typeName, null, [], false);
            manager = new AppManager(req._application.app);
            if(!manager.isAppType(typeName)) {
                return next(new errors.BadRequestError("Type not in app!"));
            }
            else if(typeName == req._application.app.options.default.defaults.types._root.__type){
                return next(new errors.BadRequestError("Can not run method on _root type! _root type is abstract!"));
            }
            type = manager.getType(typeName);
            const id = req.params.id;
            const options = req.body || req.query.body || req.query.aggregate || req.query.query || {};



            if (!req._user && _.get(type, 'options.public') && !(_.get(type, 'options.public') == true || _.get(type, 'options.public.aggregate') == true)) {
                res.send({
                    name: "UserAuthenticationError",
                    message: "Aggregate method not allowed!",
                });
                return;
            }

            const result = await repository.aggregate(type.name, options);

            console.log(typeName, "aggregate from db query:", options);
            const data = {
                success: true,
                headers: req._headers,
                method: "aggregate",
                params: req.params,
                query: options,

                build: req._application.buildResult,
                data: result
            };
            if (!req._user && (_.get(type, 'options.public') == true || _.get(type, 'options.public.aggregate') == true)) {
                res.send(data);
            }
            if (!req._user && _.get(type, 'options.public') && _.get(type, 'options.public.aggregate')) {
                res.send({
                    name: "UserAuthenticationError",
                    message: "Aggreagate method not allowed!",
                })
            }
            else if (!req._user && _.get(type, 'options.public')) {
                res.send({
                    name: "UserAuthenticationError",
                    message: "Aggreagate method not allowed!",
                })
            }
            else
                res.send(data)
        }
        catch (error) {
            req._errors.push(error);
            return next(new errors.InternalServerError({
                cause: error,
                info: {
                    errors: [error].concat(req._errors)
                }
            }, "UncaugthError: app: " + req._appName));
        }
    }
}

module.exports = Find;