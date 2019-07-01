const _ = require("lodash");
const AppManager = require("../builder/app.manager");

function mongooseVirtualsCalculated(schema, options) {
    const { app, type, property, locale } = options;
    const manager = new AppManager(app);
    //const expression = _.get(property, 'options.expression');
    const virtual = schema.virtual(property.name)
    .get(function() {
        const expression = _.get(property, 'options.expression');
        let calculatedValue;
        const $app = app;
        const $type = type;
        const $locale = locale;
        const $item = this;
        const $this = $item;
        const lodash = _;

        const argsNames = ['$app', '$type', '$locale', '$item', '$this', '_'];
        const argsValues = [$app, $type, $locale, $item, $this, lodash];

        const body = "return " + expression;
        const calculated = new Function(...argsNames, body);
        
        calculatedValue = calculated(...argsValues);

        return calculatedValue;
    });
}


module.exports = mongooseVirtualsCalculated;