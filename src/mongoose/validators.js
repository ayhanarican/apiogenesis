
const validate = require("../lib/mongoose-validator/index");

const extend = validate.extend;
const exists = validate.exists;
const _ = require("lodash");
const is = require("is");

const utils = require("../helpers/utils");
const AppManager = require("../builder/app.manager");

const getStringValidations = require("./string.validations");

const messages = require("../defaults/validators.messages");

function getValidators(builder, app, type, property, locale) {
    const validations = _.cloneDeep(getStringValidations(builder, app, type, property, locale));
    const validators = [];
    this.validationHandler = validationHandler;
    //this.required = requiredWith;
    //this.unique = multipleUnique;
    
    this.multipleUnique = multipleUnique;
    this.existsReference = existsReference;
    this.requiredWith = requiredWith;

    this.validations = validations;
    const self = this;

    if (validations) {
        for (const validation of validations) {
            if (exists(validation.validator)) {
                validators.push(
                    validate({
                        validator: validation.validator,
                        arguments: validation.arguments,
                        message: validation.message,
                        passIfEmpty: validation.passIfEmpty
                    })
                );
            }
            else if (this[validation.validator]) {
                validators.push(validationHandler(validation, locale));
            }
            else {
                throw new Error("Validator is not exists in built-in validators!");
            }
        }
    }

    function validationHandler(validation, locale) {
        const validator = self[validation.validator];
        const message = () => {
            const otherKeys = validation.arguments && validation.arguments.length ? validation.arguments : [];
            return ((validation.message ? validation.message : messages[validation.validator][locale])
                .replace(/{MODEL}/gi, type.name)
                .replace(/{PATH}/gi, property.name)
                .replace(/{KEYS}/gi, (otherKeys && otherKeys.length && typeof otherKeys[0] === 'string' 
                    ? otherKeys.join(', ') 
                    : (otherKeys && otherKeys.map ? otherKeys.map(key => key.path).join(', ') : [])))
            )};

        return {
            validator: validator,
            message: message,
            name: validation.validator
        }
    }

    function multipleUnique(val) {
        const self = this;
        const validation = _.find(validations, { validator: 'multipleUnique' });
        const args = _.cloneDeep(validation.arguments ? validation.arguments : []);
        let turkishUnique = false;
        const insensitive = args && typeof args[0] === 'boolean' 
                    ? args.shift() 
                    : false;
        if(args && args[args.length - 1] == "turkish") {
            args.pop();
            turkishUnique = true;
        }

        const manager = new AppManager(app);
        const properties = manager.getProperties(type.name);
        
        if(!_.every(
            args.map(arg => 
                (_.isString(arg) && properties.map(p => p.name).indexOf(arg) != -1) || 
                (_.isPlainObject(arg) && properties.map(p => p.name).indexOf(arg.path) != -1)
            )
            , Boolean)
        ) {
            throw new Error("multipleUnique: paths not in properties! Check validation arguments! unknown paths: " + 
            args.map(arg => (_.isString(arg) ? arg : arg.path)).filter(arg => properties.map(p => p.name).indexOf(arg) == -1))
        }

        return new Promise((resolve, reject) => {
            try {
                // Get conditions
                const condition = getCondition(type.name, args, self, insensitive, turkishUnique);

                builder.models[type.name].find(condition)
                .then(result => {
                    if (result && result.length) {
                        if (result[0]._id != self._id){
                            resolve(false);
                        }
                        else {
                            resolve(true);
                        }
                    }
                    else {
                        resolve(true);
                    }
                })
                .catch(err => console.log("inner catch: ", err));
            }
            catch(error) {
                console.log("outer catch: ", error);
            }
        });


    }

    function existsReference(val) {
        const self = this;
        const validation = _.find(validations, { validator: 'existsReference' });
        const args = _.cloneDeep(validation.arguments ? validation.arguments : []);
        const manager = new AppManager(app);
        
        try {
            return new Promise((resolve, reject) => {
                const referenceType = _.get(property, 'options.type');
                if(manager.isReference(type.name, property.name) && referenceType) {
                    builder.models[referenceType].findById(val)
                    .then(result => {
                        if(result) {
                            resolve(true);
                        }
                        else {
                            resolve(false);
                        }
                    });
                }
                else {
                    resolve(true);
                }
            });
        }
        catch(error) {
            console.log(error);
        }
    }

    function requiredWith(val) {
        const self = this;
        const validation = _.find(validations, { validator: 'requiredWith' });
        const args = _.cloneDeep(validation.arguments ? validation.arguments : []);
        
        let all = true;

        const manager = new AppManager(app);
        
        for(let arg of args) {
            all = all && _.has(self, arg);
        }
        
        const defaultValue = _.get(property, 'options.default');
        
        if(all && (_.isNull(val) || _.isNil(val) || _.isNaN(val) || val == (utils.isTemplate(defaultValue) ? utils.interpolate(defaultValue) : defaultValue))) {
            return false;
        }
        else {
            return true;
        }
    }

    /** Private methods */

    function getCondition(typeName, paths, doc, insensitive, turkishUnique, parentPath = '') {
        const self = doc;

        const condition = {};
        const value = _.get(self, property.name);

        const manager = new AppManager(app);
        const properties = manager.getProperties(typeName);

        const mainProp = _.find(properties, { name: property.name });
        const mainPropObjectType = _.get(mainProp, 'options.type');
        const mainPropPropertyNames = mainProp 
                ? (insensitive 
                    ? manager.getProperties(mainPropObjectType).map(pp =>  { return { path: pp.name, insensitive: insensitive }}) 
                    : manager.getProperties(mainPropObjectType).map(pp => pp.name) ) 
                : []

        if(mainProp && mainProp.type === 'reference' && self[mainProp.name] && typeof self[mainProp.name] !== 'string') {
            value = self[mainProp.name]._id
        }

        if(mainProp && mainProp.type == 'object' && self[mainProp.name]) {
            const subCondition = getCondition(mainPropObjectType, mainPropPropertyNames, self[mainProp.name], insensitive, turkishUnique, mainProp.name)
            condition = _.assignIn(condition, subCondition)
        }
        else {
        
            if (value && insensitive) {
                const valueReplacedForRegex = value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const currentValue = turkishUnique 
                    ? utils.getTurkishRegexSearchStringPassTurkishCharacters(valueReplacedForRegex, !insensitive) 
                    : valueReplacedForRegex
                condition[(parentPath ? parentPath + '.' : '') + property.name] = { $regex: new RegExp('^' + currentValue + '$', 'i')}
            }
            else {
                condition[(parentPath ? parentPath + '.' : '') + property.name] = self[property.name] || null;
            }
        }

        for (let p of paths) {

            const other = _.has(p, 'path') ? p.path : p; 
            const pathValue = _.get(self, other);

            const prop = _.find(properties, { name: other })
            const propObjectType = _.get(mainProp, 'options.type');
            const propPropertyNames = mainProp 
                ? (p.insensitive 
                    ? manager.getProperties(propObjectType).map(pp =>  { return { path: pp.name, insensitive: p.insensitive }}) 
                    : manager.getProperties(propObjectType).map(pp => pp.name) ) 
                : []

            const pathValueReplacedForRegex = pathValue.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const currentPathValue = p.turkish 
                ? utils.getTurkishRegexSearchStringPassTurkishCharacters(pathValueReplacedForRegex, !p.insensitive) 
                : pathValueReplacedForRegex

            if(prop && prop.type === 'reference' && self[prop.name] && typeof self[prop.name] !== 'string') {
                pathValue = self[prop.name]._id
            }

            if(prop && prop.type === 'object' &&  self[prop.name]) {
                const subPropsCondition = getCondition(propObjectType, propPropertyNames, self[prop.name], p.insensitive ? true : false, p.turkishUnique, prop.name)
                condition = _.assignIn(condition, subPropsCondition)
            }
            else {
                if (pathValue && ((_.has(p, 'insensitive') && p.insensitive) || (!_.has(p, 'insensitive') && insensitive))) {

                    condition[(parentPath ? parentPath + '.' : '') + other] = { $regex: new RegExp('^' + currentPathValue + '$', 'i')}
                }
                else {
                    condition[(parentPath ? parentPath + '.' : '') + other] = _.get(self, other) || null;
                }
            }
        }

        return condition;
    }

    return validators;
}

module.exports = getValidators;