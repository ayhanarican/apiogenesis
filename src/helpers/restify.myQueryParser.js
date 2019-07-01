"use strict";
/**
 * Module dependencies
 */
const qs = require("qs");
const _ = require("lodash");
const pluralize = require("pluralize");

/**
 * @public
 * @function myQueryParser
 * @param {Object} options 
 * @returns {Function}
 */
function myQueryParser(options) {

    var opts = options || {};

	function parser(req, res, next) {
		if(!req.getQuery()) {
			req.query = {};
			return next();
		}

		req.query = qs.parse(req.getQuery(), opts);
	
		req.query = JSON.parse(JSON.stringify(req.query), function(k, v) { 
            return (typeof v === "object" || isNaN(v)) ? v : parseInt(v, 10); 
		});
		
		return next();
	};

	return parser;
}



module.exports = myQueryParser;