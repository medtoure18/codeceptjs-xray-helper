const event = require('codeceptjs').event;
const recorder = require('codeceptjs').recorder;
const output = require('codeceptjs').output;
const moment = require('moment');
const request = require('request');
const jsesc = require('jsesc');
const fs = require('fs');
require('tls').DEFAULT_MIN_VERSION = 'TLSv1';


const defaultConfig = {
    debug: false,
    jira_url: 'https://localhost:8080',
    jira_user: 'root',
    jira_password: 'root',
    test_revison: '001',
    testEnvironments: '["browser:chrome", "linux"]',
    testsExportedFromTestExecution: true,
    timeOut: 1200,
    proxy: ''
};
var info = "";
var tests = "";
var testsResults = [];
module.exports = function (config) {
    var config = Object.assign(defaultConfig, config);
    //we get test results after each test
    event.dispatcher.on(event.test.after, function (test) {
        let testContainsExemples = false;
        test.examples = [];
        // we search if the same test have been executed before, if yes thats mean that the test is an outline scenario with exemples
        testsResults.forEach(executedTest => {
            if (!config.testsExportedFromTestExecution) {
                if (executedTest.tags[1].split("@")[1] == test.tags[1].split("@")[1]) {
                    //we add the first test result status in exemples array
                    if (executedTest.examples.length == 0) {
                        if (executedTest.state == "passed") executedTest.examples.push("PASS");
                        else executedTest.examples.push("FAIL");
                    }
                    //we add the actual test result status in exemples array
                    if (test.state == "passed") executedTest.examples.push("PASS")
                    else {
                        executedTest.examples.push("FAIL");
                        executedTest.comment = jsesc(test.err.toString().replace(/\"/g, "").replace(/\'/g, "").replace(/\é/g, "e").replace(/\è/g, "e").replace(/\ê/g, "e").replace(/\à/g, "a").replace(/\ù/g, "u"));
                    }
                    testContainsExemples = true;
                }
            } else {
                if (executedTest.tags[2].split("@")[1] == test.tags[2].split("@")[1]) {
                    //we add the first test result status in exemples array
                    if (executedTest.examples.length == 0) {
                        if (executedTest.state == "passed") executedTest.examples.push("PASS")
                        else executedTest.examples.push("FAIL")
                    }
                    //we add the actual test result status in exemples array
                    if (test.state == "passed") executedTest.examples.push("PASS")
                    else {
                        executedTest.examples.push("FAIL");
                        executedTest.comment = jsesc(test.err.toString().replace(/\"/g, "").replace(/\'/g, "").replace(/\é/g, "e").replace(/\è/g, "e").replace(/\ê/g, "e").replace(/\à/g, "a").replace(/\ù/g, "u"));
                    }
                    testContainsExemples = true;
                }

            }
        });

        //we store test result
        if (!testContainsExemples) testsResults.push(test);
    });


    /* at the end of all the tests we complete the json and send it to xray by api*/
    event.dispatcher.on(event.all.after, function (suite) {
        //we change test state syntax to meet xray requirement
        testsResults.forEach(test => {
            if (test.state == "passed") {
                test.state = 'PASS';
                test.comment = "Successful execution";
            } else {// if the test is failed, we get the reason for the failure
                test.state = 'FAIL';
                //we remove special characteres to make xray api accept our description message
                test.comment = jsesc(test.err.toString().replace(/\"/g, "").replace(/\'/g, "").replace(/\é/g, "e").replace(/\è/g, "e").replace(/\ê/g, "e").replace(/\à/g, "a").replace(/\ù/g, "u"));
                console.log(test.comment);
            }
            console.log("examples:" + JSON.stringify(test.examples));

        });
        if (!config.testsExportedFromTestExecution) {
            info = '{"info" : {"summary" : "Execution of automated tests for release ' + config.test_revison + '",  "startDate" : "' + moment().format() + '", "finishDate" :"' + moment().format() + '","revision": "' + config.test_revison + '","description" : "Results of test execution ", "testEnvironments": ' + config.testEnvironments + '},';
            var i = 0;
            testsResults.forEach(test => {
                if (i == 0) {
                    tests = '"tests" : [';
                    // if this is the first test that is added to the list of tests executed.
                    tests = tests + "" + '{"testKey":"' + test.tags[1].split("@")[1] + '","status":"' + test.state + '", "examples":' + JSON.stringify(test.examples) + ',"comment" : "' + test.comment + '" }';
                } else tests = tests + "" + ',{"testKey":"' + test.tags[1].split("@")[1] + '","status":"' + test.state + '", "examples":' + JSON.stringify(test.examples) + ',"comment" : "' + test.comment + '" }';
                i = i + 1;
            });
        } else {
            info = '{ "testExecutionKey": "' + testsResults[0].tags[0].split("@")[1] + '","info" : {"startDate" : "' + moment().format() + '", "finishDate" :"' + moment().format() + '","revision": "' + config.test_revison + '","description" : "Results of test execution ", "testEnvironments": ' + config.testEnvironments + '},';
            var i = 0;
            testsResults.forEach(test => {
                if (i == 0) {
                    tests = '"tests" : [';
                    // if this is the first test that is added to the list of tests executed.
                    tests = tests + "" + '{"testKey":"' + test.tags[2].split("@")[1] + '","status":"' + test.state + '", "examples":' + JSON.stringify(test.examples) + ',"comment" : "' + test.comment + '" }';
                } else tests = tests + "" + ',{"testKey":"' + test.tags[2].split("@")[1] + '","status":"' + test.state + '", "examples":' + JSON.stringify(test.examples) + ',"comment" : "' + test.comment + '" }';
                i = i + 1;
            });
        }

        if (config.debug) console.log("SEND TO XRAY=>" + info + tests + "]}");
        // we send the file to xray api
        recorder.add('Sending new result to xray', function () {
            new Promise((doneFn, errFn) => {
                request({
                    url: config.jira_url + "/rest/raven/1.0/import/execution",
                    headers: {
                        "content-type": "application/json",
                        'Authorization': 'Basic ' + Buffer.from(config.jira_user + ':' + config.jira_password).toString('base64')
                    },
                    method: 'POST',
                    proxy: config.proxy,
                    timeout: config.timeOut,
                    body: info + tests + "]}"
                }, function (error, response, body) {
                    if (!error) {
                        if (config.debug) console.log("XRAY RESPONSE=>" + body);
                        output.print("Tests results sended to XRAY on TestExecution: " + (JSON.parse(body)).testExecIssue.key);
                    } else {
                        if (config.debug) console.log(error);
                        output.print(error);
                        output.print("Error while sending results to XRAY");
                    }
                });
            });
        });
    });
}