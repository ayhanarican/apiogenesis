const mongoose = require("mongoose");
mongoose.set('runValidators', true);
const mongoomise = require("mongoomise");
const validate = require("mongoose-validator");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");

//const extend = require("mongoose-schema-extend");
const _ = require("lodash");
const pluralize = require('pluralize')

const AppManager = require("../builder/app.manager");

const BaseClass = require("../base/base");
const mongooseUnique = require("./unique");
const getStringValidations = require("./string.validations");
const getValidators = require("./validators");
const mongooseErrors = require("./errors");
const mongooseVirtualsCollections = require("./virtuals.collections");
const mongooseVirtualsDisplay = require("./virtuals.display");
const mongooseVirtualsCalculated = require("./virtuals.calculated");

const VirtualCollections = require("./virtuals.collections");

const MyLogger = require("../helpers/myLogger");
const myLogger = new MyLogger(false);


const uuid = require("node-uuid");
const slug = require("slug");

const defaults = require("../defaults/defaults");

const Mixed = mongoose.SchemaTypes.Mixed;

const fieldTypes = {
    string: String,
    localized: Mixed,
    number: Number,
    boolean: Boolean,
    date: Date,
    object: Mixed,
    array: Mixed,
    mixed: Mixed,
    reference: String,
    collection: undefined,
    calculated: String
}

class MongooseSchemaBuilder extends BaseClass {
    constructor(app, orgName, locale, dbUri) {
        if (!app || !orgName || !locale)
            throw new Error("app, orgName, locale parameters can not be null");
        super();
        // Setting mongodb uri when dbUri is null
        dbUri || (dbUri = "mongodb://localhost:27017/" + orgName + "_" + app.name);

        this.app = app;
        this.dbUri = dbUri;
        this.locale = locale;

        this.manager = new AppManager(this.app);

        this.fieldTypes = {};
        const fieldTypeNames = Object.keys(fieldTypes);
        this.fieldTypeNames = fieldTypeNames;
        for (let fieldTypeName of fieldTypeNames) {
            this.fieldTypes[fieldTypeName] = fieldTypeName;
        }

        this.optionsDefaults = _.assignIn(defaults, _.get(this.app, 'options.default.defaults')
            ? this.app.options.default.defaults
            : {});
        this.buildSchemas();
    }

    buildSchemas() {
        // Get all types in app
        const types = this.manager.getAllTypes();
        if (!this.connection) {
            this.connection = mongoose.createConnection(this.dbUri, { useNewUrlParser: true });
            this.connection.once('open', () => {
                console.log(`Connect ${this.app.name} database`);
            })
        }

        if (types) {
            // Setting type count for properties of schemas and models
            this.schemas = {};
            this.models = {};
            this.metaSchemas = {};
            // Create schemas for all types
            for (let type of types) {
                let Schema;
                if (!type.base || type.base == this.app.options.default.defaults.types._root.__type) {
                    // Create mongoose schema for root types
                    Schema = this.schemas[type.name] = this.buildSchema(type.name, false);
                }
                else {
                    // Extend schema for inherited types
                    Schema = this.schemas[type.name] = this.buildSchema(type.name, true);
                }

                Schema.plugin(require('mongoose-autopopulate'));

                const properties = this.manager.getProperties(type.name);
                const collections = properties.filter(p => p.type == 'collection');
                const calculateds = properties.filter(p => p.type == 'calculated')

                Schema.plugin(mongooseVirtualsCollections, {
                    app: this.app,
                    type: type,
                    collections: collections
                });
                
                for(let property of calculateds) {
                    Schema.plugin(mongooseVirtualsCalculated, {
                        app: this.app,
                        type: type,
                        property: property,
                        locale: this.locale
                    });
                }
                
                Schema.plugin(mongooseVirtualsDisplay, {
                    app: this.app,
                    type: type,
                    locale: this.locale,
                    displayNameProperty: '_display'
                });

                let EntityModel;
                if(!type.abstract) {
                    EntityModel = this.models[type.name] = this.connection.model(type.name, this.schemas[type.name]);
                }

                const uniqueMessage = _.get(this.app, 'errors.mongooseValidationUnique');

                if (uniqueMessage)
                    Schema.plugin(mongooseUnique, { message: uniqueMessage[this.locale] });
                else
                    Schema.plugin(mongooseUnique);

                const somePlugin = (schema) => {
                    schema.pre('create', () => {
                        console.log('in pre create');
                    });
                }
                
                Schema.plugin(somePlugin);
                
                Schema.set('toObject', { virtuals: true });
                Schema.set('toJSON', { virtuals: true });
            }
        }

        mongoomise.promisifyAll(this.connection, require('bluebird'))
        this.isAllSchemasBuilded = true;
    }

    buildSchema(typeName, hasBaseType) {
        const type = this.manager.getType(typeName);
        const rootType = this.manager.getRootType(typeName);
        const baseTypes = this.manager.getBaseTypes(typeName);
        
        let Schema, rootChildTypeNames;

        if(this.app.options.default.type) {
            rootChildTypeNames = this.manager.getChildTypes(this.app.options.default.defaults.types._root.__type)
        }
        
        const options = {
            name: typeName,
            discriminatorKey: "_type",
            versionKey: false,
            id: false,
            abstract: type.abstract
        }

        const collection = _.get(type, 'options.collection');

        if (typeof collection == "string" && 
            !_.isEmpty(collection) && 
            (!rootType || 
                (rootType.name != this.app.options.default.defaults.types._root.__type && 
                    rootChildTypeNames.indexOf(rootType.name) == -1))) {
            options.collection = collection;
        }
        else if (collection && collection.localized == true) {
            options.collection = slug(hasBaseType
                ? rootType.plural[this.locale]
                : type.plural[this.locale], { lower: _.has(collection, 'lower') ? collection.lower : true })
        }
        else if (!type.abstract) {
            options.collection = rootType
                ? pluralize(rootType.name)
                : pluralize(type.name);
        }

        if (hasBaseType == true) {
            let extentedSchema = this.buildDefaultMetaSchema(type.name);

            if (baseTypes) {
                for (let baseType of baseTypes) {
                    if(!!type.inherit) {
                        extentedSchema = _.assignIn(extentedSchema, this.buildMetaSchema(baseType.name));
                    }
                }
            }

            extentedSchema = _.assignIn(extentedSchema, this.buildMetaSchema(type.name));
            
            Schema = new mongoose.Schema(extentedSchema, {
                ...options
            });
        }
        else {
            let extentedSchema = this.buildDefaultMetaSchema(type.name);
            const _rootType = this.manager.getType(this.app.options.default.defaults.types._root.__type)

            if (baseTypes) {
                for (let baseType of baseTypes) {
                    if (baseType.base != null && !!type.inherit) {
                        extentedSchema = _.assignIn(extentedSchema, this.buildMetaSchema(baseType.name));
                    }
                }
            }

            extentedSchema = _.assignIn(extentedSchema, this.buildMetaSchema(type.name));

            Schema = new mongoose.Schema(extentedSchema, {
                ...options
            });
        }

        return Schema;
    }

    buildMetaSchema(typeName, noId) {
        // Setting default document properties for schema
        const manager = new AppManager(this.app);
        const rootType = manager.getRootType(typeName);

        let schema = noId ? {} : this.buildDefaultMetaSchema(typeName /*,rootType ? true : false*/);
        schema = _.assignIn({}, this.createMetaSchemaProperties(typeName));

        return schema;
    }

    buildDefaultMetaSchema(typeName) {
        return this.app.options.default.type ? {
            _id: { type: String, uniqe: true, required: true, default: uuid.v1 }
        } : {
                _id: { type: String, uniqe: true, required: true, default: uuid.v1 },
                _type: { type: String, required: true, default: () => '' },
                _default: { type: Boolean, default: () => false },
                _createdAt: { type: Date, required: true, default: () => (new Date()) },
                _modifiedAt: { type: Date, required: true, default: () => (new Date()) },
                _createdBy: { type: String, ref: this.app.options.default.defaults.types._user._type, default: () => null },
                _modifiedBy: { type: String, ref: this.app.options.default.defaults.types._user._type, default: () => null },
            };

    }

    createMetaSchemaProperties(typeName, includeChildTypeProperties) {
        const manager = new AppManager(this.app);
        const type = manager.getType(typeName);
        let properties = manager.getStorableProperties(typeName);
        
        if(includeChildTypeProperties) {
            const childTypes = manager.getChildTypes(typeName);
            for(let childType of childTypes){
                const childTypeProperties = manager.getProperties(childType.name);
                properties.push(...childTypeProperties);
            }
            properties = _.uniqBy(properties, (p) => {
                return p.name;
            });
        }
        
        const schemaProperties = {};

        if (type && properties) {
            const references = properties.filter(p => p.type == "reference");

            for (let reference of references) {
                schemaProperties[reference.name + '_display'] = { type: String, select: false }
            }

            const primitiveProperties = properties

            for (let primitiveProperty of primitiveProperties) {
                let schemaProperty = {};
                const optionsType = _.get(primitiveProperty, 'options.type') || '';
                if (!manager.isAppType(optionsType) || primitiveProperty.type == this.fieldTypes.reference) {
                    schemaProperties[primitiveProperty.name] = this.createMetaSchemaProperty(type, primitiveProperty);
                }
                else {
                    const objectTypeName = _.get(primitiveProperty, 'options.type');
                    if (primitiveProperty.type == this.fieldTypes.object) {
                        schemaProperties[primitiveProperty.name] = this.createMetaSchemaProperties(objectTypeName, true);
                    }
                    else if (primitiveProperty.type == this.fieldTypes.array) {
                        schemaProperties[primitiveProperty.name] = [this.createMetaSchemaProperties(objectTypeName, true)];
                    }
                    else if (primitiveProperty.type != this.fieldTypes.reference) {
                        //throw new Error("Primitive properties can not be typed! Pelease delete property.options.type!");
                    }
                }

                schemaProperties['test'] = {
                    type: String,
                    validate: {
                        validator: function (value) {
                            return /^[A-Za-z0-9-çğıöşüÇĞİÖŞÜ]+$/g.test(value);
                        },
                        message: props => `${props.value} is not a valid text!`
                    },
                }
            }
        }

        return schemaProperties;
    }

    createMetaSchemaProperty(type, primitiveProperty) {
        let schemaProperty = {
            type: fieldTypes[primitiveProperty.type]
        };

        if (primitiveProperty.type == "reference" && _.get(primitiveProperty, 'options.type')) {
            schemaProperty.ref = primitiveProperty.options.type;
            if (_.get(type, 'options.autopopulate') === true || _.get(primitiveProperty, 'options.autopopulate') === true) {
                schemaProperty.autopopulate = true;
            }
        }

        const uniqueMessage = _.get(this.app, 'options.default.defaults.errors.mongooseValidationUnique');
        schemaProperty.unique = primitiveProperty.options &&
            primitiveProperty.options.unique
            ? (primitiveProperty.options.unique.message
                ? primitiveProperty.options.unique.message[this.locale]
                : uniqueMessage ? uniqueMessage[this.locale] : true)
            : false;

        schemaProperty.uniqueCaseInsensitive = primitiveProperty.options &&
            primitiveProperty.options.unique &&
            primitiveProperty.options.unique.insensitive ? true : false;

        const requiredMessage = _.get(this.app, 'options.default.defaults.errors.mongooseValidationRequired');
        schemaProperty.required = primitiveProperty.options &&
            primitiveProperty.options.required
            ? (primitiveProperty.options.required.message
                ? primitiveProperty.options.required.message
                : requiredMessage ? requiredMessage[this.locale] : true)
            : false;

        const allOptions = Object.freeze(['select']);

        for (let option of allOptions) {
            if (primitiveProperty.options && _.has(primitiveProperty.options, option)) {
                schemaProperty[option] = primitiveProperty.options[option];
            }
        }

        const stringOptions = Object.freeze([
            'trim',
            'lowercase',
            'uppercase',
            'minLength',
            'maxLength'
        ]);

        for (let option of stringOptions) {
            if (primitiveProperty.type == "string" &&
                primitiveProperty.options &&
                _.has(primitiveProperty.options, option)) {
                schemaProperty[option] = primitiveProperty.options[option];
            }
        }

        const numberOptions = Object.freeze(['min', 'max']);

        for (let option of numberOptions) {
            if (primitiveProperty.type == "number" &&
                primitiveProperty.options &&
                _.has(primitiveProperty.options, option)) {
                schemaProperty[option] = primitiveProperty.options[option];
            }
        }

        if (primitiveProperty.options && _.has(primitiveProperty.options, 'default')) {
            schemaProperty.default = () => primitiveProperty.options.default;
        }

        const validators = getValidators(this, this.app, type, primitiveProperty, this.locale);

        if (validators && validators.length) {
            schemaProperty.validate = validators;
        }

        return schemaProperty;

    }

    noneChangableSchemaPropertyNames() {
        return this.app.options.default.defaults.properties;
    }

    noneChangableSchemaTypeNames() {
        return [this.app.options.default.defaults.types._key._type, this.app.options.default.defaults.types._audit._type];
    }
}

module.exports = MongooseSchemaBuilder;