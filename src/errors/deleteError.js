const restify = require('restify');
const util    = require('util');
const _ = require("lodash");

const messages = require("../defaults/error.messages");

class DeleteError extends Error {
    constructor (...args) {
        super(...args);
        this.name = 'DeleteError';
        
        this.errors = arguments[1];
        this.app = arguments[2];
        this.locale = arguments[3] || "en";
        this.includeSubErrors = arguments[4];

        let message = _.get(this.app, 'options.default.defaults.errors.deleteError');
        const defaultLocales = ["en", "tr"];
        let locale = this.locale;

        if(!message) {
            message = messages.deleteError;
            
            if(defaultLocales.indexOf(this.locale) == -1) {
                locale = "en";
            }
        }

        const errorMessages = this.errors && this.errors.map ? this.errors.map(err => err.message) : [];
        this.message = message[locale] + arguments[0];
        //if(this.includeSubErrors)
            //this.message += ' :' + errorMessages.join(', ');

        Error.captureStackTrace(this, DeleteError)
    }
}

module.exports = DeleteError;