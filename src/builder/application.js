const mongoose = require("mongoose");
const _ = require("lodash");
const uuid = require("node-uuid");
const utilsAsync = require("../helpers/utils.async");
const MongooseSchemaBuilder = require("../mongoose/schema.builder");
const AppSchema = require("./app.schema");
const AppManager = require("../builder/app.manager");
const BaseClass = require("../base/base");
const RepositoryBase = require("../repository/repository.base");
const defaults = require("../defaults/defaults");
const bcrypt = require('bcryptjs');
const path = require('path');
const pluralize = require("pluralize");

const errors = require('restify-errors');
const BuildError = require("../errors/buildError");
const RequestError = require("../errors/requestError");
const CreateError = require("../errors/createError");
const UpdateError = require("../errors/updateError");
const DeleteError = require("../errors/deleteError");
const UnknownPropertyError = require("../errors/unknownPropertyError");

const MyLogger = require("../helpers/myLogger");
const ErrorLogger = require("../helpers/errorLogger");

const myLogger = new MyLogger(false);
const errorLogger = new ErrorLogger(true);

class Application extends BaseClass {
    // Application constructor
    constructor(app, locales, locale, orgName, user, options) {
        // Setting default properties values
        if (!app || !locales || !locale || !orgName)
            throw new Error("app, locales, locale, orgName parameters can not be null");
        super();
        this.app = app;
        this.allLocales = locales;
        this.locale = locale;
        this.orgName = orgName;
        this.appName = this.app.name;

        this.user = user;
        this.options = _.get(this.app, 'options');
        this.builded = false;
        this.dbUri = _.get(this, 'app.options.dbUri');
        this.buildErrors = [];
        this.manager = new AppManager(this.app);
        this.types = this.manager.getAllTypes();
        this.typeNames = this.types.map(type => type.name);
        this.buildResult = null;
        this.defaults = _.get(this.app, 'options.default.defaults') ? _.assignIn(this.app.options.default.defaults, defaults) : defaults;
        
    }

    setUser(user) {
        this.user = user;
    }

    async build(appsPath) {
        const _errors = [];
        const startTime = new Date();
        const appSchema = new AppSchema(this.app, this.allLocales);

        this.schema = appSchema.schema;

        try {
            await appSchema.validate();
            const valueValidates = [];
            const types = this.manager.getAllTypes();
            for (let type of types) {
                const properties = this.manager.getProperties(type.name);
                for (let property of properties.filter(p => ["reference", "collection"].indexOf(p.type) > -1)) {
                    const options = _.get(property, 'options');
                    const reference = _.get(property, 'options.reference');
                    const collection = _.get(property, 'options.collection');
                    const collectionReference = _.get(property, 'options.collection.reference');

                    if (reference) {
                        const schema = appSchema.getPropertyOptionsReferenceSchema(reference, options, this.manager);
                        valueValidates.push(appSchema.validator({}).validate(schema, reference));
                    }

                    if (collection) {
                        const schema = appSchema.getPropertyOptionsCollectionSchema(collection, options, this.manager);
                        valueValidates.push(appSchema.validator({}).validate(schema, collection));
                    }

                    if (collectionReference) {
                        const schema = appSchema.getPropertyOptionsReferenceSchema(collectionReference, collection, this.manager);
                        valueValidates.push(appSchema.validator({}).validate(schema, collectionReference));
                    }
                }
            }

            const valueValidateResults = await Promise.all(valueValidates);
            const validateErrors = valueValidateResults.filter(result => (result instanceof Error));
            _errors.push(...validateErrors);
            this.isValid = validateErrors.length == 0 ? true : false;
        }
        catch (validateError) {
            await utilsAsync.handleError(validateError);
            _errors.push(validateError);
        }

        try {
            // mongooseSchema builder
            this.builder = new MongooseSchemaBuilder(this.app, this.orgName, this.locale, this.dbUri);
        }
        catch (mongooseError) {
            _errors.push(mongooseError);
        }

        // Create default data
        let keyCount;
        let result;

        try {
            keyCount = await this.builder.models[this.defaults.types._key._type].countDocuments({ _type: { $in: [this.defaults.types._key._type] } });
            if (!keyCount) {
                result = await this.createDefaultData(appsPath);
                keyCount = result ? result.results.filter(r => r._type == this.defaults.types._key._type).length : 0;
                if (result && result.errors.length)
                    _errors.push(result.errors);
            }

        }
        catch (createDefaultDataError) {
            await utilsAsync.handleError(createDefaultDataError);
            _errors.push(createDefaultDataError);
        }

        if (_errors.length) {
            throw new BuildError("Build Errors: ", _errors);
        }

        const buildResult = {
            time: new Date(),
            duration: (new Date()) - startTime,
            created: result ? result.created : result,
            errors: _errors.length ? _errors : null
        }

        this.buildResult = buildResult;

        return buildResult;
    }

    /** Private methods */
    async createDefaultData(appsPath) {
        // Read default data files from json files
        const dataPath = appsPath + '/' + this.orgName + "/apps/" + this.appName + '/data'
        let dataFiles = await this.readDefaultDataFiles(dataPath);

        if(!dataFiles || dataFiles.length == 0) {
            dataFiles = this.app.data;
        }

        const prepared = this.prepareKeysAndItems(dataFiles);
        const keys = prepared.keys;
        const itemsToCreate = prepared.items;
        let _errors;
        try {
            if (dataFiles) {
                let defaultUserId = null, defaultUser;

                if(_.get(this.app, 'options.default.user')) {
                    const userSId = this.app.options.default.user;
                    const defaultUserKey = _.find(keys, { type: this.defaults.types._user._type, sid: userSId });
                    if (!defaultUserKey)
                        throw new Error("Default user not found in data items");
                    defaultUserId = defaultUserKey.oid;
                    defaultUser = itemsToCreate.filter(ci => ci._type == this.defaults.types._user._type && ci._id == defaultUserId);
                }

                const repository = new RepositoryBase(this, _.get(this.options, 'buildMode'));

                const keyItems = keys.map(key => key);

                const items = itemsToCreate.map(ci => ci);

                const results = await repository.baseCreateDocuments(keyItems.concat(items), true, defaultUserId);
                _errors = results.errors;

                if (_errors.length) {
                    //console.log(_errors);
                }

                const created = {
                    types: {
                        count: _.uniq(results.results.map(ca => ca.type)).length,
                        //derived: _.uniq(createActions.map(ca => ca.type)).map(ut => this.manager.getType(ut)).filter(typ => tpe.base != null && typeof typ.base != "undefined").length
                    },
                    items: {
                        count: results.results.length - _errors.length,
                    },
                    keys: {
                        count: results.results.filter(r => r._type == this.defaults.types._key._type).length
                    }
                };

                return { results: results.results, errors: _errors, created: created };
            }
        }
        catch (error) {
            throw new CreateError("Error when create default data: ", error, this.app, this.locale, true);
        }
    }

    prepareKeysAndItems(dataFiles) {
        const keys = [];
        const itemsToCreate = [];
        const repository = new RepositoryBase(this);
        
        if (dataFiles) {
            let newItems;
            if(!this.app.data) {
                newItems = this.app.load.data
                    .map(type => dataFiles.flat()
                        .filter(fi => ([type].concat(this.manager.getChildTypes(type).map(ct => ct.name))).indexOf(fi._type) != -1)).flat();
            }
            else {
                newItems = this.app.data;
            }

            for (let item of newItems) {
                // Get type and properties
                const type = this.manager.getType(item._type);
                const properties = this.manager.getProperties(item._type);
                const references = properties ? properties.filter(p => p.type == "reference") : properties;

                const foundKey = _.find(keys, {
                    sid: item._id,
                    _type: item._type
                });

                const oid = uuid.v1();
                if (!foundKey) {
                    keys.push({
                        _type: this.defaults.types._key._type,
                        type: item._type,
                        sid: item._id,
                        oid: oid
                    });

                }
                item._id = foundKey ? foundKey.oid : oid;
                itemsToCreate.push(item);
            }
            if (itemsToCreate) {
                for (let item of itemsToCreate) {
                    const properties = this.manager.getProperties(item._type);
                    const references = properties ? properties.filter(p => p.type == "reference") : properties;

                    if (item._type == this.defaults.types._user._type) {
                        const salt = bcrypt.genSaltSync(10);
                        var hash = bcrypt.hashSync(item[this.defaults.types._user.password], salt);
                        console.log("user password hashed...:", salt, item[this.defaults.types._user.password], hash);
                        item[this.defaults.types._user.password] = hash;
                    }

                    if (references) {
                        for (let reference of references) {
                            if (_.has(item, reference.name)) {

                                const refTypeName = _.get(reference, 'options.type');
                                const refType = this.manager.getType(refTypeName);
                                const childTypes = this.manager.getChildTypes(refTypeName);
                                const baseTypes = this.manager.getBaseTypes(refTypeName);
                                const childTypeNames = childTypes ? childTypes.map(ct => ct.name) : [];
                                const baseTypeNames = baseTypes ? baseTypes.map(bt => bt.name) : [];
                                const allTypes = [refType.name].concat(childTypeNames).concat(baseTypeNames);

                                const foundRefKey = _.find(keys, (key) => {
                                    return key.sid == item[reference.name] && allTypes.indexOf(key.type) > -1
                                });

                                if (!foundRefKey) {
                                    throw new Error("Referenced item not found for type:" + refTypeName + " id:" + item[reference.name]);
                                }
                                else {
                                    item[reference.name] = foundRefKey.oid;
                                    const referenceItem = _.find(itemsToCreate, { _id: item[reference.name] });
                                    const newReferenceItem = repository.setDisplayName(referenceItem);
                                    item[reference.name + '_display'] = newReferenceItem._display;
                                }

                            }
                        }
                    }
                }
            }
        }

        return {
            keys: keys,
            items: itemsToCreate
        }
    }

    /** Public static methods */
    static async readSchema(appsPath, appName) {
        const appSchemaPath = appsPath + "/" + appName + ".json";
        const appSchemaTypesPath = appsPath + "/" + appName + "/types";
        const environmentsPath = appsPath + "/" + appName;

        let appRoot, typeFilesNames = [], environmentFiles = [], builtInTypeFileNames, builtInTypes;
        try {
            const isExistsAppSchemaPath = await utilsAsync.pathExists(appsPath);
            const isExistsAppSchemaFile = await utilsAsync.pathExists(appSchemaPath);
            const isExistsAppSchemaTypesDirectory = await utilsAsync.pathExists(appSchemaTypesPath);
            const isExistsEnvironmentsPath = await utilsAsync.pathExists(environmentsPath);

            builtInTypes = [
                require("../defaults/types/_root"),
                require("../defaults/types/_key"),
                require("../defaults/types/_audit"),
                require("../defaults/types/_role"),
                require("../defaults/types/_permission"),
                require("../defaults/types/_userrole"),
                require("../defaults/types/_user"),
            ]

            if(isExistsAppSchemaPath) {
                if(isExistsAppSchemaFile) {
                    appRoot = await utilsAsync.readJSONFile(appSchemaPath);
                }
                
                if(isExistsAppSchemaTypesDirectory) {
                    typeFilesNames = await utilsAsync.readDirectory(appSchemaTypesPath, true);
                }
                
                if(isExistsEnvironmentsPath) {
                    environmentFiles = await utilsAsync.readDirectory(environmentsPath, false);
                }
            }
            else {
                throw new Error("App path not found!");
            }

            const optionsDefaults = _.get(appRoot, 'options.default.defaults') ? _.assignIn(defaults, appRoot.options.default.defaults ? appRoot.options.default.defaults : {}) : defaults;
            /*
            const types = await Promise.all(
                typeFilesNames.map(tf => utilsAsync.readJSONFile(tf.fullname))
            );
            */
            const typesJSON = typeFilesNames.map(tfn => {
                return Buffer.from(tfn.data, 'base64').toString('utf8');
            });

            /*
            if (!_.every(typesJSON.map(tj => validator.isJSON(tj)), Boolean)) {
                throw new Error("Error in types JSON! Check it!")
            }
            */

            const types = typesJSON.map(tj => JSON.parse(tj));

            environmentFiles || (environmentFiles = []);
            const environments = environmentFiles.map(ef => JSON.parse(Buffer.from(ef.data, 'base64').toString('utf8')));

            let schema = Object.assign({}, appRoot);

            typeFilesNames || (typeFilesNames = []);
            
            const keyTypeFileObject = _.find(typeFilesNames, { name: optionsDefaults.types._key._type + ".json" });
            const rootTypeFileObject = _.find(typeFilesNames, { name: optionsDefaults.types._root.__type + ".json" });
            const auditTypeFileObject = _.find(typeFilesNames, { name: optionsDefaults.types._audit._type + ".json" });
            const userTypeFileObject = _.find(typeFilesNames, { name: optionsDefaults.types._user._type + ".json" });
            const roleTypeFileObject = _.find(typeFilesNames, { name: optionsDefaults.types._role._type + ".json" });
            const userRoleTypeFileObject = _.find(typeFilesNames, { name: optionsDefaults.types._userrole._type + ".json" });
            const permissionTypeFileObject = _.find(typeFilesNames, { name: optionsDefaults.types._permission._type + ".json" });

            let indexKeyTypeFile;
            if (keyTypeFileObject)
                indexKeyTypeFile = typeFilesNames.indexOf(keyTypeFileObject);
            if (indexKeyTypeFile == -1)
                throw new Error("Key type file not found. Please once set in _defaults.json");

            const keyType = types[indexKeyTypeFile];
            
            appRoot.load || (appRoot.load = {});
            appRoot.load.types || (appRoot.load.types = []);
            appRoot.load.data || (appRoot.load.data = []);
            appRoot.load.views || (appRoot.load.views = []);

            const builtInTypeNames = [];
            
            if(appRoot.options.default.type) {
                builtInTypeNames.push(optionsDefaults.types._root.__type);
            }

            builtInTypeNames.push(optionsDefaults.types._key._type);

            if(_.get(appRoot, 'options.audit')) {
                builtInTypeNames.push(optionsDefaults.types._audit._type);
            }

            if(_.get(appRoot, 'options.authorization.use') && 
                (appRoot.options.authorization.use.indexOf("user") != -1 || 
                appRoot.options.authorization.use.indexOf("role") != -1)) {
                    builtInTypeNames.push(optionsDefaults.types._user._type)
            }

            if(_.get(appRoot, 'options.authorization.use') && 
                appRoot.options.authorization.use.indexOf("role") != -1) {
                    builtInTypeNames.push(optionsDefaults.types._role._type);
                    builtInTypeNames.push(optionsDefaults.types._permission._type)
            }

            if(_.get(appRoot, 'options.authorization.use') && 
                appRoot.options.authorization.use.indexOf("role") != -1 && 
                appRoot.options.authorization.role.multiple == true) {
                    builtInTypeNames.push(optionsDefaults.types._userrole._type)
            }

            if(appRoot.types) {
                for(let typeName of builtInTypeNames) {
                    const foundType = _.find(appRoot.types, { name: typeName });

                    if(!foundType) {
                        builtInTypes.push(foundType);
                    }
                }
            }

            schema.options || (schema.options = {});
            schema.options.default || (schema.options.default = {});

            schema.options.default.defaults =
                _.assignIn({}, appRoot.options.default.defaults
                    ? optionsDefaults
                    : defaults);

            if(!_.has(schema.options, 'cache')) {
                schema.options.cache = true;
            }

            //console.log(builtInTypeNames);
            
            if(!appRoot.types) {
                const allTypes = builtInTypes.concat(types);
                schema.types = _.uniq(builtInTypeNames.concat(appRoot.load.types))
                    .map(t => _.find(allTypes, (typ) => typ.name == t));
            }
            else {
                const keyType = _.find(builtInTypes, { name: schema.options.default.defaults.types._key._type });
                schema.types = _.uniqBy([keyType].concat(builtInTypeNames.map(typeName => _.find(builtInTypes, { name: typeName }))).concat(appRoot.types), 'name');
            }
            
            for (const [index, environmentFile] of environmentFiles.entries()) {
                const onlyName = path.parse(environmentFile.name).name;
                if(!schema[onlyName])
                    schema[onlyName] = environments[index];
            }


            return schema;
        }
        catch (error) {
            errorLogger.log(error);
        }
    }

    /** Private static methods */
    async readDefaultDataFiles(dataPath) {
        // Read all data files in data directory
        let dataFiles;
        const isExistsAppPath = await utilsAsync.pathExists(dataPath);

        if(isExistsAppPath) {
            const dataFilesNames = await utilsAsync.readDirectory(dataPath, true);
            dataFiles = dataFilesNames.map(dfn => JSON.parse(Buffer.from(dfn.data, 'base64').toString('utf8')));
            
            for (let items of dataFiles) {
                // Detect type of items
                const index = dataFiles.indexOf(items);
                const _type = dataFilesNames[index].name.split('.')[0];

                for (let item of items) {
                    if (!item._type) {
                        item._type = _type;
                    }
                    items[items.indexOf(item)] = item;
                    dataFiles[index] = items;
                }
            }
            
        }
        
        /*
        if (!_.every(dataFiles.flat().map(ni => this.manager.isAppType(ni._type)), Boolean)) {
            throw new Error("Unknown types detected in items!");
        }
        */

        return dataFiles;
    }
}

module.exports = Application;