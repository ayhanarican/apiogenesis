module.exports = {
	name: 'NewAPI-ES2015',
	version: "0.0.1",
	env: process.env.NODE_ENV || 'development',
	//port: process.env.PORT || 3000,
	base_url: process.env.BASE_URL || 'http://localhost:3000',
	db: {
		uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/newapi-es2015',
	},
	paths: {
		apps: "../apps"
	}
};