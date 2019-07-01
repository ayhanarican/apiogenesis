const MyLogger = require('./myLogger');

class ErrorLogger extends MyLogger {
    constructor(logging){
        super(logging);
    }
}

module.exports = ErrorLogger;