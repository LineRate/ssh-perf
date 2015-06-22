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


// [ GLOBALS ]
// totals
var WORKER_TOTALS = {
    num_attempts: 0,
    num_successes: 0,
    num_errors: 0,
    latency_sum: 0,
    bytes_sum: 0,
    duration: 0,
    errors_by_type: {
        connection: 0,
        connection_by_code: {},
        exec: 0,
        exec_stream: 0,
        exec_stream_by_code: {},
        sftp: 0,
        sftp_by_type: {
            put: 0,
            get: 0
        },
        file: 0
    }
};


// [ Core Functions ]
function handleConnectionError(err) {
    message.error("got connection error: %s", util.inspect(err));
    WORKER_TOTALS.num_errors += 1;
    WORKER_TOTALS.errors_by_type.connection += 1;
    var code_total = WORKER_TOTALS.errors_by_type.connection_by_code[err.code || err.level] + 1 || 1;
    WORKER_TOTALS.errors_by_type.connection_by_code[err.code || err.level] = code_total;
}


function handleSingleSuccess(startTime) {
    // get the latency
    var hr_latency = process.hrtime(startTime);
    var unified_latency = misc.unifyHrTime(hr_latency);
    // update latency sum
    WORKER_TOTALS.latency_sum += unified_latency;
    // update successes
    WORKER_TOTALS.num_successes += 1;
}


function handleExecError(err) {
    message.error("got exec error: %j", err);
    WORKER_TOTALS.num_errors += 1;
    WORKER_TOTALS.errors_by_type.exec += 1;
}


function handleExecStreamError(rc, signal, stdout, stderr, exec, stdin) {
    message.error("got stream error.  rc: %j.  signal: %j.  stdout: %s.  stderr: %s.  exec: %s.  stdin: %s",
          rc, signal, stdout, stderr, exec, stdin);
    WORKER_TOTALS.num_errors += 1;
    WORKER_TOTALS.errors_by_type.exec_stream += 1;
    var err = signal || rc;
    var code_total = WORKER_TOTALS.errors_by_type.exec_stream_by_code[err] + 1 || 1;
    WORKER_TOTALS.errors_by_type.exec_stream_by_code[err] = code_total;
}


function handleFileError(err) {
    message.error("got file error: %j", err);
    WORKER_TOTALS.num_errors += 1;
    WORKER_TOTALS.errors_by_type.file += 1;
}


function handleSftpError(err) {
    message.error("got sftp error: %j", err);
    WORKER_TOTALS.num_errors += 1;
    WORKER_TOTALS.errors_by_type.sftp += 1;
}


function handlePutError(err) {
    message.error("got sftp put error: %j", err);
    WORKER_TOTALS.num_errors += 1;
    WORKER_TOTALS.errors_by_type.sftp += 1;
    WORKER_TOTALS.errors_by_type.sftp_by_type.put += 1;
}


function handleGetError(err) {
    message.error("got sftp get error: %j", err);
    WORKER_TOTALS.num_errors += 1;
    WORKER_TOTALS.errors_by_type.sftp += 1;
    WORKER_TOTALS.errors_by_type.sftp_by_type.get += 1;
}


// [ Exports ]
exports.handleConnectionError = handleConnectionError;
exports.handleSingleSuccess = handleSingleSuccess;
exports.WORKER_TOTALS = WORKER_TOTALS;
exports.handleExecError = handleExecError;
exports.handleExecStreamError = handleExecStreamError;
exports.handleFileError = handleFileError;
exports.handleSftpError = handleSftpError;
exports.handlePutError = handlePutError;
exports.handleGetError = handleGetError;
