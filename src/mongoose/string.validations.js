const validate = require("../lib/mongoose-validator/index");
const validator = require("validator");

const extend = validate.extend;
const exists = validate.exists;
const _ = require("lodash");

const locales = require("../defaults/locales.json");

const utils = require("../helpers/utils");
const AppManager = require("../builder/app.manager");

const messages = require("../defaults/string.validations.messages.json");

function getValidations(builder, app, type, property, locale) {
    if (!property)
        throw new Error("validations: 'property' parameter is not be null");

    const manager = new AppManager(app);

    const defaultLocales = ["en", "tr"];
    locale = defaultLocales.indexOf(locale) == -1 ? "en" : locale;

    if (!exists('inList')) extend('inList', inList, messages.inList[locale]);
    //if (!exists('isUUID')) extend('isUUID', validator.isUUID, messages.isUUID[locale]);

    if (!exists('isPropertyNameIfHasType'))
        extend('isPropertyNameIfHasType',
            isPropertyNameIfHasTypeHandler(app, type, property),
            messages.isPropertyName[locale]);

    if (!exists('isPropertyNameOrAsteriskIfHasType'))
        extend('isPropertyNameOrAsteriskIfHasType',
            isPropertyNameOrAsteriskIfHasTypeHandler(app, type, property),
            messages.isPropertyName[locale]);


    const validations = [];

    const propertyValidations = _.get(property, 'options.validations');
    if (propertyValidations) {
        for (let validation of propertyValidations) {
            if (validation) {
                if (validation.arguments && _.isArray(validation.arguments)) {
                    validation.arguments = validation.arguments
                        .map(argument => (_.isString(argument)
                            ? (utils.isTemplate(argument) 
                                ? utils.interpolate(argument, manager.getDefaultScope(app, type, property)) 
                                : argument)
                            : argument));
                        
                        const validationsRequiredLocaleInArgs = [
                            "isAlpha",
                            "isAlphanumeric"
                        ];

                        const validationsRequiredLocaleInOptions = [
                            "isDecimal",
                            "isFloat"
                        ];
                        const localeObj = _.find(locales, { symbol: locale });

                        if(validationsRequiredLocaleInArgs.indexOf(validation.validator) != -1) {
                            
                            if(localeObj) {
                                validation.arguments.push(localeObj.default);
                            }
                        }

                        if(validationsRequiredLocaleInOptions.indexOf(validation.validator) != -1) {
                            if(validation.arguments.length) {
                                if(localeObj) {
                                    const decimalOptions = validation.arguments[0];
                                    decimalOptions.locale = localeObj.default;
                                    validation.arguments[0] = decimalOptions;
                                }
                            }
                        }
                }
                else if(validation.arguments && utils.isTemplate(validation.arguments)){
                    validation.arguments = utils.interpolate(validation.arguments, manager.getDefaultScope(app, type, property));
                }
                validations.push(
                    {
                        validator: validation.validator,
                        arguments: validation.arguments,
                        message: validation.message[locale],
                        passIfEmpty: validation.passIfEmpty
                    }
                );
            }
        }
    }

    return validations;
}

function inList(val, ...args) {
    return args[0].indexOf(val) != -1
}


function isPropertyNameIfHasTypeHandler(app, type, property) {
    function isPropertyNameIfHasType(val, ...args) {
        const manager = new AppManager(app);
        const properties = manager.Properties(this.type);
        return properties.map(p => p.name).indexOf(val) != -1;
    }
    return isPropertyNameIfHasType;
}

function isPropertyNameOrAsteriskIfHasTypeHandler(app, type, property) {
    function isPropertyNameOrAsteriskIfHasType(val, ...args) {
        if (!_.isString(val))
            return false;
        const manager = new AppManager(app);
        const properties = manager.getProperties(this.type);
        return properties.map(p => p.name).indexOf(val) != -1 || val == '*';
    }
    return isPropertyNameOrAsteriskIfHasType;
}

module.exports = getValidations;