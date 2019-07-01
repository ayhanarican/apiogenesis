const _ = require("lodash");
const mpath = require('mpath');
const util = require('util');

module.exports = function mongooseVirtualsCollections(schema, options) {
    const { app, type, collections } = options;
    
    if(collections) {
        for(let collection of collections){
            if(collection.options && collection.options.many) {
                // Set collection by virtual property
                schema.virtual(collection.name, {
                    ref: collection.options.type,
                    localField: '_id',
                    foreignField: collection.options.reference.property
                });
                
                function processDocuments() {
                    const self = this;

                    if (self && typeof self.map === 'function') {
                        self.map((res) => {
                            return doProcess(res);
                        });
                    } else {
                        self.transform = (res) => {
                            return doProcess(res);
                        };
                    }
                }

                function doProcess(res) {
                    const collectionReference = _.get(collection, 'options.collection.reference');
                    if(_.isArray(res)) {
                        if(collectionReference) {
                            for(let item of res) {
                                if(res[res.indexOf(item)][collection.name])
                                    item[collection.name] = 
                                        item[collection.name]
                                        .map(citem => citem[collectionReference.property]);
                             }
                        }
                    }
                    else if(_.isObject(res)) {
                        if(res[collection.name])
                            res[collection.name] = 
                                res[collection.name]
                                        .map(citem => citem[collectionReference.property]);
                    }
                    return res;
                }

                schema.pre('find', processDocuments);
                schema.pre('findOne', processDocuments);
                schema.pre('findOneAndUpdate', processDocuments);

            } 
            else if(  _.get(collection, 'options.type') && 
                        _.get(collection, 'options.reference.property')){
                schema.virtual(collection.name, {
                    ref: collection.options.type,
                    localField: '_id',
                    foreignField: collection.options.reference.property
                });

                schema.pre('find', () => {});
                schema.pre('findOne', () => {});
                schema.pre('findOneAndUpdate', () => {});


            }
        }
    }
    
    /*
    schema.pre('find', setKeyOrderHandler);
    schema.pre('findOne', setKeyOrderHandler);
    schema.pre('findOneAndUpdate', setKeyOrderHandler);

    function setKeyOrderHandler(){
        const self = this;

        if (self && typeof self.map === 'function') {
            self.map((res) => {
                return setKeyOrder(res);
            });
        } else {
            self.transform = (res) => {
                return setKeyOrder(res);
            };
        }
    }

    function setKeyOrder(res){
        return res;
    }
    */
    /*
    schema.options.toObject = () => {
        const newObj = {
            _id: this._id
        }

        return newObj;
    }
    */

    /*    
    schema.eachPath(function(pathname, schemaType) {
        //console.log(schema.options.collection, pathname); 
    }); 
    */
    
}


