const event = require('codeceptjs').event;
const recorder = require('codeceptjs').recorder;
const axios = require('axios').default;
const jsesc = require('jsesc');
const moment = require('moment');
const output = require('codeceptjs').output;

require('tls').DEFAULT_MIN_VERSION = 'TLSv1';

const DEFAULT_CONFIG = {
debug: false,
jira_url: 'https://localhost:8080',
jira_user: 'root',
jira_password: 'root',
test_revison: '001',
testEnvironments: '["browser:chrome", "linux"]',
testsExportedFromTestExecution: true,
timeOut: 1200,
proxy: '',
xray_cloudUrl: 'https://xray.cloud.getxray.app',
xray_cloud: false,
xray_clientId: '',
xray_clientSecret: '',
xray_token: ''
};

let info = "";
let tests = "";
const testsResults = [];

module.exports = function (config) {
config = Object.assign({}, DEFAULT_CONFIG, config);

console.log('xrayReport plugin is loaded with config:', config);

event.dispatcher.on(event.test.after, function (test) {
console.log('Test execution completed:', test.title);
let testContainsExamples = false;
test.examples = [];

testsResults.forEach(executedTest => {
const testKeyMatched = !config.testsExportedFromTestExecution &&
    executedTest.tags &&
    test.tags &&
    executedTest.tags[1] &&
    test.tags[1] &&
    executedTest.tags[2] &&
    test.tags[2] &&
    executedTest.tags[1].split("@") &&
    test.tags[1].split("@") &&
    executedTest.tags[2].split("@") &&
    test.tags[2].split("@") &&
    executedTest.tags[1].split("@")[1] === test.tags[1].split("@")[1];

if (testKeyMatched) {
    if (executedTest.examples.length === 0) {
        const status = executedTest.state === "passed" ? (config.xray_cloud ? "PASSED" : "PASS") : (config.xray_cloud ? "FAILED" : "FAIL");
        executedTest.examples.push(status);
    }

    const status = test.state === "passed" ? (config.xray_cloud ? "PASSED" : "PASS") : (config.xray_cloud ? "FAILED" : "FAIL");
    executedTest.examples.push(status);

    if (test.state !== "passed") {
        executedTest.comment = jsesc(test.err.toString().replace(/["'éèêàù]/g, char => char.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    }

    testContainsExamples = true;
}
});

if (!testContainsExamples) {
testsResults.push(test);
}
});

event.dispatcher.on(event.all.after, function () {
testsResults.forEach(test => {
test.state = test.state === "passed" ? 'PASSED' : 'FAILED';
test.comment = test.state === 'PASSED' ? "Successful execution" : jsesc(test.err.toString().replace(/["'éèêàù]/g, char => char.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
console.log("examples:" + JSON.stringify(test.examples));

if (test.examples && test.examples.length > 0) {
    test.examples.forEach(example => {
        // Check if the property 'examples' is defined before calling push
        if (!example.examples) {
            example.examples = [];
        }

        const exampleStatus = example.state === "passed" ? (config.xray_cloud ? "PASSED" : "PASS") : (config.xray_cloud ? "FAILED" : "FAIL");
        example.examples.push(exampleStatus);

        if (example.state !== "passed") {
            example.comment = jsesc(example.err.toString().replace(/["'éèêàù]/g, char => char.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
        }
    });
}
});

if (!config.testsExportedFromTestExecution) {
info = '{"info" : {"summary" : "Execution of automated tests for release ' + config.test_revison + '",  "startDate" : "' + moment().format() + '", "finishDate" :"' + moment().format() + '","revision": "' + config.test_revison + '","description" : "Results of test execution ", "testEnvironments": ' + config.testEnvironments + '},';

testsResults.forEach((test, index) => {
    if (index === 0) {
        tests = '"tests" : [';
        const testKey = config.xray_cloud ? test.tags[2].split("@TEST_")[1] : test.tags[1].split("@")[1];
        tests += '{"testKey":"' + testKey + '","status":"' + test.state + '","examples":' + JSON.stringify(test.examples) + ',"comment":"' + test.comment + '"}';
    } else {
        const testKey = config.xray_cloud ? test.tags[1].split("@TEST_")[1] : test.tags[1].split("@")[1];
        tests += ',{"testKey":"' + testKey + '","status":"' + test.state + '","examples":' + JSON.stringify(test.examples) + ',"comment":"' + test.comment + '"}';
    }
});
} else {
info = '{ "testExecutionKey": "' + testsResults[0].tags[0].split("@")[1] + '","info" : {"startDate" : "' + moment().format() + '", "finishDate" :"' + moment().format() + '","revision": "' + config.test_revison + '","description" : "Results of test execution ", "testEnvironments": ' + config.testEnvironments + '},';

testsResults.forEach((test, index) => {
    if (index === 0) {
        tests = '"tests" : [';
        const testKey = config.xray_cloud ? test.tags[2].split("@TEST_")[1] : test.tags[2].split("@")[1];
        tests += '{"testKey":"' + testKey + '","status":"' + test.state + '","examples":' + JSON.stringify(test.examples) + ',"comment":"' + test.comment + '"}';
    } else {
        const testKey = config.xray_cloud ? test.tags[2].split("@TEST_")[1] : test.tags[2].split("@")[1];
        tests += ',{"testKey":"' + testKey + '","status":"' + test.state + '","examples":' + JSON.stringify(test.examples) + ',"comment":"' + test.comment + '"}';
    }
});
}

if (config.debug) console.log("SEND TO XRAY => " + info + tests + "]}");

recorder.add('Sending new result to xray', function () {
new Promise((doneFn, errFn) => {
    if (config.xray_cloud === true) {
        axios({
            method: 'post',
            url: config.xray_cloudUrl + '/api/v2/authenticate',
            headers: {
                'content-type': 'application/json'
            },
            timeout: config.timeOut,
            proxy: config.proxy,
            data: {
                client_id: config.xray_clientId,
                client_secret: config.xray_clientSecret
            }
        }).then(response => {
            console.log("XRAY RESPONSE => " + response.data);
            config.xray_token = response.data;
            output.print("Access token generated successfully!");

            axios({
                method: 'post',
                url: config.xray_cloudUrl + '/api/v2/import/execution',
                headers: {
                    'content-type': 'application/json',
                    'Authorization': 'Bearer ' + config.xray_token
                },
                timeout: config.timeOut,
                proxy: config.proxy,
                responseType: 'json',
                data: info + tests + ']}'
            }).then(response => {
                console.log("XRAY RESPONSE => " + JSON.stringify(response.data));
                output.print("Test Execution updated successfully!");
            }).catch(error => {
                console.error('Error creating test execution:', error.message);
                if (error.response) {
                    console.error('Error details:', error.response.data);
                } else {
                    console.error('No response received');
                }
            });
        }).catch(error => {
            console.error('Error generating access token:', error.message);
        });
    }
});
});
});
};
