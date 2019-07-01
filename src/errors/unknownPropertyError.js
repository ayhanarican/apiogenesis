const restify = require('restify');
const util    = require('util');
const _ = require("lodash");

const messages = require("../defaults/error.messages");

class UnknownPropertyError extends Error {
    constructor (...args) {
        super(...args);
        this.name = 'UnknownPropertyError';
        
        this.errors = arguments[1].map(err => err.toString());
        this.app = arguments[2];
        this.locale = arguments[3] || "en";
        this.includeSubErrors = arguments[4];
        this.properties = arguments[5];

        let message = _.get(this.app, 'options.errors.unknownPropertyError');
        const defaultLocales = ["en", "tr"];
        let locale = this.locale;

        if(!message) {
            message = messages.unknownPropertyError;

            if(defaultLocales.indexOf(this.locale) == -1) {
                locale = "en";
            }
        }

        const errorMessages = this.errors ? this.errors.map(err => err) : [];
        this.message = message[locale] + ({ 
            en : `There are ${this.errors.length} problems in items! `, 
            tr: `Öğrelerde toplam ${this.errors.length} problem var! ` 
        })[this.locale] + arguments[0];
        //if(this.includeSubErrors)
            //this.message += ' :' + errorMessages.join(', ');

        this.info = {
            message: "Unknow properties are:",
            properties: this.properties
        };

        this.body = {
            message: "Unknow properties are:",
            properties: this.properties
        }

        Error.captureStackTrace(this, UnknownPropertyError)
    }

    toJSON() {
        return Object.assign({}, this, {
            message: this.message,
            properties: this.properties
        });
    }

    inspect() {
        return Object.assign(new Error(this.message), this);
    }
}

module.exports = UnknownPropertyError;