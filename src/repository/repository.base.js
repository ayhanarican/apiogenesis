const mongoose = require("mongoose");
const _ = require("lodash");
const uuid = require("node-uuid");
const validator = require("validator");
const BaseClass = require("../base/base");
const AppManager = require("../builder/app.manager");

const utilsAsync = require("../helpers/utils.async");
const mongooseErrors = require("../mongoose/errors");
const MyLogger = require("../helpers/myLogger");
const myLogger = new MyLogger(false);

const CreateError = require("../errors/createError");

class RepositoryBase extends BaseClass {
    // RepositoryBase constructor
    constructor(application) {
        super();
        if (!application)
            throw new Error("application parameter can not be null!");

        this.application = application;
        this.builder = this.application.builder;
        this.app = this.application.app;
        this.locale = this.application.locale;
        this.manager = new AppManager(this.app);
        this._errors = [];

        this.onError = _.get(this.app, 'options.data.onError');
        this.buildMode = this.application.buildMode;

        
        this.actions = {
            findAll: 'findAll',
            find: 'findAll',
            findById: 'findById',
            create: 'create',
            update: 'update',
            delete: 'delete',
            aggregate: 'aggregate'
        }

        this.validateMongooseBuilder();
    }

    validateMongooseBuilder() {
        if (!this.builder) {
            throw new Error("Application builder must be not null!");
        }
        if (Object.keys(this.builder.models).length == 0) {
            throw new Error("There is no models in builder");
        }
        if (Object.keys(this.builder.schemas).length == 0) {
            throw new Error("There is no schemas in builder");
        }
    }

    async baseFindAll(typeName, options) {
        const type = this.manager.getType(typeName);
        const childTypes = this.manager.getChildTypes(typeName);
        const opts = options ? options : {};

        let populate = opts.populate;
        let treePopulate = opts.treePopulate;
        const select = opts.select ? opts.select : null;

        const types = [typeName].concat(childTypes.map(childType => childType.name));
        const typeFilter = { _type: { $in: types } };

        const query = this.builder.models[type.name].find(typeFilter, select, opts.options ? opts.options : {})

        const properties = this.manager.getProperties(typeName);

        if (treePopulate) {
            populate || (populate = []);
            populate.push(...treePopulate);
        }

        if (populate && populate.length) {
            if(options.select) {
                populate = this.setPopulateProperty(populate, 'select', options.select);
            }
            query.populate(populate)
        }
        else {
            for(let property of properties.filter(p => ["reference", "collection"].indexOf(p.type) != -1)){
                if(_.get(type, 'options.autopopulate') || _.get(property, 'options.autopopulate')) {
                    let populateItem = [{ path: property.name }];
                    if(options.select) {
                        populateItem = this.setPopulateProperty(populateItem, 'select', options.select);
                    }
                    query.populate(populateItem);
                }
            }
        }

        query.collation({ locale: this.locale });
        const result = await query.exec();

        return result;
    }

    async baseFind(typeName, options) {
        const type = this.manager.getType(typeName);
        const childTypes = this.manager.getChildTypes(typeName);
        const opts = options ? options : {};

        let populate = opts.populate ? opts.populate : [];
        const treePopulate = opts.treePopulate;
        const filter = opts.filter ? opts.filter : {};

        const select = opts.select ? opts.select : null;

        const types = [type.name].concat(childTypes.map(childType => childType.name));
        const typeFilter = { _type: { $in: types } };
        const allFilter = opts.search ? filter : _.assignIn(filter, typeFilter);

        const query = this.builder.models[type.name].find(allFilter, select, opts.options ? opts.options : {});

        const properties = this.manager.getProperties(typeName);

        if (treePopulate) {
            populate.push(...treePopulate);
        }

        if (populate && populate.length) {
            query.populate(populate)
        }
        else {
            for(let property of properties.filter(p => ["reference", "collection"].indexOf(p.type) != -1)){
                if(_.get(type, 'options.autopopulate') || _.get(property, 'options.autopopulate')) {
                    query.populate([{ path: property.name }]);
                }
            }
        }

        query.collation({ locale: this.locale });

        const result = await query.exec();

        return result;
    }

    async baseFindById(typeName, id, options) {
        if (!typeName || !id)
            throw new Error("typeName and id parameters can not be null!");
        const type = this.manager.getType(typeName);
        const properties = this.manager.getProperties(typeName)
        const opts = options ? options : {};

        let populate = opts.populate ? opts.populate : [];
        const treePopulate = opts.treePopulate;
        const select = opts.select ? opts.select : null;

        const query = this.builder.models[type.name].findById(id, select, opts.options ? opts.options : {});

        if (treePopulate) {
            populate.push(...treePopulate);
        }

        if (populate && populate.length) {
            query.populate(populate)
        }
        else {
            for(let property of properties.filter(p => ["reference", "collection"].indexOf(p.type) != -1)){
                if(_.get(type, 'options.autopopulate') || _.get(property, 'options.autopopulate')) {
                    query.populate([{ path: property.name }]);
                }
            }
        }

        const result = await query.exec();

        return result;
    }

    async baseFindOne(typeName, options) {
        const type = this.manager.getType(typeName);
        const childTypes = this.manager.getChildTypes(typeName);
        const opts = options ? options : {};

        let populate = opts.populate;
        const treePopulate = opts.treePopulate;
        const filter = opts.filter ? opts.filter : {};
        const select = opts.select ? opts.select : null;

        const types = [typeName].concat(childTypes.map(childType => childType.name));
        const typeFilter = { _type: { $in: types } };
        const allFilter = _.assignIn(filter, typeFilter);

        const query = this.builder.models[type.name].findOne(allFilter, select, opts.options ? opts.options : {})

        populate || (populate = []);

        if (treePopulate) {
            populate.push(...treePopulate);
        }

        if (populate && populate.length) {
            query.populate(populate)
        }
        else {
            for(let property of properties.filter(p => ["reference", "collection"].indexOf(p.type) != -1)){
                if(_.get(type, 'options.autopopulate') || _.get(property, 'options.autopopulate')) {
                    query.populate([{ path: property.name }]);
                }
            }
        }

        const result = await query.exec();

        return result;
    }

    async baseCreate(typeName, data, builtInData, options) {
        // Get type to create data
        if (!typeName)
            throw new Error("typeName parameter must be not null!");
        if (!data)
            throw new Error("data parameter must be not null!");

        const type = this.manager.getType(typeName);
        const modelTypeName = data._type ? data._type : type.name;

        // Set some properties if model type is role
        if (type.name == this.application.defaults.types._role._type) {
            data[this.application.defaults.types._role.org] = this.application.orgName;
            data[this.application.defaults.types._role.app] = this.application.appName;
        }

        const properties = this.manager.getProperties(data._type ? data._type : type.name);
        const references = properties.filter(property => property.type == this.builder.fieldTypes.reference);

        for(let reference of references) {
            if(data[reference.name] && typeof data[reference.name] === 'string' && validator.isUUID(data[reference.name]) && reference.options && reference.options.type) {
                if(this.manager.isAppType(reference.options.type)) {
                    const referenceItem = await this.builder.models[reference.options.type].findById(typeof data[reference.name] === 'string' ? data[reference.name] : data[reference.name]._id);
                    const _display = referenceItem 
                        ? referenceItem._display
                        : referenceItem;
                    data[reference.name + '_display'] = _display;
                }
            }
        }
        

        const clearedBuiltInData = this.getBuiltInData(builtInData);
        const clearedData = this.manager.clearBuiltInData(modelTypeName, data, false, false);
        const clearedObjectData = this.manager.clearObjectData(modelTypeName, clearedData);
        const newData = _.extend(
            { 
                _type: (data._type 
                    ? data._type 
                    : type.name) 
            }, 
            clearedBuiltInData, 
            clearedObjectData
        );

        let dataItem, result;
        if (this.builder.models[modelTypeName]) {
            /*
            dataItem = new this.builder.models[modelTypeName]();
            dataItem = _.assign(dataItem, newData);
            result = await dataItem.save();
            */
           dataItem = await this.builder.models[modelTypeName].create(newData, options);
        }
        else {
            console.log("model", modelTypeName, " not found!");
            throw new Error("mongoose model not defined!");
        }

        return dataItem;
    }

    async baseCreateDocuments(data, isDefaultDocuments, userId) {
        let results = [], _errors = [];
        const now = new Date();
        
        const builtInDatas = data.map( d => { 
                return { 
                    _default: isDefaultDocuments ? true: false,
                    _createdAt: now,
                    _modifiedAt: now,
                    _createdBy: userId,
                    _modifiedBy: userId,
                }; 
            });


        for(let doc of data) {
            const properties = this.manager.getProperties(doc._type);
            const references = properties.filter(property => property.type == this.builder.fieldTypes.reference);
            for(const reference of references) {
                if(doc[reference.name] && typeof doc[reference.name] === 'string' && validator.isUUID(doc[reference.name])) {
                    const referenceItem = await this.builder.models[reference.options.type].findById(doc[reference.name]);
                    const newReferenceItem = referenceItem 
                        ? this.setDisplayName(referenceItem) 
                        : referenceItem;
                    data[reference.name + '_display'] = newReferenceItem && newReferenceItem._display ? newReferenceItem._display : null;
                }
            }
        }


        if (!data || (data && Object.keys(data).length == 0))
            throw new Error('data parameter can not be null or empty!');

        if (!(_.isArray(data) && _.every(data.map(d => _.isPlainObject(d)), Boolean)) || (!_.isPlainObject(data) && !_.isArray(data))) {
            throw new Error('data parameter must be JSON array! Example: [{ "name": "foo" }, { "name": "bar" }]');
        }
        
        const iteratorOptions = {
            items: data, 
            obj: this, 
            method: 'baseCreate', 
            args: ['$_type', '$this', '$extra'],
            extraArr: builtInDatas
        };

        try {
            for await (const item of utilsAsync.AsyncIterator(iteratorOptions)) {
                if(item instanceof Error){
                    _errors.push(item);
                }
                else {
                    results.push(item);
                    console.log("create", item._type, "document :", item._display);
                    if(this.app.options.audit) {
                        await this.createAuditData('create', item._type, item._id, isDefaultDocuments, userId, null, item);
                    }
                }
            }

            if(_errors.length) {
                throw new CreateError("", _errors, this.app, this.locale, true);
            }
        }
        catch (error) {
            console.log("has error root try block: ", error);
            throw error;
        }

        return { results: results, errors: _errors};
    }

    async baseFindByIdAndUpdate(typeName, id, data, additional, options) {
        // Get type to find and update data
        if (!typeName || !id || !data)
            throw new Error("typeName, id, data parameters can not be null!");

        const type = this.manager.getType(typeName);

        try {
            const additionalData = {
                _modifiedAt: new Date(),
                _modifiedByUser: this.application.user._id
            };

            const newData = additionalData ? _.extend(data, additionalData) : data;
            const dataItem = await this.builder.models[type.name].findByIdAndUpdate(id, newData, options).lean();

            return _.assignIn(dataItem, newData);
        }
        catch (error) {
            await utilsAsync.handleError(error);
        }
    }

    async baseFindByIdAndDelete(typeName, id, options) {
        // Get type to find and update data
        if (!typeName || !id)
            throw new Error("typeName, id parameters can not be null!");

        const type = this.manager.getType(typeName);

        try {
            const dataItem = await this.builder.models[type.name].findByIdAndDelete(id, options).lean().exec();

            return dataItem;
        }
        catch (error) {
            await utilsAsync.handleError(error);
        }
    }

    async baseUpdate(typeName, conditions, update, additional, options) {
        // Get type to update data
        if (!update)
            throw new Error("update parameter can not be null!");
        const type = this.manager.getType(typeName);

        try {
            const dataItem = await this.builder.models[type.name].update(conditions, update, options);

            return dataItem;
        }
        catch (error) {
            await utilsAsync.handleError(error);
        }
    }

    async baseUpdateOne(typeName, conditions, update, options) {
        // Get type to update data
        if (!update)
            throw new Error("update parameter can not be null!");
        const type = this.manager.getType(typeName);

        try {
            const dataItem = await this.builder.models[type.name].updateOne(conditions, update, options);

            return dataItem;
        }
        catch (error) {
            await utilsAsync.handleError(error);
        }
    }

    async baseDelete(typeName, id, options) {
        if (!typeName || !id)
            throw new Error("typeName, id parameters must be not null!");
        if (!id)
            throw new Error("id parameter must be not null!");
        const type = this.manager.getType(typeName);

        try {
            const result = await this.builder.models[type.name].remove({ _id: id }, options);

            return result;
        }
        catch (error) {
            await utilsAsync.handleError(error);
        }
    }

    async baseDeleteDocuments(ids) {
        if (!_.isArray(ids))
            throw new Error("ids parameter must be an array!");

        if (!_.every(ids.map(keys => validator.isUUID(keys._id)), Boolean))
            throw new Error("All ids must be a UUID!");

        const deleteActions = ids.map(keys => this.baseDelete(keys._type, keys._id));
        const result = await Promise.all(deleteActions);

        return result;
    }

    async createAuditData(action, typeName, id, isDefault, userId, oldData, newData) {
        const now = new Date();
        const audit = {
            _type: this.application.defaults.types._audit._type,
            action:  action,
            type: typeName,
            oid: id,
            date: now,
            old: oldData,
            "new": newData,
            user: userId ? userId : (this.application.user ? this.application.user._id : null),
        };

        const auditBuiltIn = {
            _default: (isDefault ? true : false),
            _createdAt: now,
            _modifiedAt: now,
            _createdBy: userId ? userId : (this.application.user ? this.application.user._id : null),
            _modifiedBy: userId ? userId : (this.application.user ? this.application.user._id : null)
        };

        await this.baseCreate(this.application.defaults.types._audit._type, audit, auditBuiltIn);
    }

    async countAll(typeName) {
        const type = this.manager.getType(typeName);
        const childTypes = this.manager.getChildTypes(typeName);

        const types = [typeName].concat(childTypes.map(childType => childType.name));
        const typeFilter = { _type: { $in: types } };

        const count = await this.builder.models[type.name].countDocuments(typeFilter);

        return count;
    }

    async count(typeName, filter) {
        const type = this.manager.getType(typeName);
        const childTypes = this.manager.getChildTypes(typeName);

        const types = [typeName].concat(childTypes.map(childType => childType.name));
        const typeFilter = { _type: { $in: types } };
        const allFilter = _.assignIn(filter ? filter : {}, typeFilter);

        const count = await this.builder.models[type.name].countDocuments(allFilter);

        return count;
    }

    async mapReduce(typeName, map, reduce) {
        const type = this.manager.getType(typeName);
        const obj = {
            map: map,
            reduce: reduce
        };

        const result = this.builder.models[typeName].mapReduce(obj);

        return result;
    }

    async baseAggregate(typeName, options) {
        const type = this.manager.getType(typeName);
        const result = await this.builder.models[type.name].aggregate(options);

        return result;
    }

    /**
     * Private methods
     */

    getBuiltInData(additional) {
        let newItem;
        // Setting additional
        newItem = {};
        const date = new Date();
        
        if (additional) {
            if (_.has(additional, '_createdAt'))
                newItem._createdAt = additional._createdAt;
            else
                newItem._createdAt = date;
            if (_.has(additional, '_modifiedAt'))
                newItem._modifiedAt = additional._modifiedAt;
            else
                newItem._modifiedAt = date;
            if (_.has(additional, '_createdBy'))
                newItem._createdBy = additional._createdBy;
            else
                newItem._createdBy = null;
            if (_.has(additional, '_modifiedBy'))
                newItem._modifiedBy = additional._modifiedBy;
            else
                newItem._modifiedBy = null;
            if (_.has(additional, '_default'))
                newItem._default = additional._default;
            else
                newItem._default = false;
            if (_.has(additional, '_demo'))
                newItem._demo = additional._demo;

        }

        return newItem;
    }

    prepareTreePopulateItem(typeName, options) {
        if (!typeName || typeName == "") throw new Error("'typeName' parameter is not be null or empty");

        const type = this.manager.getType(typeName);

        let fullPath = "";
        let item;
        let parent;
        let children;

        if (type) {
            const tree = _.get(type, 'options.tree');

            if (tree) {
                if (options) {
                    const parentOptions = options.parentOptions;
                    const childrenOptions = options.childrenOptions;

                    if (parentOptions) {
                        parent = _.assign({ path: tree.parent }, parentOptions);
                    }
                    else {
                        parent = { path: tree.parent };
                    }

                    if (childrenOptions) {
                        children = _.assign({ path: tree.children }, childrenOptions);
                    }
                    else {
                        children = { path: tree.children };
                    }
                }
                else {
                    parent = { path: tree.parent };
                    children = { path: tree.children };
                }

                item = {
                    path: tree.children
                };

                if (options && options.childrenOptions) {
                    item = _.assignIn(item, options.childrenOptions)
                }

                for (let i = 0; i < ((tree.maxDepth - 1) * 2); i++) {
                    if (i % 2 == 0) {
                        fullPath += i == 0 ? "populate" : ".populate";
                        _.set(item, fullPath, [{}, parent]);
                    }
                    else {
                        fullPath += "[0]"
                        let citem = { path: tree.children };
                        if (options && options.childrenOptions) {
                            citem = _.assignIn(citem, options.childrenOptions)
                        }
                        _.set(item, fullPath, citem);
                    }
                }
            }
        }

        return { parent: parent, children: item };
    }

    setDisplayNames(items) {
        if (!items) throw new Error("'items' parameter is null");

        const newItems = [];
        for (let item of items) {
            newItems.push(this.setDisplayName(item));
        }

        return newItems;
    }

    setDisplayName(item) {
        if (!item) throw new Error("'item' parameter is null");

        const type = this.manager.getType(item._type);
        const _item = JSON.parse(JSON.stringify(item));
        const properties = this.manager.getProperties(_item._type);

        const expression = _.get(type, 'options.display') ? type.options.display : "($item._type + ' ' + $item._id)";

        let newItem;

        if (expression) {
            const $app = this.app;
            const $type = type;
            const $locale = this.locale;
            const $doc = _item;
            const $this = $doc;

            const argsNames = ['$app', '$type', '$locale', '$doc', '$this'];
            const argsValues = [$app, $type, $locale, $doc, $this];


            const body = "return " + expression;
            const display = new Function(...argsNames, body);
            _item._display = display(...argsValues);
        }

        newItem = _item;//_.assignIn(item, _item);

        return newItem;
    }

    prepareManyToManyCollection(items) {
        const newItems = JSON.parse(JSON.stringify(items));

        for (let item of newItems) {
            const properties = this.manager.getProperties(item._type);
            const collections = properties.filter(p => p.type == "collection" && p.options && p.options.many == true);
            const index = items.indexOf(item);
            for (let collection of collections) {

                const reference = _.get(collection, 'options.collection.reference');
                if (reference && item[collection.name])
                    item[collection.name] = item[collection.name].map(c => c[reference.property]);

                item = _.assignIn(items[index], item);
            }
        }

        return newItems;
    }

    setPopulateProperty(populate, name, value){
        for(const populateItem of populate){
            populate[populate.indexOf(populateItem)] = this.setPopulateItemProperty(populateItem, name, value);
        }

        return populate;
    }

    setPopulateItemProperty(populateItem, name, value) {
        populateItem[name] = value;

        if(populateItem.populate) {
            populateItem.populate = this.setPopulateProperty(populateItem.populate, name, value);
        }

        return populateItem;
    }

    sortDocumentsKeyByPropertyOrder(data, typeName, includeChildTypeProperties, select){
        const newData = JSON.parse(JSON.stringify(data));
        
        if(_.isArray(newData)) {
            for(let doc of newData) {
                newData[newData.indexOf(doc)] = this.sortDocumentKeyByPropertyOrder(doc, typeName, includeChildTypeProperties, select)
            }
        }
        else {
            return this.sortDocumentKeyPropertyOrder(newData, typeName, includeChildTypeProperties, select);
        }

        return newData;
    }

    sortDocumentKeyByPropertyOrder(doc, typeName, includeChildTypeProperties, select) {
        doc = _.cloneDeep(doc);
        let selectProperties = select ? select.split(" ").map(s => s.trim()) : [];
        let newDoc;
        if(select) {
            if(doc._id)
                newDoc = {
                    _id: doc._id
                };
            else {
                newDoc = {};
            }
            
            for(let prop of selectProperties) {
                if(doc[prop]) {
                    newDoc[prop] = doc[prop]
                }
            }
        }
        else {
            if(doc._id)
                newDoc = {
                    _id: doc._id,
                    _type: doc._type,
                    _default: doc._default ? true : false,
                    _createdAt: doc._createdAt,
                    _modifiedAt: doc._modifiedAt,
                    _createdBy: doc._createdBy,
                    _modifiedBy: doc._modifiedBy
                }
            else {
                newDoc = {};
            }
        }

        const modelTypeName = doc._type ? doc._type : typeName;
        const type = this.manager.getType(modelTypeName);
        let properties = this.manager.getProperties(modelTypeName);

        if(select) {
            for(let property of properties.filter(p => p.type == this.application.builder.fieldTypes.reference || p.type == this.application.builder.fieldTypes.collection)){
                if(doc[property.name]) {
                    newDoc[property.name] = doc[property.name]
                }
            }
        }
        
        if(includeChildTypeProperties) {
            const childTypes = this.manager.getChildTypes(modelTypeName);
            for(let childType of childTypes){
                const childTypeProperties = this.manager.getProperties(childType.name);
                properties.push(...childTypeProperties);
            }
            properties = _.uniqBy(properties, (p) => {
                return p.name;
            });
        }
        
        properties = _.sortBy(properties, ['order'])

        for(let property of properties){
            if((!select || selectProperties.indexOf(property.name) != -1 || (_.get(type, 'options.tree') && type.options.tree.parent == property.name)) && property.type == this.application.builder.fieldTypes.reference && doc[property.name] && typeof doc[property.name] !== 'string') {
                newDoc[property.name] = this.sortDocumentKeyByPropertyOrder(doc[property.name], '', false, select);
                if(!select || selectProperties.indexOf('_display') != -1) {
                    newDoc[property.name + '_display'] = doc[property.name + '_display'];
                }

                if(select) {
                    for(let prop in newDoc[property.name]) {
                        if(_.isObject(newDoc[property.name][prop]) && typeof newDoc[property.name][prop] !== 'string' && newDoc[property.name][prop].constructor.name === 'model') {
                            newDoc[property.name][prop] = this.sortDocumentKeyByPropertyOrder(newDoc[property.name][prop], newDoc[property.name][prop]._type, false, select);
                        }
                    }
                }
            }
            else if((!select || selectProperties.indexOf(property.name) != -1 || (_.get(type, 'options.tree') && type.options.tree.children == property.name)) && property.type == this.application.builder.fieldTypes.collection && doc[property.name] && doc[property.name].length) {
                newDoc[property.name] = this.sortDocumentsKeyByPropertyOrder(doc[property.name], '', false, select);

                if(select) {
                    for(let cdoc of newDoc[property.name]) {
                        for(let prop in cdoc) {
                            if(_.isObject(cdoc[prop]) && typeof cdoc[prop] !== 'string'  && cdoc[prop].constructor.name === 'model') {
                                newDoc[property.name][prop][newDoc[property.name].indexOf(cdoc)] = this.sortDocumentKeyByPropertyOrder(cdoc[prop], cdoc[prop]._type, false, select);
                            }
                        }
                    }
                }

            }
            else if((!select || selectProperties.indexOf(property.name) != -1) && property.type == this.application.builder.fieldTypes.object && _.get(property, 'options.type') && doc[property.name]) {
                newDoc[property.name] = this.sortDocumentKeyByPropertyOrder(doc[property.name], _.get(property, 'options.type'), true);
            }
            else if((!select || selectProperties.indexOf(property.name) != -1) && property.type == this.application.builder.fieldTypes.array && _.get(property, 'options.type') && doc[property.name]) {
                newDoc[property.name] = this.sortDocumentsKeyByPropertyOrder(doc[property.name], _.get(property, 'options.type'), true);
            }
            else if((!select || selectProperties.indexOf(property.name) != -1) && _.has(doc, property.name)) {
                newDoc[property.name] = doc[property.name];
            }
        }
        
        for(let prop in doc) {
            if((!select || selectProperties.indexOf(prop) != -1) && properties.map(p => p.name).indexOf(prop) == -1) {
                newDoc[prop] = doc[prop];
            }
        }
        
        return newDoc;
    }
}

module.exports = RepositoryBase;