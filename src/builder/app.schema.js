const {
    Schema,
    array,
    boolean,
    integer,
    number,
    object,
    schema,
    string,
    Validator
  } = require("typed-json-schema");
const { ext } = require("typed-json-schema/ext");
const BaseClass = require("../base/base");
const utilsAsync = require("../helpers/utils.async");
const _ = require("lodash");

class AppSchema extends  BaseClass {
    constructor(app, locales) {
        super();
        if(!app)
            throw new Error("app parameter is not be null");
           
        if(!locales)
            throw new Error("locales parameter is not be null");
        
        if(!_.every(app.types.map(type => _.isPlainObject(type)), Boolean)) {
            //throw new Error("Invalid app types! Please check types!");
        }
        
        this.app = app; 
        this.typeNames = app.types.filter(type => _.isPlainObject(type)).map(typ => typ.name);

        this.propertyTypes = AppSchema.propertyTypeNames();
        this.locales = locales;
        this.localeCodes = this.locales.map(locale => locale.symbol);
        this.schema = this.getAppSchema(this.app);
    }

    static propertyTypeNames() {
        return [
            "string", 
            "number", 
            "boolean", 
            "date", 
            "object", 
            "array", 
            "localized", 
            "mixed", 
            "reference", 
            "collection", 
            "calculated"
        ]
    }

    /**
     * 
     * @param { boolean | string[] } required // like ["en", "tr"]
     */
    getLocalizedObject(required) {
        let localizedObject;

        if(this.locales) {
        
            localizedObject = {}
            for(let locale of this.localeCodes){
                localizedObject[locale] = string;
            }

        }

        const requires = required &&
                        (_.isArray(required) && 
                        _.every(required, (l) => _.isString(l)) && 
                        _.every(required, (l) => this.localeCodes.indexOf(l) > -1))
            ? required 
            : this.localeCodes;

        return required 
                ? object.properties(localizedObject).required(...requires)
                : object.properties(localizedObject);
    }

    getAppSchema(value) {
        return object.properties({
            name: string,
            version: string,
            title: this.getLocalizedObject().allowNull(),
            locales: array(string.enum(this.localeCodes)),
            load: this.getLoadSchema(value ? value.load : null),
            options: this.getAppOptionsSchema(value ? value.options : null),
            types: array(this.getTypeSchema(value ? value.types : null))
        }).required("name", "version", "options", "locales", "types");
    }

    getLoadSchema(value) {
        return object.properties({
            types: array(string),
            data: array(string),
            views: array(string),
        });
    }

    getAppOptionsSchema(value) {
        return object.properties({
            strict: boolean,
            audit: boolean,
            cache: boolean,
            dbUri: string.allowNull(),
            default: this.getAppOptionsDefaultsSchema(value && value.default ? value.default : null),
            readonly: boolean,
            authorization: object,
            authentication: object
        });
    }

    getAppOptionsDefaultsSchema(value) {
        return object.properties({
            locale: string.enum(this.localeCodes),
            user: integer.allowNull(),
            type: string.enum(this.typeNames).allowNull(),
            view: string.allowNull(),
            defaults: object
        }).required("locale");
    }

    getTypeSchema(value) {
        return object.properties({
            name: string.pattern(/[A-Za-z0-9\_]+/),
            base: string.enum(this.typeNames).allowNull(),
            singular: this.getLocalizedObject(),
            plural: this.getLocalizedObject(),
            options: this.getTypeOptionsSchema(value ? value.options : null),
            properties: array(this.getPropertySchema())
        }).required("name", "singular", "plural");
    }

    getTypeOptionsSchema(value) {
        return object.optional("display", "populate", "tree").properties({
            display: string.allowNull(),
            populate: object.properties({
                find: array(this.getTypeOptionsPopulateSchema()),
                findOne: array(this.getTypeOptionsPopulateSchema())
            }).allowNull(),
            tree: this.getTypeOptionsTreeSchema(value ? value.tree : null).allowNull(),
        }).allowNull();
    }

    getTypeOptionsTreeSchema(value) {
        return object.required("parent", "children", "maxDepth").properties({
            parent: string,
            children: string,
            maxDepth: integer
        }).allowNull();
    }

    getTypeOptionsPopulateSchema(value) {
        return object.properties({
            path: string,
            populate: array(object).allowNull()
        });
    }

    getPropertySchema(value, manager) {
        return object.properties({
            name: string.pattern(/[A-Za-z0-9\_]+/),
            type: string.enum(this.propertyTypes),
            title: this.getLocalizedObject(true).allowNull(),
            options: this.getPropertyOptionsSchema(value ? value.options : null, manager).allowNull(),
            order: integer
        }).required("name", "type");
    }

    getPropertyOptionsSchema(value, manager) {
        return object.optional("reference", "collection").properties({
            unique:  schema.type(['boolean', 'string', 'object']).allowNull(),
            required: schema.type(['boolean', 'string', 'object']).allowNull(),
            select: boolean.allowNull(),
            trim: boolean.allowNull(),
            lowercase: boolean.allowNull(),
            uppercase: boolean.allowNull(),
            minLength: integer.allowNull(),
            maxLength: integer.allowNull(),
            min: number.allowNull(),
            max: number.allowNull(),
            enum: array(string).allowNull(),
            type: string.allowNull(),
            //reference: this.getPropertyOptionsReferenceSchema(),
            //collection: this.getPropertyOptionsCollectionSchema(),
            options: object.allowNull(),
            validations: array(this.getValidationSchema()).allowNull(),
        });
    }

    getPropertyOptionsReferenceSchema(value, options, manager) {
        const propertyNames = value && value.type 
            ? manager.getProperties(options.type).map(p => p.name) 
            : [];
        const enumType = propertyNames.length ? string.enum(propertyNames) : string;
        
        return object.required("type", "property").properties({
            type: string.enum(this.typeNames),
            property: enumType
        });
    }

    getPropertyOptionsCollectionSchema(value, options, manager) {
        const propertyNames = value && value.type 
            ? manager.getProperties(value.type).map(p => p.name) 
            : [];
        const enumType = propertyNames.length ? string.enum(propertyNames) : string;
        
        return object.optional("property", "reference").properties({
            type: string.enum(this.typeNames),
            property: enumType,
            //reference: this.getPropertyOptionsReferenceSchema(value ? value.reference : null, manager).allowNull(),
        });
    }

    getValidationSchema() {
        return object.required("validator", "message").properties({
            validator: string,
            arguments: schema.type(['array', 'string']).allowNull(),
            message: this.getLocalizedObject(),
            passIfEmpty: boolean,
            async: boolean
        });
    }

    /**
     * 
     * @param {any} options 
     */
    validator(options) {
        return new Validator(options);
    }

    async validate() {
        try {
            const app = await (new Validator({ allErrors: true })).validate(this.schema, this.app);
            return app;
        }
        catch(error) {
            await utilsAsync.handleError(error);
            throw error;
        }
    }
}

module.exports = AppSchema;