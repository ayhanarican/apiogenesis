const _ = require("lodash");



function mongooseVirtualsDisplay(schema, options) {
    const { app, type, locale, displayNameProperty } = options;
    const virtual = schema.virtual(displayNameProperty)
        .get(function() {
            const expression = _.get(type, 'options.display') ? type.options.display : "($type.name + ' ' + $item._id)";
            const $app = app;
            const $type = type;
            const $locale = locale;
            const $item = this;
            const $this = $item;
            const $doc = this;
            const lodash = _;
        
            const argsNames = ['$app', '$type', '$locale', '$item', '$doc', '$this', '_'];
            const argsValues = [$app, $type, $locale, $item, $doc, $this, lodash];
        
            const body = "return " + expression;
            const display = new Function(...argsNames, body);
        
            const displayValue = display(...argsValues);
            
            return displayValue;
        });

    /*
    schema.pre('findOneAndUpdate', function(next) {
        this.options.runValidators = true;
        next();
    });
    */
    
}



module.exports = mongooseVirtualsDisplay;