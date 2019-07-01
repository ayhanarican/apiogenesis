
class BaseClass {
    constructor() {
        super._hashCode = this._getHash();
        global.getConstructorByHash = (hash) => {
            return global._hash[hash];
        };
    }

    _getHash() {
        global._hash || (global._hash = 0);
        global._hashes || ( global._hashes = []);
        if(global._hash == 0) 
            global._hashes.push(null);
        if(global._hash == Number.MAX_SAFE_INTEGER)
            throw new Error("Max object count limit!");
        global._hash++;
        global._hashes.push(this.constructor.name);
        return global._hash;
    }

    get hash() {
        return this._hashCode;
    }

    get lastHash() {
        return global._hash;
    }
}

module.exports = BaseClass;