# apiogenesis
A dynamic restful API builder from a json schema. This project using restify@8.3.3 and mongoose@5.5.11.

They probably question such dynamic module author under spotlights. I did this project, but you don't do it!

You spend a lot of time on projects. Get some rest! Take time for some fun :)

## Features
* Multi language contents
* Relational mongodb database
* Tree structure
* Multiple sort
* Searching in searchable paths
* Filtering, paging same with mongoose find

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. 

### Installing example project

A step by step series of examples that tell you how to get a development env running.

Follow these simple steps to run the example application.

```
git clone https://github.com/ayhanarican/apiogenesis.git
cd apiogenesis
npm install

cd examples/apiogenesis-instance
npm install
npm start
```
For test running application

GET http://localhost:3000/api/v1/tests?locale=tr&organisation=company&application=test&select=name

or

GET http://localhost:3000/api/v1/tests/$find?locale=tr&organisation=company&application=test&search=localized

## Running the tests

To run test

```
npm test
```
## Contributing

Please read [CONTRIBUTING.md](https://gist.github.com/ayhanarican/cb0a2dc11934bedcfe2813ad01e4392e) for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/ayhanarican/apiogenesis/tags). 

## Authors

* **Ayhan ARICAN** - *Initial work* - [ayhanarican](https://github.com/ayhanarican)

See also the list of [contributors](https://github.com/ayhanarican/apiogenesis/contributors) who participated in this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

