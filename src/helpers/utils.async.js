const fs = require("fs");
const util = require('util');
const rra = require('recursive-readdir-async');
const _ = require("lodash");


// Convert fs.readFile into Promise version of same    
const exists = util.promisify(fs.exists);
const readFile = util.promisify(fs.readFile);
const access = util.promisify(fs.access);
const stat = util.promisify(fs.stat);

class UtilsAsync {
    static async handleError(error) {
        new Promise(resolve => { 
            console.log(error);
            resolve(error); 
        })
    }

    static async doAction(action) {
        let result;
        try {
            result = await action;
        }
        catch(error) {
            result = error;
        }

        return result;
    }

    static async *AsyncIterator (options) {
        const { items, obj, method, args, extraArr } = options;
        let index = 0;
        
        const argNames = args;
        
        if(extraArr && items.length != extraArr.length){
            console.log("items and extraArr", items, extraArr);
            throw new Error("AsyncIterator: length of items and extraArr must be same");
        }

        while(index < items.length) {
            const item = items[index];
            const $item = {};

            const keys = Object.keys(item);
            for(let key of keys){
                $item['$'+ key] = item[key];
            }

            const scope = _.assign($item, {
                '$this': item,
                '$item': $item,
                '$extra': extraArr ? extraArr[index] : extraArr,
                '$method': method,
                '$obj': obj,
                '$argNames': argNames,
                '$extraArr': extraArr
            });
            
            const getItemValue = (arg) => {
                if(_.isString(arg) && arg.substr(0, 1) == '$')
                    return _.get(scope, arg);
                else 
                    return arg;
            };
            
            const argValues = argNames.map(arg => getItemValue(arg));
            let result;
            
            try {
                result = await obj[method](...argValues);
            }
            catch(error) {
                result = error;
            }

            index++;

            yield result;

            if(index == items.length){
                return;
            }
        }
    }

    static async checkFileAccess(path) {
        await access(path);

        return true;
    }

    static async fileStat(path, options) {
        const stats = await stat(path, options);
        return stats;
    } 

    static async pathExists(path) {
        const isExists = await exists(path);

        return isExists;
    }

    static async readJSONFile(path) {
        const jsonFile = await readFile(path);

        return jsonFile ? JSON.parse(jsonFile.toString()) : jsonFile;
    }

    static async readDirectory(path, recursive = true) {
        const options = {
            mode: rra.LIST,
            recursive: recursive,
            stats: false,
            ignoreFolders: true,
            extensions: false,
            deep: false,
            realPath: true,
            normalizePath: true,
            include: [],
            exclude: [],
            readContent: true
        };
        const directories = await rra.list(path, options, (obj, index, total) => {
            // do something
            //console.log(obj, index, total)
        });

        return directories;
    }
}

module.exports = UtilsAsync;