const restify = require('restify');
const util    = require('util');
const _ = require("lodash");

class RequestError extends Error {
    constructor (...args) {
        super(...args);
        this.name = 'CreateError';
        
        this.errors = arguments[1];
        this.app = arguments[2];
        this.locale = arguments[3] || "en";
        this.includeSubErrors = arguments[4];

        //this.body.errors.push(...this.errors)

        let message =  _.get(this.app, 'options.default.defaults.errors.requestError');
        const defaultLocales = ["en", "tr"];
        let locale = this.locale;

        if(!message) {
            message = messages.requestError;

            if(defaultLocales.indexOf(this.locale) == -1) {
                locale = "en";
            }
        }

        const errorMessages = this.errors ? this.errors.map(err => err.message) : [];
        this.message = message[locale] + arguments[0];
        //if(this.includeSubErrors)
            //this.message += ' :' + errorMessages.join(', ');

        Error.captureStackTrace(this, RequestError)
    }

    toJSON() {
        return Object.assign({}, this);
    }
}

module.exports = RequestError;