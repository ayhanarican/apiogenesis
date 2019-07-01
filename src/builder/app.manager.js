const _ = require("lodash");
const defaults = require("../defaults/defaults");
const utils = require("../helpers/utils");
const uuid = require("node-uuid");
const slug = require("slug");

class AppManager {

    constructor(app) {
        this.app = JSON.parse(JSON.stringify(app));

        for (let type of this.app.types) {
            if (type) {
                if (_.get(type, 'inherit')) {
                    type.base = null;
                }

                if (!_.has(type, 'inherit')) {
                    type.inherit = true;
                }

                if (!_.has(type, 'abstract')) {
                    type.abstract = false;
                }

                const rootChildTypes = _.filter(this.types, {
                    base: this.app.options.default.defaults.types._root.__type
                });
                const rootChildTypesNames = rootChildTypes.map(ct => ct.name);

                if (this.app.options.default.type &&
                    typeof type.base === 'undefined' &&
                    (this.app.options.default.type == this.app.options.default.defaults.types._root.__type ||
                        rootChildTypesNames.indexOf(this.options.default.type) != -1) &&
                    type.name != this.app.options.default.defaults.types._root.__type &&
                    rootChildTypesNames.indexOf(type.name) == -1 &&
                    this.isAppType(this.app.options.default.defaults.types._root.__type)) {
                    type.base = '_root';
                }

                if (!type.base) {
                    type._level = 0;
                } else {
                    const bases = this.getBaseTypes(type.name);
                    if (bases.length) {
                        type._level = bases[0]._level - 1;
                    }
                }

                if (!_.get(this.app, 'options.authorization.use') ||
                    (_.get(this.app, 'options.authorization.use') &&
                        this.app.options.authorization.use.indexOf('user') == -1 ||
                        this.app.options.authorization.use.indexOf('role') == -1)) {
                    type.public = true;
                }

                this.app.types[this.app.types.indexOf(type)] = this.setOwnerForProperties(type);

            }
        }

        this.getTypes = this.getAllTypes;
    }

    setOwnerForProperties(type) {
        if (type.properties) {
            for (let property of type.properties) {
                type.properties[type.properties.indexOf(property)]._owner = type.name
            }
        }

        return type;
    }

    getAllTypes() {
        const types = [];
        if (this.app.types) {
            for (let typ of this.app.types) {
                if (typ && typ.name) {
                    const type = this.getType(typ.name);
                    types.push(type);
                }
            }
        }

        return types;
    }

    getType(typeName) {
        const type = _.find(this.app.types, {
            name: typeName
        });

        let typeWithChangedOptions = _.extend({}, type);
        if (typeWithChangedOptions.base && utils.isTemplate(typeWithChangedOptions.base)) {
            const baseInterpolated = utils.interpolate(typeWithChangedOptions.base, this.getDefaultScope(typeWithChangedOptions));
            typeWithChangedOptions.base = baseInterpolated;
        }
        let bases = this.getBaseTypes(typeName);

        if (bases) {
            for (let base of bases) {
                const tree = _.get(base, 'options.tree');
                if (tree)
                    typeWithChangedOptions.options.tree = tree;
            }
        }

        if (!_.every(typeWithChangedOptions.properties, (property) => _.has(property, 'order'))) {
            let order = 0;
            const properties = typeWithChangedOptions.properties;
            for (let property of properties) {
                property.order = ++order;
                let options = _.get(property, 'options')

                if (options && options.type && utils.isTemplate(options.type)) {
                    property.options.type =
                        utils.interpolate(
                            options.type,
                            this.getDefaultScope(typeWithChangedOptions, property)
                        );
                }

                if (options.default && utils.isTemplate(options.type)) {
                    property.options.default =
                        utils.interpolate(
                            property.options.default,
                            this.getDefaultScope(typeWithChangedOptions, property)
                        );
                }

                typeWithChangedOptions.properties[properties.indexOf(property)] = property;
            }
        }



        return typeWithChangedOptions;
    }

    getBaseTypes(typeName) {
        const type = _.find(this.app.types, {
            name: typeName
        });

        let bases = [],
            base;

        if (type) {
            if (type.base) {
                base = _.find(this.app.types, {
                    name: type.base
                });
                if (base) {
                    base._level = 0;
                    base._level++;
                    bases.push(base);
                    while (base && base.base) {
                        const priorLevel = base._level;
                        base = _.find(this.app.types, {
                            name: base.base
                        });
                        if (base) {
                            base._level = priorLevel + 1;
                            bases.push(base);
                        }
                    }
                }
            }
        }

        return bases && bases.length > 0 ? _(bases).reverse().value() : bases;
    }

    getRootType(typeName) {
        // Get once base types
        const bases = this.getBaseTypes(typeName);
        let rootType;

        let firstBaseIndex = 0,
            rootChildTypesNames = [];

        if (this.app.options.default.type) {
            rootChildTypesNames = this.getChildTypes(this.app.options.default.type).map(ct => ct.name);
            firstBaseIndex = 1 +
                (this.app.options.default.type != this.app.options.default.defaults.types._root.__type ?
                    rootChildTypesNames.length :
                    0)
        }

        // if result contains element and set first element to return
        if (bases && bases.length)
            rootType = this.app.options.default.type && this.isAppType(this.app.options.default.type) ?
            (bases.length > 1 ? bases[firstBaseIndex] : null) :
            bases[0];

        return rootType;

    }

    getChildTypes(typeName, all) {
        const type = this.getType(typeName);
        all || (all = [])
        if (type) {
            const types = [].concat(this.app.types);
            const childTypes = _.filter(types, {
                base: type.name
            });
            if (childTypes.length > 0) {
                for (let childType of childTypes) {
                    all.push(childType);
                    all.concat(this.getChildTypes(childType.name, all));
                }
            }
        }

        return all;
    }

    getTypeWithChildTypes(typeName) {
        const type = this.getType(typeName);
        const childTypes = this.getChildTypes(typeName);

        let all = [];

        if (type) {
            all.push(type);
        }

        if (childTypes.length)
            all.push(...childTypes);

        return all;
    }

    getProperties(typeName) {
        const type = this.getType(typeName);
        const bases = this.getBaseTypes(typeName);

        let properties, propertyInType, all;

        if (type && bases) {
            for (let base of bases) {
                if (base && base.properties) {
                    properties || (properties = []);
                    for (let property of base.properties) {
                        if (type.properties) {
                            propertyInType = _.find(type.properties, {
                                name: property.name
                            });
                            if (!propertyInType) {
                                properties.push(property);
                            }
                        }
                    }
                }
            }
        }


        if (properties)
            all = properties.concat(type.properties);
        else
            all = type.properties;

        all || (all = []);

        return all && _.every(all, p => p.order) ? _.sortBy(all, ["order"]) : all;
    }

    getStorableProperties(typeName) {
        const properties = this.getProperties(typeName);

        return properties.filter(p => ["collection", "calculated"].indexOf(p.type) == -1);
    }

    getProperty(typeName, name) {
        const properties = this.getProperties(typeName);

        return _.find(properties, {
            name: name
        });
    }

    getPathDefaultValue(typeName, path) {
        // Split path for detect own type
        const paths = path.split('.')
        let oTypeName = typeName,
            property

        for (let path of paths) {
            if (oTypeName) {
                let cpath = path

                if (path.indexOf('[') != -1) {
                    const rx = /(.*)\[(.*)\]$/g
                    const exected = rx.exec(path)
                    cpath = exected[1]
                }

                property = this.getProperty(oTypeName, cpath)
                if (["object", "array", "reference", "collection"].indexOf(property.type) != -1) {
                    oTypeName = _.get(property, 'options.type')
                }
            }
        }

        const defaultTemplate = property ? _.get(property, 'options.default') : property

        return utils.isTemplate(defaultTemplate) ?
            utils.interpolate(defaultTemplate) :
            defaultTemplate

    }

    isAppType(typeName) {
        return this.getAllTypes().map(type => type.name).indexOf(typeName) != -1
    }

    isReference(typeName, propertyName) {
        const type = this.getType(typeName);
        const properties = this.getProperties(typeName);
        const foundReference = _.find(properties, {
            name: propertyName,
            type: 'reference'
        });

        return foundReference ? true : false
    }

    getPathTypeName(typeName, path) {
        let properties = this.getProperties(typeName);
        const paths = path.split('.');
        let pathType;
        if (paths.length == 1) {
            const prop = _.find(properties, {
                name: paths[0]
            });
            return _.get(prop, 'type');
        } else {
            for (let p of paths) {
                const prop = _.find(properties, {
                    name: p
                });
                if (prop) {
                    pathType = _.get(prop, 'options.type') || _.get(prop, 'type')
                    if (pathType && this.isAppType(pathType)) {
                        properties = this.getProperties(pathType);
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
        }

        return pathType;
    }

    isTreeReference(typeName, propertyName) {
        const type = this.getType(typeName);

        return this.isReference(typeName, propertyName) &&
            type.options &&
            type.options.tree &&
            type.options.tree.parent == propertyName;
    }

    checkProperties(typeName, data, includeTypeName, includeId) {
        const type = this.getType(typeName);
        const properties = this.getProperties(typeName);
        const propertyNames = properties.map(p => p.name);

        if (includeTypeName) {
            propertyNames.push("_type");
        }

        if (includeId)
            propertyNames.push("_id");

        propertyNames.push("test");

        const keys = Object.keys(data);

        return this.app.options.strict == true ?
            _.every(keys.map(key => propertyNames.indexOf(key) > -1), Boolean) :
            true;
    }

    getUnknownProperties(typeName, data, includeTypeName, includeId) {
        const type = this.getType(typeName);
        const properties = this.getProperties(typeName);
        const propertyNames = properties.map(p => p.name);

        if (includeTypeName) {
            propertyNames.push("_type");
        }

        if (includeId)
            propertyNames.push("_id");

        propertyNames.push("test");

        const keys = Object.keys(data);
        const props = keys.filter(d => propertyNames.indexOf(d) == -1);

        return props.length ? props : null;
    }

    clearBuiltInData(typeName, data, includeTypeName, includeId) {
        const newData = JSON.parse(JSON.stringify(data));
        const {
            _id,
            _type,
            _default,
            _createdAt,
            _modifiedAt,
            _createdBy,
            _modifiedBy
        } = newData;

        const unknowns = this.getUnknownProperties(typeName, data, includeTypeName, includeId)

        for (let prop in unknowns) {
            delete newData[prop];
        }

        return newData;
    }

    clearObjectData(typeName, data) {
        if (data) {
            const properties = this.getProperties(typeName);
            const objectProperties = properties.filter(p => p.type == 'object' || p.type == 'array');
            for (let objectProperty of objectProperties) {
                const objectDataTypeName = _.get(objectProperty, 'options.type');
                let allObjectProperties;
                if (objectDataTypeName) {
                    const objectDataChildTypes = this.getChildTypes(objectDataTypeName);
                    allObjectProperties = this.getProperties(objectDataTypeName);
                    if (objectDataChildTypes.length) {
                        for (let objectDataChildType of objectDataChildTypes) {
                            const objectDataProperties = this.getProperties(objectDataChildType.name);
                            allObjectProperties.push(...objectDataProperties);
                        }
                    }

                    if (data[objectProperty.name]) {
                        if (objectProperty.type == 'object') {
                            for (let prop in data[objectProperty.name]) {
                                if (allObjectProperties.map(p => p.name).indexOf(prop) == -1) {
                                    delete data[objectProperty.name][prop];
                                }
                            }
                        } else if (objectProperty.type == 'array') {
                            for (let doc of data[objectProperty.name]) {
                                for (let prop in doc) {
                                    if (allObjectProperties.map(p => p.name).indexOf(prop) == -1) {
                                        delete doc[prop];
                                    }
                                }
                                data[objectProperty.name][data[objectProperty.name].indexOf(doc)] = doc;
                            }
                        }
                    }

                    for (let oProperty of allObjectProperties) {
                        const oTypeName = _.get(oProperty, 'options.type');
                        if (oTypeName) {
                            if (oProperty.type == 'object') {
                                data[objectProperty.name][oProperty.name] = this.clearObjectData(oTypeName, data[objectProperty.name][oProperty.name]);
                            } else if (oProperty.type == 'array') {
                                for (let doc of data[objectProperty.name][oProperty.name]) {
                                    doc = this.clearObjectData(oTypeName, doc);
                                    data[objectProperty.name][oProperty.name][data[objectProperty.name][oProperty.name].indexOf(doc)] = doc;
                                }
                            }
                        }
                    }
                }
            }
        }

        return data;
    }

    getBuiltInData(typeName, data, includeTypeName, includeId) {
        const newData = JSON.parse(JSON.stringify(data));
        const {
            _id,
            _type,
            _default,
            _createdAt,
            _modifiedAt,
            _createdBy,
            _modifiedBy
        } = newData;

        const additional = {
            _id,
            _type,
            _createdAt,
            _modifiedAt,
            _createdBy,
            _modifiedBy
        };

        if (typeof _default !== 'undefined')
            additional._default = _default;

        if (!includeTypeName)
            delete additional._type;

        if (!includeTypeName)
            delete additional._id;


        return additional;
    }

    getDefaultScope(type, property) {
        return {
            $defaults: (_.assignIn(_.get(this.app, 'options.default.defaults') ?
                this.app.options.default.defaults :
                {})),
            $app: this.app,
            $type: type,
            $property: property,
            get $now() {
                return new Date();
            },
            $getDate: () => {
                return new Date();
            },
            $uuid: uuid,
            $slug: slug,
            _: _
        }
    }
}

module.exports = AppManager;