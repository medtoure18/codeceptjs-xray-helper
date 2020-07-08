const event = require('codeceptjs').event;
const recorder = require('codeceptjs').recorder;
const output = require('codeceptjs').output;
const moment = require('moment');
const request = require('request');
const jsesc = require('jsesc');
const fs = require('fs');
require('tls').DEFAULT_MIN_VERSION = 'TLSv1';


const defaultConfig = {
    debug:false,
    jira_url: 'https://localhost:8080',
    jira_user: 'root',
    jira_password: 'root',
    test_revison: '001',
    testEnvironments: '["browser:chrome", "linux"]'
};
var info = "";
var tests = "";

module.exports = function (config) {
    var config = Object.assign(defaultConfig, config);
    //we get test results after each test
    event.dispatcher.on(event.test.after, function (test) {
        var status;
        var comment;
        if (test.state == "passed") {
            status = 'PASS';
            comment = "Successful execution";
        } else {// if the test is failed, we get the reason for the failure
            status = 'FAIL';
            //we remove special characteres to make xray api accept our description message
            comment = jsesc(test.err.toString().replace(/\"/g, "").replace(/\'/g, "").replace(/\é/g, "e").replace(/\è/g, "e").replace(/\ê/g, "e").replace(/\à/g, "a").replace(/\ù/g, "u"));
            console.log(comment);
        }

        if (tests.length < 13) {
            /* with "test" and "info", we build a json which lists the test results to be send to xray
             * format: https://confluence.xpand-it.com/display/XRAYCLOUD/Import+Execution+Results+-+REST
             */
            info = '{ "testExecutionKey": "' + test.tags[0].split("@")[1] + '","info" : {"startDate" : "' + moment().format() + '", "finishDate" :"' + moment().format() + '","revision": "' + config.test_revison + '","description" : "Results of test execution ", "testEnvironments": ' + config.testEnvironments + '},';
            tests = '"tests" : [';
            // if this is the first test that is added to the list of tests executed.
            tests = tests + "" + '{"testKey":"' + test.tags[2].split("@")[1] + '","status":"' + status + '","comment" : "' + comment + '" }';
        } else
            tests = tests + "" + ',{"testKey":"' + test.tags[2].split("@")[1] + '","status":"' + status + '","comment" : "' + comment + '" }';

    });

    /* at the end of all the tests we complete the json and send it to xray by api*/
    event.dispatcher.on(event.all.after, function (suite) {
        output.log("SEND TO XRAY=>"+info + tests + "]}");
       if (config.debug) console.log("SEND TO XRAY=>"+info + tests + "]}");
        // we send the file to xray api
        recorder.add('Sending new result to xray', function () {
            return new Promise((doneFn, errFn) => {
                request({
                    url: config.jira_url + "/rest/raven/1.0/import/execution",
                    headers: {
                        "content-type": "application/json",
                        'Authorization': 'Basic ' + Buffer.from(config.jira_user + ':' + config.jira_password).toString('base64')
                    },
                    method: 'POST',
                    body: info + tests + "]}"
                }, function (error, response, body) {
                    if (!error) {
                        if (config.debug) console.log("XRAY RESPONSE=>" + body);
                        output.log("XRAY RESPONSE=>" + body);
                        output.print("Tests results sended to XRAY on TestExecution: "+(JSON.parse(body)).testExecIssue.key);
                        }
                    else {
                        if (config.debug) console.log(error);
                        output.print(error);
                        output.print("Error while sending results to XRAY");
                    }
                });
            });

        });


    });

}