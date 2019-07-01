"use strict";

const mongoose = require("mongoose");
mongoose.set('runValidators', true);
const _ = require("lodash");
const uuid = require("node-uuid");
const validator = require("validator");
const BaseClass = require("../base/base");
const AppManager = require("../builder/app.manager");
const RepositoryBase = require("../repository/repository.base");

const each = require("promise-each");
const utils = require("../helpers/utils");
const utilsAsync = require("../helpers/utils.async");
const mongooseErrors = require("../mongoose/errors");
const MyLogger = require("../helpers/myLogger");
const ErrorLogger = require("../helpers/errorLogger");
const myLogger = new MyLogger(false);
const errorLogger = new ErrorLogger(true);
const pluralize = require("pluralize");

const errors = require('restify-errors');
const RequestError = require("../errors/requestError");
const AggregateError = require("../errors/aggregateError");
const CreateError = require("../errors/createError");
const UpdateError = require("../errors/updateError");
const DeleteError = require("../errors/deleteError");
const UnknownPropertyError = require("../errors/unknownPropertyError");

class Repository extends RepositoryBase {
    // Repository constructor
    constructor(application, user) {
        super(application);
        if (!application)
            throw new Error("application and user parameters can not be null!");
        this.application.setUser(user);
    }

    async findAll(typeName, options) {
        // Clone options object
        options = _.cloneDeep(options);
       
        if (!typeName)
            throw new Error("typeName parameter can not be null");

        // Get model type from typeName
        const type = this.manager.getType(typeName);
        const defaultSort = _.get(type, 'options.defaultSort');

        // Prepare options object
        options = this.prepareOptions(typeName, options)

        if (defaultSort) {
            options || (options = {});
            !_.get(options, 'options.sort') && (options.options = { sort: defaultSort });
        }

        return await this.baseFindAll(typeName, options);;
    }

    async find(typeName, options) {
        // Clone options object
        options = _.cloneDeep(options);
        
        if (!typeName)
            throw new Error("typeName parameter can not be null");

        // Get model type from typeName
        const type = this.manager.getType(typeName);
        const defaultSort = _.get(type, 'options.defaultSort');

        // Prepare options object
        options = this.prepareOptions(typeName, options)

        if(options.search) {
            options.filter = this.prepareSearchFilter(typeName, options);
        }
        else {
            const childTypes = this.manager.getChildTypes(typeName);
            const types = [type.name].concat(childTypes.map(childType => childType.name));
            const typeFilter = { _type: { $in: types } };
            options.filter = _.assignIn(options && options.filter ? options.filter : {}, typeFilter);
        }

        if (defaultSort) {
            options || (options = {});
            !_.get(options, 'options.sort') && (options.options = { sort: defaultSort });
        }

        return await this.baseFind(typeName, options);
    }

    async findOne(typeName, options) {
        // Clone options object
        options = _.cloneDeep(options);
        
        if (!typeName)
            throw new Error("typeName parameter can not be null");

        // Prepare options object
        options = this.prepareOptions(typeName, options)

        return await this.baseFindOne(typeName, options);
    }

    async findById(typeName, id, options) {
        // Clone options object
        options = _.cloneDeep(options);
        
        if (!typeName || !id)
            throw new Error("typeName, id parameters can not be null!");
        
        // Prepare options object
        options = this.prepareOptions(typeName, options)

        return await this.baseFindById(typeName, id, options);
    }

    async create(typeName, data, builtInData, options) {
        // Clone options object
        options = _.cloneDeep(options);
        
        // Checking data validation and if has error then throw error
        this.dataValidation(typeName, data, ["_type"], ["_type"], true);

        // Get model type from typeName
        const type = this.manager.getType(typeName);
        
        // Defining result variable
        let result;

        try {
            // Clear built-in data in doc
            const newData = this.manager.clearBuiltInData(type.name, data, false, true);
            const now = new Date();

            if (!newData._type)
                newData._type = type.name;

            const modelType = data._type ? data._type : type.name;

            // Call baseCreate method to create item
            result = await this.baseCreate(modelType, newData, _.assignIn(builtInData ? builtInData : {
                _createdAt: now,
                _modifiedAt: now,
                _createdBy: this.application.user ? this.application.user._id : null,
                _modifiedBy: this.application.user ? this.application.user._id : null
            }), options);

            if(this.app.options.audit && result){
                // Create audit document
                await this.createAuditData(this.actions.create, modelType, result._id, null, result);
            }
        }
        catch (createError) {
            // Log error and throw it
            errorLogger.log(this.constructor.name, "create", createError);
            throw new CreateError(
                createError.message, 
                createError.errors 
                    ? createError.errors 
                    : [createError], 
                this.app, 
                this.locale, 
                true
            );
        }

        return result;
    }

    async update(typeName, id, data, additional, options, doNotSetBuildInData) {
        // Clone options object
        options = _.cloneDeep(options);
        
        // Checking data validation and if has error then throw error
        this.dataValidation(typeName, data, ["_id", "_type"], ["_id", "_type"], true);
        this.checkId(id, data);

        // Get model type from typeName
        const type = this.manager.getType(typeName);
        const modelType = data._type ? data._type : type.name;

        // Set built-in data to update
        const currentAdditional = _.assignIn(additional, {
            _modifiedAt: new Date(),
            _modifiedBy: this.application.user._id
        });

        // Found current item by id
        const foundItem = await this.findById(type.name, id, options);

        if(!foundItem) {
            const errorMessage = { en: `Item not found! id: ${id}`, tr: `Öğe  bulunamadı! id: ${id}`};
            const locale = ["en", "tr"].indexOf(this.locale) ? this.locale : "en";
            throw new UpdateError(errorMessage[locale], null, this.app, this.locale);
        }

        // Defining result variable
        let result;

        // Setting data properties to found document
        for (let prop in data) {
            if (prop != "_id"){
                foundItem[prop] = data[prop];
            }
        }
        
        if(!doNotSetBuildInData) {
            // Seting data built-in properties except _id and _type
            const rootProperties = this.manager.isAppType(this.app.options.default.defaults.types._root.__type) 
                ? this.manager.getProperties(this.app.options.default.defaults.types._root.__type).map(p => p.name)
                : this.app.options.default.defaults.properties
            
            for (let prop in currentAdditional) {
                if (prop != "_id" && prop != "_type" && rootProperties.indexOf(prop) != -1)
                    foundItem[prop] = currentAdditional[prop];
            }
        }

        try {
            // Calling save method of foundItem to update item
            result = await foundItem.save();

            if(this.app.options.audit && result){
                // Create audit document
                await this.createAuditData(this.actions.update, modelType, result._id, foundItem, result);
            }
        }
        catch (updateError) {
            // Loging error and throw it
            errorLogger.log(this.constructor.name, "update", updateError);
            throw new UpdateError(updateError.message, updateError.errors, this.app, this.locale, true);
        }

        return result;
    }

    async delete(typeName, id) {
        // Checking data validation and if has error then throw error
        this.dataValidation(typeName, null, [], [], false);
        this.checkId(id, null, false);

        // Get model type from typeName
        const type = this.manager.getType(typeName);

        // Defining result variable
        let result;

        try {
            // Calling findByIdAndRemove method of base repository to delete document by id
            result = await this.baseFindByIdAndDelete(type.name, id);

            if(result && this.app.options.audit){
                // Create audit document
                await this.createAuditData(this.actions.delete, type.name, id, result, null);
            }
        }
        catch(deleteError) {
            // Loging error and throw it
            errorLogger.log(this.constructor.name, "delete", id, deleteError);
            throw new DeleteError(deleteError.message, this.app, this.locale, true);
        }

        return result;
    }

    async aggregate(typeName, options) {
        // Clone options object
        options = _.cloneDeep(options);
        
        if (!typeName) {
            throw new Error("typeName parameters can not be null!");
        }
        
        // Get model type from typeName
        const type = this.manager.getType(typeName);

        if (!type) {
            throw new Error("Type not found in app types!");
        }
        let result;
        try {
            result = await this.baseAggregate(type.name, options);
        }
        catch(aggregateError){
            // Loging error and throw it
            errorLogger.log(this.constructor.name, "aggregate", options, aggregateError);
            throw new AggregateError(aggregateError.message, this.app, this.locale, true);
        }

        return result;
    }

    async validateCreate(typeName, data) {
        // Get model type from typeName
        const type = this.manager.getType(typeName);
        
        if(!type) {
            throw new CreateError("Type not found in app types!");
        }

        const Model = this.application.builder.models[type.name];

        const doc = new Model();
        
        for(let prop in data){
            doc[prop] = data[prop];
        }

        let result;
        try {
            await doc.validate();
        }
        catch(error) {
            result = error;
        }

        return result;
    }

    async validateUpdate(typeName, id, data) {
        // Get model type from typeName
        const type = this.manager.getType(typeName);
        
        if(!type) {
            throw new CreateError("Type not found in app types!");
        }

        if(!validator.isUUID(id ? id : '')){
            throw new CreateError("id have an UUID format!");
        }

        const Model = this.application.builder.models[type.name];
        
        let result = true;
        
        try {
            const doc = await Model.findById(id);
            
            for(let prop in data){
                doc[prop] = data[prop];
            }
            
            await doc.validate();
        }
        catch(error) {
            result = error;
        }

        return result;
    }

    /** 
     * Private methods
     */

    prepareOptions(typeName, options) {
        const type = this.manager.getType(typeName);
        const populate = options && options.populate
            ? options.populate
            : _.get(type, 'options.populate.find');

        const tree = _.get(type, 'options.tree');
        
        let populateParent, populateChildren;

        if (populate) {
            options || (options = {});
            options.populate = populate;

            if (tree) {
                populateParent = _.find(populate, { path: tree.parent });
                populateChildren = _.find(populate, { path: tree.children });
            }
        }

        if (tree && !populateParent && !populateChildren) {
            options || (options = {});
            options.treePopulate = [];

            let parentPath = {};
            let treeOptions;
            const parentOptions = options.select
                ? { select: options.select }
                : tree.parentOptions;
            const childrenOptions = options.select
                ? { select: options.select }
                : tree.parentOptions;


            parentPath.path = tree.parent;

            if (options.select)
                parentPath.select = options.select;


            if (parentOptions)
                treeOptions = {
                    parentOptions: _.assignIn(parentOptions, tree.parentOptions)
                };

            if (childrenOptions) {
                if (treeOptions) {
                    treeOptions = _.assignIn({
                        childrenOptions: _.assignIn(childrenOptions, tree.childrenOptions)
                    }, treeOptions);
                }
                else {
                    treeOptions = {
                        childrenOptions: _.assignIn(childrenOptions, tree.childrenOptions)
                    };
                }
            }

            const populateItems = this.prepareTreePopulateItem(type.name, treeOptions);

            options.treePopulate.push(populateItems.parent);
            options.treePopulate.push(populateItems.children);
        }

        return options
    }

    dataValidation(typeName, data, itemIncludes, isDataValidation) {

        const itemCheckIncludesType = itemIncludes.indexOf("_type") > -1;
        const itemCheckIncludesId = itemIncludes.indexOf("_id") > -1;

        const itemUnknowsIncludesType = itemIncludes.indexOf("_type") > -1;
        const itemUnknownsIncludesId = itemIncludes.indexOf("_id") > -1;

        const type = this.manager.getType(typeName);

        const _allErrors = []

        if (!typeName)
            _allErrors.push(new Error('typeName parameter can not be null!'));

        if (typeName) {
            const childTypes = this.manager.getChildTypes(typeName);
            if ([typeName].concat(childTypes.map(ct => ct.name)).indexOf(typeName) == -1) {
                _allErrors.push(new Error("Type can not diffrent type! Please check url and change type!"))
            }
        }

        if (this.app.options.readonly) {
            _allErrors.push(new Error('Application data is readonly! Can not create, update, delete data!'));
        }


        if (!type) {
            _allErrors.push(new Error('Type not found in app types! typeName: ' + typeName));
        }

        if (isDataValidation && data) {
            if (!_.isPlainObject(data)) {
                if (!(_.isArray(data) && _.every(data.map(d => _.isPlainObject(d)), Boolean) && !_.isPlainObject(data)) || (!_.isPlainObject(data) && !_.isArray(data)))
                _allErrors.push(new Error('data must be a JSON object! Example: { "name": "foo" }'));
            }
 
            if (!data || (data && Object.keys(data).length == 0))
                _allErrors.push(new Error('Please send data to create, data can not be null or empty!'));

            if (this.app.options.strict && _.isPlainObject(data) && !this.manager.checkProperties(typeName, data, itemCheckIncludesType, itemCheckIncludesId)) {
                const unknownProperties = this.manager.getUnknownProperties(typeName, data, itemUnknowsIncludesType, itemUnknownsIncludesId)
                let errorExpression = _.get(this.app, 'options.messages.unknownPropertyInItem');

                if(!errorExpression) {
                    errorExpression = this.app.options.default.defaults.errors.unknownPropertyInItem
                }

                const errorMessage = utils.interpolate(errorExpression[this.locale], { 
                    properties: unknownProperties 
                });

                _allErrors.push(new Error(errorMessage));
            }
        }

        if(_allErrors.length) {
            throw new RequestError("", _allErrors, this.app, this.locale, true);
        }
    }

    checkId(id, data) {
        if (!validator.isUUID(id ? id : '')) {
            throw new Error(`id parameter have an UUID format! Current value is ${id}`)
        }

        if (data != null) {
            if (data._id && data._id != id) {
                throw new Error("Diffrent id detected in data _id property!")
            }
        }
    }

    interpolate(template, scope) {
        return (new Function(Object.keys(scope), "return " + template))(...Object.values(scope));
    }

    prepareSearchFilter(typeName, options) {
        options = _.cloneDeep(options);
        const type = this.manager.getType(typeName);
        const childTypes = this.manager.getChildTypes(typeName);
        const types = [type.name].concat(childTypes.map(childType => childType.name));
        const typeFilter = { _type: { $in: types } };
        options || (options = {});
        const filter = (options && options.filter) ? options.filter : {};
        const searchOptions = _.get(options, 'searchOptions') || {};
        searchOptions.locale || (searchOptions.locale = this.locale);
        searchOptions.operator || (searchOptions.operator = "and");
        searchOptions.sensitive || (searchOptions.sensitive = false);
        
        if(this.locale == "tr") {
            searchOptions.turkishSearch || (searchOptions.turkishSearch = false)
        }
        
        searchOptions.searchInReferenceDisplay || (searchOptions.searchInReferenceDisplay = true);
        searchOptions.searchInReferenceDisplayIfIsTreeParent || (searchOptions.searchInReferenceDisplayIfIsTreeParent = false);
        
        searchOptions.properties || (searchOptions.properties = []);

        if (["or", "and"].indexOf(searchOptions.operator) == -1) {
            throw new Error("Invalid search operator in searcOptions!");
        }

        options.searchOptions || (options.searchOptions = searchOptions);

        const search = _.get(options, 'search')
            ? searchOptions.locale == 'tr'
                ? (searchOptions.turkishSearch == true
                    ? utils.getTurkishRegexSearchStringPassTurkishCharacters(options.search.trim(), searchOptions.sensitive)
                    : utils.getTurkishRegexSearchString(options.search.trim(), searchOptions.sensitive))
                : options.search.trim()
            : "";

        let searchFilter;

        if (search) {
            const searchQueries = this.prepareSearchQueries(type, search, searchOptions, this.locale, null);

            searchFilter = {
                $and: [
                    _.assignIn(typeFilter, filter),
                    { 
                        $or: searchQueries 
                    }
                ]
            };
        }
        else {
            filter = _.assignIn(filter, typeFilter);
        }

        return searchFilter;
    }

    prepareSearchQueries(type, search, searchOptions, locale, path = "") {
        const fullText = search.split('+').join(' ');
        const keywords = fullText.split(' ');
        searchOptions.properties || (searchOptions.properties = []);

        const searchProps = searchOptions.properties;

        const properties = this.manager.getProperties(type.name);
        const searchQueries = [];

        // Get searchable properties
        const propTypes = ["string", "localized", "reference"];
        const strProps = _.filter(properties, (p) => {
            return this.manager.isReference(type.name, p.name) && !searchOptions.searchInReferenceDisplay 
            ? false 
            : ((this.manager.isTreeReference(type.name, p.name) 
                ? (searchOptions.searchInReferenceDisplayIfIsTreeParent || 
                    (searchProps.length 
                        ? searchProps.indexOf(p.name) != -1 && propTypes.indexOf(p.type) != -1
                        : false))
                : (searchProps.length 
                    ? searchProps.indexOf(p.name) != -1 && propTypes.indexOf(p.type) != -1
                    : propTypes.indexOf(p.type) != -1)));
        });

        const processedObjectProperties = [];

        for (let prop of strProps) {
            const conds = this.prepareSearchConditions(searchOptions, keywords, type, prop, locale, path);
            const searchQuery = conds.length ? this.prepareSearchQueryItem(searchOptions, conds) : null;

            if (searchQuery && Object.keys(searchQuery).length) {
                searchQueries.push(searchQuery);
                processedObjectProperties.push(prop.name)
            }
        }

        const objProperties = _.filter(properties, (p) => {
            return p.type == 'object' && p.options && this.manager.isAppType(p.options.type);
        });

        
        for (let objProperty of objProperties) {
            if (searchProps.length == 0 ||
                searchProps.indexOf(objProperty.name) != -1) {
                const objTypeName = _.get(objProperty, 'options.type');
                const objType = this.manager.getType(objTypeName);
                const searchQueriesForObject = this.prepareSearchQueries(
                    objType,
                    search,
                    searchOptions,
                    locale,
                    objProperty.name
                );
                
                if(searchQueriesForObject && Object.keys(searchQueriesForObject).length) {
                    if (searchProps.indexOf(objProperty.name) == -1) {
                        processedObjectProperties.push(objProperty.name);
                    }

                    searchQueries.push(...searchQueriesForObject);
                }
            }
        }
        
        if (searchProps.length == 0 && !path) {
            searchProps.push(...processedObjectProperties);
        }
        
        return searchQueries;
    }

    prepareSearchQueryItem(searchOptions, conditions) {
        let searchQuery;
        if (conditions.length == 1) {
            searchQuery = conditions[0];
        }
        else {
            searchQuery = {};
            searchQuery['$' + searchOptions.operator] = conditions
        }

        return searchQuery;
    }

    prepareSearchConditions(searchOptions, keywords, type, property, locale, path) {
        let conditions = [];
        switch (property.type) {
            case "string":
                conditions = _.transform(keywords, (r, keyword) => {
                    const condition = {};
                    condition[(path ? path + "." : "") + property.name] = {
                        $regex: keyword.trim(),
                        $options: (searchOptions && searchOptions.sensitive ? "g" : "gi")
                    };

                    r.push(condition);
                });

                break;
            case "localized":
                conditions = _.transform(keywords, (r, keyword) => {
                    const condition = {};
                    condition[(path ? path + "." : "") + property.name + "." + locale] = {
                        $regex: keyword.trim(),
                        $options: (searchOptions && searchOptions.sensitive ? "g" : "gi")
                    };

                    r.push(condition);
                });

                break;
            case "reference":
                let searchReference = true;
                if (type.options &&
                    type.options.tree &&
                    type.options.tree.parent == property.name)
                    searchReference = false;

                if (searchReference || (!!searchOptions.searchInReferenceDisplayIfIsTreeParent && !searchReference)  || 
                    searchOptions.searchInReferenceDisplayIfIsTreeParent == true || 
                    searchOptions.properties.indexOf(property.name) != -1) {
                    conditions = _.transform(keywords, (r, keyword) => {
                        const condition = {};
                        condition[(path ? path + "." : "") + property.name + "_display"] = {
                            $regex: keyword.trim(),
                            $options: (searchOptions && searchOptions.sensitive ? "g" : "gi")
                        };

                        r.push(condition);
                    });
                }
                break;

        }

        return conditions;
    }
}

module.exports = Repository;