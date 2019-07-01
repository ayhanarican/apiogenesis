/**
 * Module Dependencies
 */
const bcrypt = require('bcryptjs');
const errors = require('restify-errors');
const utils = require("../helpers/utils");
const utilsAsync = require("../helpers/utils.async");
const Application = require("../builder/application");
const validator = require('validator');
const isEmail = validator.isEmail;
const jwt = require("jwt-simple");
const _ = require("lodash");

const pluralize = require("pluralize");
const AppManager = require("../builder/app.manager");

class Auth {
    static async user(req, res, next) {
        const application = req._application;
        const app = application.app;
        const header = req.headers['authorization'] ||
            req.headers['token'] ||
            req.query.authorization ||
            req.query.token || '';
        req._header = header;

        const token = header.substr(0, 3) == "JWT"
            ? header.toString().substr(3).trim()
            : header.toString().trim();

        const manager = new AppManager(app);

        if(!manager.isAppType(app.options.default.defaults.types._user._type)) {
            return next();
        }


        if (!token) {
            res.send({
                name: "UserAuthenticationError",
                message: "Set JWT token! JWT token can not be null! Please once login and set token or authorization parameter on header, body or query string",
            });
        }
        if (!validator.isJWT(token)) {
            res.send({
                name: "UserAuthenticationError",
                message: "JWT token have a JWT format",
            });
        }

        try {
            if (token) {
                req.payload = jwt.decode(token, app.options.secretKey);
                const selects = {};
                const keys = Object.keys(application.defaults.types._user);
                keys.forEach(key => selects[key] = true);
                const query = application.builder.models[application.defaults.types._user._type]
                    .findOne({ email: req.payload.email }, selects)
                    .populate([
                        {
                            path: "role",
                        },
                        {
                            path: "roles",
                            populate: [
                                {
                                    path: "role",
                                    populate: [
                                        {
                                            path: "permissions"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]);

                const user = await query.exec();
                if (user != null) {
                    req._user = user;
                    next();
                }
                else {
                    res.send({
                        name: "UserAuthenticationError",
                        message: "User not found!",
                    });
                }
            }
        }
        catch (userError) {
            res.send({
                name: "UserAuthenticationError",
                message: "Authentication error!",
                errors: [userError].map(err => err.message)
            });
        }


    }

    static async login(req, res, next) {
        const application = req._application;
        const app = application.app;
        const body = req.body || {};
        const email = body[application.defaults.types._user.email];
        const password = body[application.defaults.types._user.password];

        const _errors = [];

        try {
            if (!email) {
                _errors.push(new Error("No email specified!"));
            }
            else if (!isEmail(email)) {
                _errors.push(new Error("Email must have an email format"));
            }

            if (!password) {
                _errors.push(new Error("No password specified!"));
            }
            else {
                if (_.has(app.options.authentication.login.password, 'minLength') && _.has(app.options.authentication.login.password, 'maxLength')) {
                    if (password.length < app.options.authentication.login.password.minLength || password.length > app.options.authentication.login.password.maxLength) {
                        _errors.push(Error(`Password length must be between ${app.options.authentication.login.password.minLength} and ${app.options.authentication.login.password.maxLength} characters.`));
                    }
                }
                else if (_.has(app.options.login.password, 'minLength')) {
                    if (password.length < app.options.authentication.login.password.minLength) {
                        _errors.push(Error(`Password must contain at least ${app.options.authentication.login.password.minLength} characters.`));
                    }
                }
                else if (_.has(app.options.authentication.login.password, 'maxLength')) {
                    if (password.length > app.options.authentication.login.password.maxLength) {
                        _errors.push(Error(`Password must contain at most ${app.options.authentication.login.password.maxLength} characters.`));
                    }
                }
            }

            if (_errors.length) {
                console.log(_errors);
                /*
                 next(new errors.InvalidArgumentError({
                    info: {
                        some: {
                            errors: [].concat(_errors)
                        }
                    }
                }, "Can't login user!"));
                */
                res.send({
                    name: "UserAuthenticationError",
                    message: "Can't login User",
                    errors: _errors.map(err => err.message)
                })
            }
        }
        catch (error) {
            next(error);
        }

        let user, compare;

        try {
            const selects = {};
            const keys = Object.keys(application.defaults.types._user);
            keys.forEach(key => selects[key] = true);

            user = await application.builder.models[application.defaults.types._user._type]
                .findOne({ email: email }, selects)
                .populate([
                    {
                        path: "role",
                    },
                    {
                        path: "roles",
                        populate: [
                            {
                                path: "role",
                                populate: [
                                    {
                                        path: "permissions"
                                    }
                                ]
                            }
                        ]
                    }

                ]).exec();
        }
        catch (userError) {
            await utilsAsync.handleError(userError)
            res.send({
                name: "UserAuthenticationError",
                message: "Can't login User",
                errors: _errors.map(err => err.message).concat([userError].map(err => err.message))
            })
        }
        console.log(user, application.defaults.types._user.password);
        try {
            if (user) {
                try {
                    compare = await bcrypt.compare(password, user[application.defaults.types._user.password])
                }
                catch (compareError) {
                    res.send({
                        name: "UserAuthenticationError",
                        message: "Can't login User",
                        errors: _errors.map(err => err.message).concat([compareError].map(err => err.message))
                    })
                }

                if (!compare) {
                    _errors.push(new Error("The password doesn't match!"));
                }
                else {
                    if (app.options.authentication.login.use.indexOf("active") > -1 && 
                        !user[application.defaults.types._user.password]) {
                        _errors.push(new Error("User not active!"));
                    }

                    if (app.options.authentication.login.use.indexOf("confirmation") > -1 && 
                        !user[application.defaults.types._user.confirmed]) {
                        _errors.push(new Error("Confirmation required!"));
                    }
                }

                if (_errors.length) {
                    res.send({
                        name: "UserAuthenticationError",
                        message: "Can't login user!" + email,
                        errors: _errors.map(err => err.message)
                    })
                }
                else {

                    const token = Auth.prepareToken(user, application);
                    const data = {
                        success: true,
                        method: "login",
                        user: user,
                        token: token
                    };

                    res.send(data);
                }
            }
            else {
                res.send({
                    name: "UserAuthenticationError",
                    message: "User not found!",
                });
            }
        }
        catch (validationError) {
            res.send({
                name: "UserAuthenticationError",
                message: "Can't login User",
                errors: _errors.map(err => err.message).concat([validationError].map(err => err.message))
            });
        }
    }

    static async checkAuth(req, res, next) {
        const typeName = pluralize(req.params.type, 1);
        const manager = new AppManager(req._application.app);

        if(!manager.isAppType(req._application.app.options.default.defaults.types._user._type)) {
            return next();
        }

        if (req._application.typeNames.indexOf(typeName) == -1) {
            throw new Error("Type not found in app types! Type is " + typeName);
        }
        const type = manager.getType(typeName);

        const header = req.headers['authorization'] ||
            req.headers['token'] ||
            req.query.authorization ||
            req.query.token || '';

        if (type && _.isEmpty(header) && _.get(type, 'options.public')) {
            const typePublic = _.get(type, 'options.public');
            const keys = Object.keys(typePublic);
            const actions = req._application.app.options.default.defaults.actions.all.map(action => action.name);
            const readableAndWritableActions = req._application.app.options.default.defaults.actions.readable.concat(req._application.app.options.default.defaults.actions.writable).map(action => action.name);
            keys.sort();
            actions.sort();
            readableAndWritableActions.sort();
            if (_.every(Object.values(typePublic), value => value == false) &&
                (utils.objectEquals(keys, actions) ||
                    utils.objectEquals(keys, readableAndWritableActions) ||
                    (typePublic.readable == false && typePublic.writable == false))) {
                return next(new errors.UnprocessableEntityError(`All actions must be not false in options.public option of type! Type is ${typeName}`));
            }
            else
                next();
        }
        else {
            await Auth.user(req, res, next);
            if (req._user) {
                //console.log(Auth.checkAuthorization(req._application.app, req._user, type.name));
                next();
            }
        }
    }

    /**
     * Private methods
     */
    static prepareToken(user, application) {
        // Prepare payload
        const data = {};
        //data._id = user._id;
        data[application.defaults.types._user.name] = user[application.defaults.types._user.name];
        data[application.defaults.types._user.email] = user[application.defaults.types._user.email];

        return "JWT " + jwt.encode(data, application.app.options.secretKey, "HS256", "")
    }

    static checkAuthorization(app, user, typeName, action) {
        // Check authorization by permissions of role
        let allow = false;
        if (app.options.authorization && app.options.authorization.multipleRoles == true)
            allow = _.some(user.roles, role => Auth.checkRolePermission(app, role, typeName, action)) ? true : false;
        else
            allow = Auth.checkRolePermission(app, user.role, typeName, action);

        return allow;
    }

    static checkRolePermission(app, role, typeName, action) {
        let allow = false;
        role.permissions = _.sortBy(role.permissions, ['_createdAt']);

        if (_.get(app, 'options.authorization') && app.options.authorization.use.indexOf("action") && app.options.authorization.use.indexOf("type")) {
            allow = (_.some(role.permissions, { type: "*", action: '*', perm: 'allow' }) ||
                _.some(role.permissions, { type: "*", action: action, perm: 'allow' }) ||
                _.some(role.permissions, { type: typeName, action: '*', perm: 'allow' }) ||
                _.some(role.permissions, { type: typeName, action: action, perm: 'allow' }))
                &&
                (!_.some(role.permissions, { type: "*", action: '*', perm: 'deny' }) ||
                    !_.some(role.permissions, { type: "*", action: action, perm: 'deny' }) ||
                    !_.some(role.permissions, { type: typeName, action: '*', perm: 'deny' }) ||
                    !_.some(role.permissions, { type: typeName, action: action, perm: 'deny' }));
        }
        else if (_.get(app, 'options.authorization') && app.options.authorization.use.indexOf("action")) {
            allow = (_.some(role.permissions, { action: '*', perm: 'allow' }) ||
                _.some(role.permissions, { action: action, perm: 'allow' }))
                &&
                (!_.some(role.permissions, { action: '*', perm: 'deny' }) ||
                    !_.some(role.permissions, { action: action, perm: 'deny' }));
        }
        else if (_.get(app, 'options.authorization') && app.options.authorization.use.indexOf("type")) {
            allow = (_.some(role.permissions, { type: "*", perm: 'allow' }) ||
                _.some(role.permissions, { type: typeName, perm: 'allow' }))
                &&
                (!_.some(role.permissions, { type: "*", perm: 'deny' }) ||
                    !_.some(role.permissions, { type: typeName, perm: 'deny' }));
        }

        return allow;
    }
}

module.exports = Auth;