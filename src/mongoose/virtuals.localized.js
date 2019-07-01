const _ = require("lodash");



module.exports = function mongooseVirtualsLocalized(schema, options) {
    const { type, localizedProperties, locale } = options;
    
    for(let localizedProperty of localizedProperties) {
        const virtualName = localizedProperty.name + "_localized";
        const virtual = schema.virtual(virtualName)
        
        .get(function() {
            let localized;
            if(this[localizedProperty.name])
                    return this[localizedProperty.name][locale];
            return;
        });
        
    }

    schema.eachPath(function(pathname, schemaType) {
        console.log(type.name, pathname); 
    });
    
    const fn = attachVirtualsMiddleware(schema);

    schema.pre('find', function() {
        if (typeof this.map === 'function') {
          this.map((res) => {
            fn.call(this, res);
            return res;
          });
        } else {
          this.options.transform = (res) => {
            fn.call(this, res);
            return res;
          };
        }
      });

    schema.post('find', fn);
    schema.post('findOne', fn);
    schema.post('findOneAndUpdate', fn);    
}

function attachVirtualsMiddleware(schema) {
    return function(res) {
      attachVirtuals.call(this, schema, res);
    };
}

function attachVirtuals(schema, res) {
    const virtuals = [];
    return res;
}
