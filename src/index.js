/**
 * Module Dependencies
 */
const config = require('./config');
const restify = require('restify');
const logger  = require('morgan');
const corsMiddleware = require('restify-cors-middleware')

const mongoose = require('mongoose');
const restifyPlugins = require('restify-plugins');
const myQueryParser = require("./helpers/restify.myQueryParser");

const errors = require("restify-errors");
const BuildError = require("./errors/buildError");
const RequestError = require("./errors/requestError");

const qs = require('qs');
const _ = require("lodash");

global.apiRoot = '/api/v1';
global.cache = {
	locales: null,
	clients: null,
	apps: {},
	queries: {}
}

/**
 * Initialize Server
 */

const restifyOptions = {
	name: 'apiogenesis-server',
	version: this.version ? this.version : '1.0.0',
	
	formatters: {
		'application/json': function customizedFormatJSON( req, res, body ) {
			// Copied from restify/lib/formatters/json.js
			function errorMap(error, level) {
				level || (level = 0);
				return {
					name: error.name,
					message: error.message && error.message.length > 256 ? "[Very long message! Please check sub errors!]" : error.message,
					errors: errorsMap(error.errors, ++level),
					path: error.path,
					stack: error.stack
				}
			}

			function errorsMap (errors, level) {
				level || (level = 0);
				if(_.isArray(errors)) {
					for(let error of errors) {
						if(error && error.errors && Object.keys(error).length > 1) {
							error.errors = errorsMap(error.errors, ++level)
						}
					}
				}
				else {
					for(let errorKey in errors) {
						const error = errors[errorKey]
						if(error && error.errors && Object.keys(error).length > 1) {
							error.errors = errorsMap(error.errors, ++level)
						}
					}
				}
				if(errors && errors.map) {
					return errors.filter(error => error != null).map(error => { 
						if(error) {
							delete error.app;
						}
						const obj = {
							name: error.name,
							message: error.message && error.message.length > 256 ? "[Very long message! Please check sub errors!]" : error.message,
							errors: errorsMap(error.errors, ++level),
							path: error.path,
							//stack: error.stack
						};
						return Object.keys(JSON.parse(JSON.stringify(obj))).length > 0 ? (level > 1 ? (error.message && !error.params ? errorMap(error, level) : error): obj) : error;
					})
				}
				else if(errors) {
					const errorKeys = Object.keys(errors);
					for(let key in errors){
						delete errors.app;
						delete errors[key].app;
					}
					return errors;
				}
				else return errors;
			
			};

			if(body.name == "UserAuthenticationError"){
				res.statusCode = 403;
			}
			else if(body.success == true && body.method == "login") {
				res.statusCode = 201;
			}

			if ( body instanceof RequestError || body instanceof errors.BadRequestError || body instanceof errors.InternalServerError || body instanceof errors.InternalError ) {
                // snoop for RestError or HttpError, but don't rely on
				// instanceof
				
				res.statusCode = body.statusCode || 500;

                if ( body.body ) {
                    body = {
                        code: "RequestError",
						message: body.body.message,
						errors: body.jse_info && body.jse_info.errors && body.jse_info.errors.map
							? (body.jse_info.errors.map(err => err.errors 
								? { 
									name: err.name,
									message: err.message, 
									errors: err.errors 
										? errorsMap(err.errors)
										: errorsMap(err.jse_info.errors),
									stack: err.stack
								} 
								: {
									name: err.name,
									message: err.message,
									stack: err.stack
								})) 
							: body.jse_info.errors,
						stack: body.body.stack
                    };
                } else {
                    body = {
                        code: body.name,
						msg: body.message,
						stack: body.stack
                    };
                }
            } else if ( Buffer.isBuffer( body ) ) {
                body = body.toString( 'base64' );
			}

			var data = JSON.stringify( body, null, 2 );
			res.setHeader( 'Content-Length', Buffer.byteLength( data ) );
			res.setHeader( 'Content-Type', 'application/json; charset=utf-8' );
			return data;
		}
	}
	
};

class Apiogenesis {
	// Apiogenesis constructor
	uses = [];
	constructor(options) {
		this.options = options;
	}

	use(fn) {
		this.uses.push(fn);
	}

	start() {
		const server = restify.createServer(_.assignIn(restifyOptions, this.options.restify ? this.options.restify : {}));

		if(this.uses && this.uses.length)
			for(let use of this.uses){
				server.use(use);
			}

		

		server.use(restifyPlugins.jsonBodyParser({ mapParams: false }));
		server.use(restifyPlugins.acceptParser(server.acceptable));
		server.use(myQueryParser());
		server.use(restifyPlugins.fullResponse());
		

		const cors = corsMiddleware({
			preflightMaxAge: 5, //Optional
			origins: ['http://localhost:3000', 'http://localhost:3001'],
			allowHeaders: ['client', 'locale', 'organisation', 'application', 'authorization'],
			//exposeHeaders: ['authorization']
		})
		
		server.pre(cors.preflight)
		server.use(cors.actual)

		/**
		 * Start Server, Connect to DB & Require Routes
		 */

		server.use((req, res, next) => {
			req._options = this.options;

			next();
		})

		if(!this.options.port) {
			this.options.port = 3000;
		}
		
		server.listen(this.options.port, () => {
			// establish connection to mongodb
			
			mongoose.Promise = global.Promise;

			require('./routes/main')(server, this.options);
			console.log(`Server is listening on port ${this.options.port}`);
		});

		server.on('error', (err) => {
			console.log(err);
		})

		this.server = server;
	}
}


module.exports = Apiogenesis;

