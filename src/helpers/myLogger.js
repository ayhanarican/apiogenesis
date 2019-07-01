const util = require('util');
const _ = require("lodash");

class MyLogger {
    constructor(logging){
        this.logging = logging;
    }
    
    log(...args) {
        if(this.logging){
            if(args.length == 1 && _.isPlainObject(args[0])) {
                console.log(util.inspect(args[0], true, null, true /* enable colors */))
            }
            else {
                console.log(...args);
            }
        }
        
        if(this.activatedOnce) {
            this.logging = false;
            this.activatedOnce = false;
        }
    }

    activate() {
        this.logging = true;
    }

    activateOnce() {
        this.activatedOnce = true;
        this.logging = true;
    }
}

module.exports = MyLogger;