const mongoose = require("mongoose");

const validationError = mongoose.Error.ValidationError;
const validatorError = mongoose.Error.ValidatorError;

module.exports = {
    validationError: validationError,
    validatorError: validationError
};