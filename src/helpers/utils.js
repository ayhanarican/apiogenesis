'use strict';

const _ = require('lodash');

class Utils {
    /**
     * https://stackoverflow.com/questions/201183/how-to-determine-equality-for-two-javascript-objects/16788517#16788517
     * @param {any} x 
     * @param {any} y 
     */
    static objectEquals(x, y) {

        if (x === null || x === undefined || y === null || y === undefined) { return x === y; }
        // after this just checking type of one would be enough
        if (x.constructor !== y.constructor) { return false; }
        // if they are functions, they should exactly refer to same one (because of closures)
        if (x instanceof Function) { return x === y; }
        // if they are regexps, they should exactly refer to same one (it is hard to better equality check on current ES)
        if (x instanceof RegExp) { return x === y; }
        if (x === y || x.valueOf() === y.valueOf()) { return true; }
        if (Array.isArray(x) && x.length !== y.length) { return false; }

        // if they are dates, they must had equal valueOf
        if (x instanceof Date) { return false; }

        // if they are strictly equal, they both need to be object at least
        if (!(x instanceof Object)) { return false; }
        if (!(y instanceof Object)) { return false; }

        // recursive object equality check
        var p = Object.keys(x);
        return Object.keys(y).every(function (i) { return p.indexOf(i) !== -1; }) &&
            p.every(function (i) { 
                return Utils.objectEquals(x[i], y[i]) || 
                (Array.isArray(x[i]) && Array.isArray(y[i]) && Utils.arrayEquals(x[i], y[i])) 
            });
    }

    static arrayEquals(x, y) {
        if(!Array.isArray(x) && !Array.isArray(y)) { return false; }
        if (x.length !== y.length) { return false; }

        return Object.keys(x).every((i) => {
            // Is there any item equals x[i] in y
            let result = false;
            
            for(let yj of y) {
                if(Utils.objectEquals(x[i], yj))
                    result = true;
            }

            return result;
        })

    }

    static autoParseNumbers(obj) {
        let newObj = JSON.parse(JSON.stringify(obj));
        if (typeof obj == "string") {
            if (Number.parseInt(obj) instanceof Number) {
                return Number.parseInt(obj[prop])
            }
            else if (Number.parseFloat(obj) instanceof Number) {
                return Number.parseFloat(obj)
            }
        }
        if (typeof obj == "object") {
            for(let prop in obj) {
                if (obj[prop] instanceof String) {
                    if (parseInt(obj[prop]) instanceof Number) {
                        newObj[prop] = parseInt(obj[prop])
                    }
                    if (parseFloat(obj[prop]) instanceof Number) {
                        newObj[prop] = parseFloat(obj[prop])
                    }

                    
                    if (obj[prop] instanceof Object) {
                        newObj[prop] = Object.assign(obj[prop], autoParseNumbers(obj[prop]))
                    }
                    else if (Array.isArray(obj[prop])) {
                        newObj[prop] = newObj[prop].map(sobj => {
                            return autoParseNumbers(sobj)
                        })
                    }


                }

            }
        }
        return newObj;
    }

    ///////////////////////////////////////////////////////////////
    /// The borrowed tests, run them by clicking "Run code snippet"
    ///////////////////////////////////////////////////////////////
    static get printResult() {
        return (x) => {
            if (x) { console.log("\x1b[32m", "Passed.", true.toString()); }
            else { console.log("\x1b[31m", "Failed.", false.toString()); }
        }
    }

    static get assert() {
        return {
            isTrue: function (x) { Utils.printResult(x); },
            isFalse: function (x) { Utils.printResult(!x); }
        }
    }

    static isTemplate(template) {
        new RegExp()
        return template && (/\$[A-Za-z0-9\_]+/.test(template) || template.substr(0, 2) == '_.' || template.substr(0, 1) == '(')
    }

    static interpolate(template, scope) {
        return (new Function(Object.keys(scope), "return " + template))(...Object.values(scope));
    }

    static getTurkishRegexSearchStringPassTurkishCharacters(search, sensitive) {
        const table_insensitive = {
            "ç": "[ÇçcC]",
            "c": "[ÇçcC]",
            "ğ": "[ĞğgG]",
            "g": "[ĞğgG]",
            "ı": "[Iıiİ]",
            "i": "[İiıI]",
            "ö": "[ÖöoO]",
            "o": "[ÖöoO]",
            "ş": "[ŞşsS]",
            "s": "[ŞşsS]",
            "ü": "[ÜüuU]",
            "u": "[ÜüuU]",
            "Ç": "[ÇçcC]",
            "C": "[ÇçcC]",
            "Ğ": "[ĞğgG]",
            "G": "[ĞğgG]",
            "I": "[Iıiİ]",
            "İ": "[İiıI]",
            "Ö": "[ÖöoO]",
            "O": "[ÖöoO]",
            "Ş": "[ŞşsS]",
            "S": "[ŞşsS]",
            "Ü": "[ÜüuU]",
            "U": "[ÜüuU]"
        };

        const table_sensitive = {
            "ç": "[çc]",
            "c": "[çc]",
            "ğ": "[ğg]",
            "g": "[ğg]",
            "ı": "[ıi]",
            "i": "[iı]",
            "ö": "[öo]",
            "o": "[öo]",
            "ş": "[şs]",
            "s": "[şs]",
            "ü": "[üu]",
            "u": "[üu]",
            "Ç": "[ÇC]",
            "C": "[ÇC]",
            "Ğ": "[ĞG]",
            "G": "[ĞG]",
            "I": "[Iİ]",
            "İ": "[İI]",
            "Ö": "[ÖO]",
            "O": "[ÖO]",
            "Ş": "[ŞS]",
            "S": "[ŞS]",
            "Ü": "[ÜU]",
            "U": "[ÜU]"
        };

        let newSearch = "";
        if (search) {
            for (let index in search) {
                var ch = search[index];
                newSearch += sensitive 
                    ? 
                        (table_sensitive[ch] 
                            ? table_sensitive[ch] 
                            : ch)  
                    :  (table_insensitive[ch] 
                        ? table_insensitive[ch] 
                        : ch);
            }
        }
    
        return newSearch;
    }

    static getTurkishRegexSearchString(search, sensitive) {
        const table_insensitive = {
            "ç": "[Çç]",
            "ğ": "[Ğğ]",
            "ı": "[Iı]",
            "i": "[İi]",
            "ö": "[Öö]",
            "ş": "[Şş]",
            "ü": "[Üü]",
            "Ç": "[Çç]",
            "Ğ": "[Ğğ]",
            "I": "[Iı]",
            "İ": "[İi]",
            "Ö": "[Öö]",
            "Ş": "[Şş]",
            "Ü": "[Üü]",
        };

        let newSearch = "";
        if (search) {
            for (let index in search) {
                var ch = search[index];
                newSearch += sensitive ? ch : (table_insensitive[ch] ? table_insensitive[ch] : ch);
            }
        }
    
        return newSearch;
    }

    /**
     * 
     * @param {String} string 
     * 
     *  toPascalCase('foo bar');
        // => 'FooBar'
        
        toPascalCase('fooBar');
        // => 'FooBar'
        
        toPascalCase('--FOO-BAR--');
        // => 'FooBar'
     */
    static toPascalCase(string) {
        return _.capitalize(string)
    }

    /**
     * 
     * @param {String} string 
     * 
     *  toCamelCase('Foo Bar');
        // => 'fooBar'
        
        toCamelCase('fooBar');
        // => 'fooBar'
        
        toCamelCase('--FOO-BAR--');
        // => 'fooBar'
     */

    static toCamelCase(string) {
        return _.camelCase(string);
    }

    /**
     * 
     * @param {String} string 
     * 
     *  toSnakeCase('Foo Bar');
        // => 'foo_bar'
        
        toSnakeCase('fooBar');
        // => 'foo_bar'
        
        toSnakeCase('--FOO-BAR--');
        // => 'foo_bar'
     */

    static toSnakeCase(string) {
        return _.snakeCase(string);
    }
}

module.exports = Utils;