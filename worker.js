/*-
 * ssh-perf: An SSH2 performance testing tool
 * Copyright (C) 2015  F5 Networks
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */


// [ Description ]
// ssh-perf
//
// A performance testing tool for SSH, SCP, and SFTP
//


// [ Pragmas ]
'use strict';


// [ Requires ]
// [ - Node ]
var cluster = require('cluster');
var util = require('util');
// [ - Third Party ]
var ssh2 = require('ssh2');
var async = require('async');
var _ = require('underscore');
// [ - Project ]
var message = require('./message.js');
var misc = require('./misc.js');
var results = require('./results.js');
var connections = require('./connections.js');
var exec = require('./exec.js');
var sftp = require('./sftp.js');
var scp = require('./scp.js');


// [ GLOBALS ]
// [ - Stats tracking ]
var STATS_INTERVAL;
// [ - program control ]
var CTRL_C = false;
// [ - program state ]
var GLOBAL_START;
var ACTION_QUEUE;
var NUM_OPEN_CONNECTIONS = { value: 0 };
var LAST_STAT_TIME;
var WAITING_CONNECTIONS = [];


// [ Helpers ]
// [ - Reporting ]
// Final stats:
//Duration: 3.689
//Total Attempted Connections: 13313 (3608.84 conns/s)
//Total Completed Connections: 0 (0 conns/s)
//      Erroneous Connections: 13312
//                      Reset: 0  <-- no equivalent?
//                   Timeouts: 0
//     SSL Negotiation Failed: 0  <-- no equivalent?
//                      Other: 13312
// Total Transmitted Requests: 0 (0 req/s)
//             Request errors: 0
//           Dropped requests: 0
//   Total Received Responses: 0 (0 req/s)  <-- no equivalent?
//            Average Latency: nans (nanms)
//            Response errors: 0  <-- no equivalent?
//           Early EOF errors: 0
//   Data After Last Response: 0  <-- no equivalent?
//            Header timeouts: 0  <-- no equivalent?
//              Body timeouts: 0  <-- no equivalent?
//Responses "in flight":  0  <-- no equivalent?
//Bytes Rx: 0 (0 B/s)
//Bytes Tx: 0 (0 B/s)
//Random Terminations: 0
//HTTP status 100:0  <-- no equivalent?
//     status 1xx:0  <-- no equivalent?
//     status 200:0  <-- no equivalent?
//     status 2xx:0  <-- no equivalent?
//     status 3xx:0  <-- no equivalent?
//     status 400:0  <-- no equivalent?
//     status 404:0  <-- no equivalent?
//     status 4xx:0  <-- no equivalent?
//     status 500:0  <-- no equivalent?
//     status 502:0  <-- no equivalent?
//     status 503:0  <-- no equivalent?
//     status 5xx:0  <-- no equivalent?
//     status BAD:0  <-- no equivalent?


function logStats() {
    // incremental stats:
    // t(s)
    // c
    // ^c
    // c/s
    // ^c/s
    // ^lat
    // ^MB/s
    // ^rq/s
    // ^rs/s  <-- no equivalent?
    // err
    // ^err
    // if worker, send to master
    results.WORKER_TOTALS.duration = misc.unifyHrTime(process.hrtime(GLOBAL_START));
    var workerReport = {
        message: 'stats report',
        data: {
            totals: results.WORKER_TOTALS,
            state: {
                queueLength: ACTION_QUEUE.length(),
                queueRunning: ACTION_QUEUE.running(),
                num_open: NUM_OPEN_CONNECTIONS.value,
            }
        }
    };
    cluster.worker.send(workerReport);
    //message.status("sent %j", workerReport);
}


// [ - Task Function ]
function doSingleThing(args, thing, done) {
    // if we're waiting or CTRL_C was hit, just be done
    if (CTRL_C) {
        var connsWaiting = false;
        if (WAITING_CONNECTIONS.length > 0) {
            connsWaiting = true;
        }
        if (connsWaiting) {
            message.status("Found %d connections ready to be closed...", WAITING_CONNECTIONS.length);
        }
        while (WAITING_CONNECTIONS.length > 0) {
            var waitingConn = WAITING_CONNECTIONS.splice(0, 1)[0];
            waitingConn.end();
        }
        if (connsWaiting) {
            message.status("...all ready connections have been told to close.");
        }
        done();
        return;
    }
    // make a new connection
    var conn = new ssh2.Client();
    var open = false;
    var connectionDone = false;
    // record the start time
    var start = process.hrtime();
    // get a done one-shot (call paths are event-based...
    //   no intrinsic guarantee that 'done' will only be called once. )
    var _actionDone = _.once(function actionDone(err) {
        if (! connectionDone) {
            WAITING_CONNECTIONS.push(conn);
        }
        done(err);
    });
    // get a conn closed one-shot because the docs don't guarantee end/close will get called
    var _connDone = _.once(function connDone() {
        connectionDone = true;
        if (open) {
            NUM_OPEN_CONNECTIONS.value -= 1;
        }
        open = false;
        var connIndex = WAITING_CONNECTIONS.indexOf(conn);
        if (connIndex >= 0) {
            WAITING_CONNECTIONS.splice(connIndex, 1);
        }
    });
    // when connection is established:
    conn.on('ready', function testConnReady() {
        // do thing
        thing(conn, start, args, _actionDone);
    // handle client error
    }).on('error', function handleError(err) {
        results.handleConnectionError(err, _.noop);
    // closed
    }).on('close', function handleClose() {
        _connDone();
        _actionDone();
    // end
    }).on('end', function handleEnd() {
        _connDone();
        _actionDone();
    });
    // connect
    if (args.password !== '') {
        conn.connect({
            host: args.host,
            username: args.user,
            password: args.password,
            port: args.port,
            keepaliveInterval: 30*1000,
            keepaliveCountMax: 1000,
            readyTimeout: 30*1000*1000,
        });
    } else if (args.key !== '') {
        conn.connect({
            host: args.host,
            username: args.user,
            privateKey: args.key,
            port: args.port,
            keepaliveInterval: 30*1000,
            keepaliveCountMax: 1000,
            readyTimeout: 30*1000*1000,
            debug: function(str) { if (args.debug) {console.error(str); }}
        });
    } else {
        throw new Error("No password and no private key - one of them must be supplied to log in.");
    }
    // record the opened connection
    NUM_OPEN_CONNECTIONS.value += 1;
    open = true;
    // mark how many connections were attempted
    results.WORKER_TOTALS.num_attempts += 1;
}


// [ - Modal Functions ]
function doSingleConnect(args, done) {
    doSingleThing(args, connections.connect, done);
}


function doControlledConnect(args, done) {
    doSingleThing(args, connections.controlledConnect, done);
}


function doSingleExec(args, done) {
    doSingleThing(args, exec.exec, done);
}


function doSingleSFTP(args, done) {
    doSingleThing(args, sftp.sftp, done);
}


function doSingleSCP(args, done) {
    doSingleThing(args, scp.scp, done);
}


// [ Core Functions ]
function startStatsLogging() {
    LAST_STAT_TIME = process.hrtime();
    STATS_INTERVAL = setInterval(logStats, 1000);
}


function runAsync(doSingle, args, done) {
    // Test async performance
    //
    // log the start time for calculating total duration later
    GLOBAL_START = process.hrtime();
    // set up the action queue
    ACTION_QUEUE = async.queue(doSingle, args.concurrency);
    // set up the loading queue.  The loading queue rate-limits
    //   the addition of items to the action queue.  It guarantees
    //   that the actions have at least args.delay delay between
    //   initiation.
    function loadQueue(task, done) {
        // after the delay, add the task to the action queue
        setTimeout(function() {
            ACTION_QUEUE.push(task);
            done();
        }, args.delay);
    }
    var loadingQueue = async.queue(loadQueue, 1);
    // set up the functions to be called when the queues are ready/done
    function handleQueueCompletion() {
        // if the action queue is done, and the loading queue is done,
        //   then there are no more actions in progress, and no more actions
        //   waiting to be started.
        if (ACTION_QUEUE.idle() && loadingQueue.idle()) {
            clearInterval(STATS_INTERVAL);
            var duration = process.hrtime(GLOBAL_START);
            var waitingInterval = setInterval(function testIfWaiting() {
                if (NUM_OPEN_CONNECTIONS.value > 0) {
                    message.status("Waiting for %d connections to close", NUM_OPEN_CONNECTIONS.value);
                } else {
                    message.status("All connections have ended.");
                    clearInterval(waitingInterval);
                    done();
                }
            }, 1000);
        }
    }
    function handleQueueEmpty() {
        // if the action queue is empty, and the loading queue is empty,
        //   then we need to queue up a new task for loading.
        //   (unless CTRL-C was pressed...then we're not supposed to queue anything new)
        if (! CTRL_C && ACTION_QUEUE.length() === 0 && loadingQueue.length() === 0) {
            loadingQueue.push(args);
        }
    }
    // set the callbacks
    loadingQueue.empty = handleQueueEmpty;
    loadingQueue.drain = handleQueueCompletion;
    ACTION_QUEUE.empty = handleQueueEmpty;
    ACTION_QUEUE.drain = handleQueueCompletion;
    // queue the first task
    loadingQueue.push(args);
}


// [ Main ]
function main(args, testFunction) {
    // start logging
    startStatsLogging();
    // run
    runAsync(testFunction, args, function handleTestEnd() {
        clearInterval(STATS_INTERVAL);
        logStats();
        process.exit(0);
    });
}


// [ Exports ]
exports.main = main;
exports.CTRL_C = function setCTRL_C() { CTRL_C = true; };
exports.doSingleConnect = doSingleConnect;
exports.doControlledConnect = doControlledConnect;
exports.doSingleExec = doSingleExec;
exports.doSingleSFTP = doSingleSFTP;
exports.doSingleSCP = doSingleSCP;
