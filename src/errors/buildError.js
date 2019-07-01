var restify = require('restify');
var util    = require('util');

class BuildError extends Error {
    constructor (args) {
        super(args);
        this.name = 'BuildError';
        this.message = "Error when build: ";//arguments[0],
        this.errors = arguments[1];

        Error.captureStackTrace(this, BuildError);
    }
}

module.exports = BuildError;