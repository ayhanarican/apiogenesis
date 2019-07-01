process.env.NODE_ENV = 'test';

const _ = require("lodash");
const mongoose = require("mongoose");

// Require the dev-dependencies
const mocha = require("mocha");
const chai = require('chai');
const chaiHttp = require('chai-http');
const chaiLike = require('chai-like');
const assertArrays = require('chai-arrays');


// Require api index
/*
const NewAPI = require("../index");

const newAPI = new NewAPI({
	name: 'NewAPI-ES2015-Test',
	version: '0.0.1',
	apiRoot: '/api/v1',
	appsPath: './src/apps'
});
*/
const newAPI = require("../index");

const server = newAPI.server;


const MyLogger = require("../helpers/myLogger");
const myLogger = new MyLogger(true);
const utils = require("../helpers/utils");

// Using chai plugins
chai.use(chaiLike);
chai.use(assertArrays);
chai.use(require('chai-uuid'));
chai.use(chaiHttp);

let should = chai.should();
let expect = chai.expect;

// Require application modules
const Application = require("../builder/application");
const RepositoryBase = require("../repository/repository.base");
const AppSchema = require("../builder/app.schema");
const locales = require("../apps/_defaults/_locales.json");



describe('Application tests', () => {
    it('utils.objectEquals', () =>{
        const obj1 = {
            name: "test",
            arr: [0, 1, 2, 3]
        };

        const obj2 = {
            name: "test",
            arr: [3, 2, 1, 0]
        };

        const obj3 = {
            name: "test",
            title: "Test",
            arr: [3, 2, 1, 0]
        };

        const obj4 = {
            name: "test",
            title: "Test",
            arr: [4, 3, 2, 1, 0]
        };

        const result = utils.objectEquals(obj1, obj2) && 
                        !utils.objectEquals(obj1, obj3);
                        !utils.objectEquals(obj3, obj4);

        
        expect(result).to.be.equal(true);
    });

    it('utils.arrayEquals', () =>{
        const arr1 = [0, 1, 2, 3];
        const arr2 = [3, 2, 1, 0];
        const arr3 = [4, 3, 2, 1, 0];

        const result = utils.arrayEquals(arr1, arr2) && 
                        !utils.arrayEquals(arr1, arr3);
        
        expect(result).to.be.equal(true);
    });
    
    it('Properties of application tests', async () => {


        const appsPath = "./src/apps/_defaults/apps";
        const app = await Application.readSchema(appsPath, "/_root");
        const application = new Application(app, locales, "tr", "_defaults", true);

        expect(application).to.have.property('app').an('object');

    });

    it('Application schema validation test', async () => {

        const appsPath = "./src/apps/_defaults/apps";
        const app = await Application.readSchema(appsPath, "/_root");

        const appSchema = new AppSchema(app, locales);
        const result = await appSchema.validate();

        expect(result).to.eql(app);

    });

    it('Repository : create role test', async () => {
        const appsPath = "./src/apps/_defaults/apps";
        const app = await Application.readSchema(appsPath, "/_root");
        const application = new Application(app, locales, "tr", "_defaults");
        const buildErrors = await application.build();

        const repository = new Repository(application);
        const result = await repository.create("role", {
            org: "_defaults",
            app: "_master",
            name: "TestRole",
            level: 500000
        });

        expect(result).to.be.an("object");
    });

    it('Repository : find all roles test', async () => {
        const appsPath = "./src/apps/_defaults/apps";
        const app = await Application.readSchema(appsPath, "/_root");
        const application = new Application(app, locales, "tr", "_defaults");
        const buildErrors = await application.build();

        const repository = new RepositoryBase(application);
        const result = await repository.findAll("role");

        expect(result).to.be.an("array");
    });

    it('Repository : create advancedtest test', async () => {
        const appsPath = "./src/apps/_defaults/apps";
        const app = await Application.readSchema(appsPath, "/_root");
        const application = new Application(app, locales, "tr", "_defaults");
        const buildErrors = await application.build();

        const repository = new Repository(application);
        const complexTest = await repository.create("advancedtest", {
            name: "firstTest",
            title: {
                "en": "Complex Test",
                "tr": "Karmaşık Test"
            },
            kind: "chai-http"
        });
        
        const simpleTest = await repository.create("advancedtest", {
            parent: complexTest._id,
            name: "simpleTest",
            title: {
                "en": "Simple Test",
                "tr": "Simple Test"
            },
            kind: "chai"
        });

        const mochaTest = await repository.create("advancedtest", {
            parent: simpleTest._id,
            name: "mochaTest",
            title: {
                "en": "Mocha Test",
                "tr": "Mocha Test"
            },
            kind: "mocha"
        });

        expect(complexTest).to.be.an("object");
        expect(simpleTest).to.be.an("object");
        expect(mochaTest).to.be.an("object");
    });

    it('Repository : create complextest test', async () => {
        const appsPath = "./src/apps/_defaults/apps";
        const app = await Application.readSchema(appsPath, "/_root");
        const application = new Application(app, locales, "tr", "_defaults");
        const buildErrors = await application.build();

        const repository = new RepositoryBase(application);
        const complexTest = await repository.create("complextest", {
            name: "complexTest",
            title: {
                "en": "Complex Test",
                "tr": "Karmaşık Test"
            },
            kind: "chai-http"
        });
        
        const simpleTest = await repository.create("complextest", {
            parent: complexTest._id,
            name: "complexSimpleTest",
            title: {
                "en": "Simple Test",
                "tr": "Simple Test"
            },
            kind: "chai"
        });

        const mochaTest = await repository.create("complextest", {
            parent: simpleTest._id,
            name: "complexMochaTest",
            title: {
                "en": "Mocha Test",
                "tr": "Mocha Test"
            },
            kind: "mocha"
        });

        expect(complexTest).to.be.an("object");
        expect(simpleTest).to.be.an("object");
        expect(mochaTest).to.be.an("object");
    });

    it('Repository : find all tests test', async () => {
        const appsPath = "./src/apps/_defaults/apps";
        const app = await Application.readSchema(appsPath, "/_root");
        const application = new Application(app, locales, "tr", "_defaults", true);
        const buildErrors = await application.build();

        const repository = new RepositoryBase(application);
        const result = await repository.findAll("test");

        expect(result).to.be.an("array");
    });

    it('Repository : find tests test', async () => {
        const appsPath = "./src/apps/_defaults/apps";
        const app = await Application.readSchema(appsPath, "/_root");
        const application = new Application(app, locales, "tr", "_defaults", true);
        const buildErrors = await application.build();

        const repository = new RepositoryBase(application);
        const result = await repository.find("test", {
            /*
            filter: {
                name: { $regex: "advanced", $options: "gi" }
            },
            */
            //fields: "name tests",
            options: { 
                sort: { name: 1 },
                skip: 0,
                limit: 10
            },
            populate: [
                { 
                    path: "parent"
                }, 
                { 
                    path: "tests", 
                    populate: [
                        {
                            path: "parent"
                        },
                        { 
                            path: "tests", 
                            //select: "name tests" 
                        }
                    ], 
                    //select: "name tests" 
                }]
        });

        expect(result).to.be.an("array");
        expect(result.length).to.equal(10);
        expect(result.map(test => test.name)).to.be.sorted();
    });
});