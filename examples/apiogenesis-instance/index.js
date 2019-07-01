

const Apiogenesis = require('../../src');

const apiogenesis = new Apiogenesis({
    root: '/api/v1',
    paths: {
        apps: '../apps',
        clients: '../apps/_clients.json'
    }
});

apiogenesis.start(3000);


 // For test request GET http://localhost:3000/api/v1/tests?locale=en&organisation=company&application=test
 // For test request GET http://localhost:3000/api/v1/tests?locale=en&organisation=company&application=test&select=name
