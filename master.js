/*-
 * Copyright (c) 2015, F5 Networks, Inc. All rights reserved.
 *
 * No part of this software may be reproduced or transmitted in any
 * form or by any means, electronic or mechanical, for any purpose,
 * without express written permission of F5 Networks, Inc.
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
var util = require('util');
var cluster = require('cluster');
// [ - Third Party ]
var ssh2 = require('ssh2');
var _ = require('underscore');
// [ - Project ]
var message = require('./message.js');
var misc = require('./misc.js');


// [ GLOBALS ]
// [ - Stats tracking ]
var STATS_INTERVAL;
// totals
var MASTER_TOTALS = {
    // archives of totals for dead workers
    dead_workers: [],
    // by worker ID
    live_workers: {},
};
var MASTER_AGGREGATE_TOTALS = {};
// [ - program control ]
var CTRL_C = false;
// [ - program state ]
var GLOBAL_START;
var MAX_OPEN_CONNECTIONS = 0;
var LAST_STAT_TIME;


// [ Helpers ]
// [ - Reporting ]
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
    var deltaDuration = misc.unifyHrTime(process.hrtime(LAST_STAT_TIME));
    LAST_STAT_TIME = process.hrtime();
    var lastTotals = misc.clone(MASTER_AGGREGATE_TOTALS);
    aggregateStats();
    // the aggregate totals
    var totals = MASTER_AGGREGATE_TOTALS;
    if (_.isEmpty(totals)) { return null; }
    // aggregate deltas
    var deltas = getStatsDeltas(lastTotals, totals);
    // deltas per second
    var dps = getStatsPerSecond(deltas, deltaDuration);
    // all the data
    var fullReport = {
        totals: totals,
        deltas: deltas,
        dps: dps,
        num_workers: _.values(cluster.workers).length,
    };
    // max conns
    var current_max = fullReport.totals.state.num_open;
    if (current_max > MAX_OPEN_CONNECTIONS) {
        MAX_OPEN_CONNECTIONS = current_max;
    }
    // selected data to report
    var shortReport = {
        time: misc.unifyHrTime(process.hrtime(GLOBAL_START)),
        successes_per_sec: fullReport.dps.totals.num_successes,
        errors_per_sec: fullReport.dps.totals.num_errors,
        latency_per_conn: fullReport.deltas.totals.latency_sum/fullReport.deltas.totals.num_successes,
        tp: fullReport.dps.totals.bytes_sum,
        queued_conns: fullReport.totals.state.queueLength,
        in_flight: fullReport.totals.state.num_open,
        max_conns: MAX_OPEN_CONNECTIONS,
    };
    // report it
    message.status("%j", shortReport);
}


function getStatsDeltas(lastTotals, totals) {
    // reduce stats
    function diffObjects(diffed, current) {
        // combine each item in the object
        _.each(current, function updateValue(value, key) {
            // if undefined, just set it
            if (diffed[key] === undefined) {
                diffed[key] = misc.clone(current[key]);
            } else {
                // if is a number, subtract it
                if (_.isNumber(value)) {
                    diffed[key] -= value;
                // else, is obj...combine the objects...
                } else {
                    diffed[key] = _.reduce([diffed[key], value], diffObjects);
                }
            }
        });
        return diffed;
    }
    return _.reduce([totals, lastTotals], diffObjects, {});
}


function getStatsPerSecond(deltas, duration) {
    // normalize stats
    function divObject(result, obj, divisor) {
        // divide each item in the object
        _.each(obj, function updateValue(value, key) {
            // if is a number, subtract it
            if (_.isNumber(value)) {
                result[key] = value / divisor;
            // else, is obj...combine the objects...
            } else {
                result[key] = divObject({}, value, divisor);
            }
        });
        return result;
    }
    return divObject({}, deltas, duration);
}


function aggregateStats() {
    // build a list of all the stats objects
    var allStats = [];
    function pushStats(stats) { allStats.push(stats); }
    _.each(MASTER_TOTALS.dead_workers, pushStats);
    _.each(MASTER_TOTALS.live_workers, pushStats);
    // reduce stats
    function combineObjects(combined, current) {
        // combine each item in the object
        _.each(current, function updateValue(value, key) {
            // if undefined, just set it
            if (combined[key] === undefined) {
                combined[key] = misc.clone(current[key]);
            } else {
                // if is a number, add it
                if (_.isNumber(value)) {
                    combined[key] += value;
                // else, is obj...combine the objects...
                } else {
                    combined[key] = _.reduce([combined[key], value], combineObjects);
                }
            }
        });
        return combined;
    }
    MASTER_AGGREGATE_TOTALS = _.reduce(allStats, combineObjects, {});
}


function startStatsLogging() {
    LAST_STAT_TIME = process.hrtime();
    STATS_INTERVAL = setInterval(logStats, 1000);
}


function updateWorkerStats(workerId, workerReport) {
    //message.status("got worker report: %j", workerReport);
    MASTER_TOTALS.live_workers[workerId] = workerReport;
}


// [ Core Functions ]
function testCredentials(args, done) {
    // Tests the SSH credentials so that the whole test isn't just FAAAAAAILLLL
    var user = args.user;
    var host = args.host;
    var password = args.password;
    // make a new connection
    var conn = new ssh2.Client();
    // SSH Connect
    conn
        .on('ready', function handleReady() {
            // Success
            message.status("Test connection (ssh %s@%s with password %s) succeeded.", user, host, password);
            conn.end();
        })
        .on('error', function handleError(err) {
            // Failure
            message.error("Error on test connection (ssh %s@%s with password %s).", user, host, password);
            done(err);
        })
        .on('close', function handleEnd(hadError) {
            // Connection test is over
            // Error messaging happened in the error callback
            message.status("Test connection (ssh %s@%s with password %s) closed.", user, host, password);
            // call done only if there was no error (in error conditions, error was already called)
            if (! hadError) {
                done()
            }
        })
        .connect({
            host: host,
            username: user,
            password: password,
        });
}


function archiveWorkerStats(workerId) {
    // migrate stats for a recently deceased worker
    MASTER_TOTALS.dead_workers.push(MASTER_TOTALS.live_workers[workerId]);
    delete MASTER_TOTALS.live_workers[workerId];
}


function registerForMessagesFromWorker(worker) {
    // on message, run function
    var actionMap = {
        'stats report': updateWorkerStats,
    };
    // register for the messages from this worker
    worker.on('message', function handleMessage(message) {
        var action = actionMap[message.message];
        if (action === undefined) {
            throw new Error("Unrecognized message from worker: %s", message);
        }
        action(worker.id, message.data);
    });
}


function logWorkerExit(worker, code, signal) {
    if (code === undefined || code === null) {
        message.error("worker %d died with signal (%d)", worker.id, signal);
    } else {
        if (code !==0) {
            message.error("worker %d died with non-zero RC (%d)", worker.id, code);
        } else {
            message.status("worker %d exited with good RC (%d)", worker.id, code);
        }
    }
}


function forkWorkers(num) {
    // Initial creation of workers
    message.status("launching %d workers...", num);
    for (var i=0; i < num; i++) {
        if (i === 0) {
            message.partialStatus("Starting worker.");
        } else {
            message.partialStatus(".");
        }
        cluster.fork();
    }
    message.partialStatus("\n");
    // start stats
    startStatsLogging();
}


function logFinalStats() {
    // disable the interval
    clearInterval(STATS_INTERVAL);
    // get all final stats
    var finalDuration = misc.unifyHrTime(process.hrtime(GLOBAL_START));
    aggregateStats();
    var totals = MASTER_AGGREGATE_TOTALS;
    var dps = getStatsPerSecond(totals, finalDuration);
    // print them
    var shortReport = {
        duration: finalDuration,
        successes_per_sec: dps.totals.num_successes,
        errors_per_sec: dps.totals.num_errors,
        latency_per_conn: totals.totals.latency_sum/totals.totals.num_successes,
        tp: dps.totals.bytes_sum,
        tpMB: dps.totals.bytes_sum/1000/1000,
        queued_conns: totals.state.queueLength,
        in_flight: totals.state.queueRunning,
        totals: totals,
        max_conns: MAX_OPEN_CONNECTIONS,
    };
    message.status(util.inspect(shortReport, {depth:10}));
}


// [ Main ]
function main(args) {
    // Master setup
    cluster.setupMaster();
    var outstandingWorkers = {};
    // Cluster teardown monitoring
    var _monitorWorkers = _.debounce(function monitorWorkers() {
        if (_.values(outstandingWorkers).length !== 0) {
            message.status("Waiting for remaining workers: ", outstandingWorkers);
        }
    }, 1000);
    // Listen to client events
    cluster
        .on('fork', function handleFork(worker) {
            outstandingWorkers[worker.id] = 'forked';
            message.status("worker %d forked", worker.id);
            registerForMessagesFromWorker(worker);
        })
        .on('online', function handleOnline(worker) {
            outstandingWorkers[worker.id] = 'online';
            message.status("worker %d is online", worker.id);
        })
        .on('disconnect', function handleDisconnect(worker) {
            if (CTRL_C && _.values(cluster.workers).length === 0 ) {
                outstandingWorkers[worker.id] = 'disconnected';
                message.status("worker %d disconnected", worker.id);
            }
        })
        .on('exit', function handleWorkerDied(worker, code, signal) {
            delete outstandingWorkers[worker.id];
            archiveWorkerStats(worker.id);
            logWorkerExit(worker, code, signal);
            if (! CTRL_C) {
                message.status("Restarting worker...");
                cluster.fork();
            } else if (_.values(outstandingWorkers).length === 0 ) {
                message.status("All workers have ended.  Aggregating final statistics...");
                logFinalStats();
                process.exit(0);
            } else {
                _monitorWorkers();
            }
        });
    // test login to the server, and fork if we can (don't if we can't)
    testCredentials(args, function credentialTestComplete(err) {
        if (err) {
            console.error("[!] ERROR: %j", err);
            process.exit(1);
        } else {
            // log the start time for calculating total duration later
            GLOBAL_START = process.hrtime();
            // actually start the workers
            forkWorkers(args.processes);
        }
    });
    // If max conns test, watch for same # for 30s
    if (args.mode === 'max-connections') {
        var timesTheSame = 0;
        var lastMax = 0;
        var watcher = setInterval(function watchMaxConns() {
            if (lastMax === MAX_OPEN_CONNECTIONS) {
                timesTheSame += 1;
            } else {
                lastMax = MAX_OPEN_CONNECTIONS;
                timesTheSame = 0;
            }
            if (timesTheSame === args.max_conn_timeout) {
                message.status("Max conn reached.  Stopping.");
                CTRL_C = true;
                _.each(cluster.workers, function killWorker(worker) {
                    worker.kill('SIGINT');
                });
                clearInterval(watcher);
            }
        }, 1000);
    }
}


// [ Exports ]
exports.main = main;
exports.logFinalStats = logFinalStats;
exports.CTRL_C = function setCTRL_C() { CTRL_C = true; };
