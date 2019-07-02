const mongoose = require('mongoose');

const errors = require('restify-errors');
const errorsOptions = require('restify-errors-options');
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

const validator = require('validator');
const pluralize = require("pluralize");

const _ = require("lodash");

errorsOptions.add('errors');


class Crud {
    static async create(req, res, next) {
        try {
            const data = req.body;
            const typeName = data._type ? data._type : pluralize(req.params.type, 1);
            const repository = new Repository(req._application, req._user);
            repository.dataValidation(typeName, null, [], false);
            const manager = new AppManager(req._application.app);
            if (!manager.isAppType(typeName)) {
                return next(new errors.BadRequestError("Type not in app!"));
            } else if (typeName == req._application.app.options.default.defaults.types._root.__type) {
                return next(new errors.BadRequestError("Can not run method on _root type! _root type is abstract!"));
            }
            const type = manager.getType(typeName);

            if (!req._user && _.get(type, 'options.public') && !(_.get(type, 'options.public') == true || _.get(type, 'options.public.writable') == true || _.get(type, 'options.public.create') == true)) {
                res.send({
                    name: "UserAuthenticationError",
                    message: "Create method not allowed!",
                });
                return;
            }


            const tempData = JSON.parse(JSON.stringify(data));


            repository.dataValidation(typeName, data, ["_type"], true);


            let result;


            if (_.isArray(data)) {
                return next(new errors.BadRequestError({}, ({
                    en: "Multiple documents create not suported!",
                    tr: "Birden fazla kayıt oluşturma desteklenmiyor!"
                })[req._locale]));
            } else {
                result = await repository.create(type.name, data);
            }

            const json = {
                success: true,
                headers: req._headers,
                method: "create",
                params: req.params,
                build: req._application.buildResult,
                input: tempData,
                data: result
            };

            if (!req._user && (_.get(type, 'options.public') == true || _.get(type, 'options.public.writable') == true || _.get(type, 'options.public.create') == true)) {
                res.send(json);
            } else if (!req._user && _.get(type, 'options.public')) {
                res.send({
                    name: "UserAuthenticationError",
                    message: "Create method not allowed!",
                })
            } else
                res.send(json);
        } 
        catch (error) {
            const allErrors = [].concat(error && error.errors ? error.errors : []).concat(req._errors);

            if (error instanceof RequestError) {
                return next(new errors.BadRequestError({
                    info: {
                        errors: error.errors,
                    },
                }, error.message));
            } else if (error instanceof CreateError || error instanceof UpdateError || error instanceof DeleteError) {
                return next(new errors.BadRequestError({
                    info: {
                        errors: error.errors,
                    },
                }, error.message));
            } else {
                return next(new errors.BadRequestError({
                    //cause: error,
                    info: {
                        errors: allErrors,
                    }
                }, error.message));
            }

        }
    }

    static async update(req, res, next) {
        const id = req.params.id;
        const data = req.body;
        const tempData = JSON.parse(JSON.stringify(data));
        const typeName = data._type ? data._type : pluralize(req.params.type, 1);
        const repository = new Repository(req._application, req._user);
        repository.dataValidation(typeName, null, [], false);
        const manager = new AppManager(req._application.app);
        if (!manager.isAppType(typeName)) {
            return next(new errors.BadRequestError("Type not in app!"));
        } 
        else if (typeName == req._application.app.options.default.defaults.types._root.__type) {
            return next(new errors.BadRequestError("Can not run method on _root type! _root type is abstract!"));
        }
        const type = manager.getType(typeName);

        if (!req._user && _.get(type, 'options.public') && !(_.get(type, 'options.public') == true || _.get(type, 'options.public.writable') == true || _.get(type, 'options.public.create') == true)) {
            res.send({
                name: "UserAuthenticationError",
                message: "Create method not allowed!",
            });
            return;
        }

        let result;

        repository.dataValidation(typeName, data, ["_type", "_id"], true);

        if (id && _.isPlainObject(data) && _.has(data, '_id') && data._id != id) {
            throw new Error("Can't set _id to update! _id property must be same with from _id of saved document! Please check _id property!");
        }

        try {
            if (_.isArray(data)) {
                return next(new errors.BadRequestError({}, ({
                    en: "Multiple documents update not suported!",
                    tr: "Birden fazla kayıt güncelleme desteklenmiyor!"
                })[req._locale]));
            } 
            else {
                result = await repository.update(type.name, id, data);
            }

            const json = {
                success: true,
                headers: req._headers,
                method: "update",
                params: req.params,
                build: req._application.buildResult,
                input: tempData,
                data: result
            };

            if (!req._user && (_.get(type, 'options.public') == true || _.get(type, 'options.public.writable') == true || _.get(type, 'options.public.update') == true)) {
                res.send(json);
            } 
            else if (!req._user && _.get(type, 'options.public')) {
                res.send({
                    name: "UserAuthenticationError",
                    message: "Update method not allowed!",
                })
            } 
            else
                res.send(json);
        } 
        catch (error) {
            const allErrors = [].concat(error.errors ? error.errors : []).concat(req._errors);
            if (error instanceof RequestError) {
                return next(new errors.BadRequestError({
                    info: {
                        errors: error.errors,
                    },
                }, error.message));
            } 
            else if (error instanceof CreateError || error instanceof UpdateError || error instanceof DeleteError) {
                return next(new errors.BadRequestError({
                    info: {
                        errors: error.errors,
                    },
                }, error.message));
            } 
            else if (error.error) {
                return next(new errors.BadRequestError({
                    info: {
                        errors: error.error.errors,
                    },
                }, error.error.message));
            } 
            else {
                console.log(error);
                return next(new errors.BadRequestError({
                    //cause: error,
                    info: {
                        errors: allErrors,
                    }
                }, error.message));
            }
        }
    }

    static async delete(req, res, next) {
        const typeName = pluralize(req.params.type, 1);
        const repository = new Repository(req._application, req._user);
        repository.dataValidation(typeName, null, [], false);
        const manager = new AppManager(req._application.app);
        if (!manager.isAppType(typeName)) {
            return next(new errors.BadRequestError("Type not in app!"));
        } 
        else if (typeName == req._application.app.options.default.defaults.types._root.__type) {
            return next(new errors.BadRequestError("Can not run method on _root type! _root type is abstract!"));
        }
        const type = manager.getType(typeName);

        if (!req._user && _.get(type, 'options.public') && !(_.get(type, 'options.public') == true || _.get(type, 'options.public.writable') == true || _.get(type, 'options.public.create') == true)) {
            res.send({
                name: "UserAuthenticationError",
                message: "Create method not allowed!",
            });
            return;
        }

        const id = req.params.id;

        if (req._application.app.options.readonly)
            throw new Error('Application data is readonly! Can not create, update, delete data!');

        if (!validator.isUUID(id)) {
            throw new Error('id must have an UUID v1 format!');
        }

        try {
            const result = await repository.delete(type.name, id);

            console.log(typeName, "delete id:", id);

            const data = {
                success: true,
                headers: req._headers,
                method: "delete",
                params: req.params,
                build: req._application.buildResult,
                affected: result ? 1 : 0
            };

            if (!req._user && (_.get(type, 'options.public') == true || _.get(type, 'options.public.writable') == true || _.get(type, 'options.public.delete') == true)) {
                res.send(data);
            } 
            else if (!req._user && _.get(type, 'options.public')) {
                res.send({
                    name: "UserAuthenticationError",
                    message: "Delete method not allowed!",
                })
            } 
            else
                res.send(data);
        } 
        catch (error) {
            return next(error);
        }
    }

    static async validate(req, res, next) {
        const id = req.params.id;
        const data = req.body;
        const typeName = data._type ? data._type : pluralize(req.params.type, 1);

        const tempData = JSON.parse(JSON.stringify(data));
        const manager = new AppManager(req._application.app);

        const repository = new Repository(req._application, req._user);
        const createSession = repository.createSession();

        repository.dataValidation(typeName, data, ["_type"], ["_type"], true);
        id && repository.checkId(id, data);
        const type = manager.getType(typeName);

        let result;

        try {
            if (_.isArray(data)) {
                return next(new errors.BadRequestError({}, ({
                    en: "Validate not suported for multiple documents!",
                    tr: "Birden fazla kayıt için doğrulama desteklenmiyor!"
                })[req._locale]));
            } 
            else if (!id) {
                result = await repository.validateCreate(type.name, data);
            } 
            else {
                result = await repository.validateUpdate(type.name, id, data);
            }

            const json = {
                success: true,
                headers: req._headers,
                method: id ? "validateUpdate" : "validateCreate",
                params: req.params,
                build: req._application.buildResult,
                input: tempData,
                isValid: result == true ? true : false
            };

            res.send(json);
        } 
        catch (error) {
            const allErrors = [].concat(error && error.errors ? error.errors : []).concat(req._errors);

            if (error instanceof RequestError) {
                return next(new errors.BadRequestError({
                    info: {
                        errors: error.errors,
                    },
                }, error.message));
            } 
            else if (error instanceof CreateError || error instanceof UpdateError || error instanceof DeleteError) {
                return next(new errors.BadRequestError({
                    info: {
                        errors: error.errors,
                    },
                }, error.message));
            } 
            else if (error.data) {
                return next(new errors.BadRequestError({
                    info: {
                        errors: error.error.errors,
                    },
                }, error.error.message));
            } 
            else {
                console.log(error);
                return next(new errors.BadRequestError({
                    //cause: error,
                    info: {
                        errors: allErrors,
                    }
                }, error.message));
            }

        }
    }

    static cache(method) {

        const cache = async (req, res, next) => {
            req.forCache = true;
            console.log('req.forCache', true, ' and invoke method:' + method)
            await Crud[method](req, res, next);
        }

        return cache;
    }
}

module.exports = Crud;