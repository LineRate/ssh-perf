#! /usr/bin/env node
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
var util = require('util');
var cluster = require('cluster');
var fs = require('fs');
// [ - Third Party ]
var ssh2 = require('ssh2');
var _ = require('underscore');
var nomnom = require('nomnom');
// [ - Project ]
var message = require('./message.js');
var misc = require('./misc.js');
var master = require('./master.js');
var worker = require('./worker.js');


// [ GLOBALS ]
// [ - Testing mode ]
var TEST_MODE_MAP = {};
// [ - program control ]
var CTRL_C = false;
var STOP_NOW = false;
// [ - program state ]
var WAITING_CONNECTIONS = [];


// [ - Reporting ]
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


// [ - Process Control ]
function passiveStop() {
    CTRL_C = true;
    master.CTRL_C();
    worker.CTRL_C();
    message.status("Passive Stop: will exit when existing connections complete...");
}


function activeStop() {
    STOP_NOW = true;
    if (cluster.isMaster) {
        message.status("Active stop: Killing workers...");
        _.each(_.values(cluster.workers), function sendToWorker(worker) {
            worker.kill();
        });
        message.status("Active stop: aggregated and reporting current stats.  Will exit after report...");
        master.logFinalStats();
    }
    process.exit(1);
}


// [ Core Functions ]
function registerForCtrlC() {
    // if maaster, send signal to children?  Is that necessary?
    // else:
    process.on('SIGINT', function() {
        // One CTRL-C: Passive stop.  Set the flag and expect the rest of the program to pay attention and halt gracefully.
        if (! CTRL_C) {
            message.warning("Caught first interrupt signal.  Passive stop initiated.");
            passiveStop();
        // Two CTRL-C's: active stop.  Set the flag, report, and exit here with a good RC.
        } else if (! STOP_NOW) {
            message.warning("Caught second interrupt signal.  Active stop initiated.");
            activeStop();
        // Three CTRL-C's: hard stop.  Just exit with the interrupt RC, and screw any workers or async currently running.
        } else {
            message.warning("Caught third interrupt signal.  Hard stop.  Exiting.");
            process.exit(127);
        }
    });
}


function getCliArgs() {
    // choices for test mode
    var testModes = _.keys(TEST_MODE_MAP);
    var defaultPort = 22;
    var options = {
        'user': {
            help: "The user to log in as",
            required: true,
            position: 0
        },
        'host': {
            help: "The host to log in to",
            required: true,
            position: 1
        },
        'password': {
            help: "The password to log in with",
            default: '',
        },
        'key': {
            help: "The private key to log in with",
            metavar: 'PATH',
            default: '',
        },
        'agent': {
            help: "The ssh-agent's socket path, if using an agent",
            metavar: 'PATH'
        },
        'port': {
            help: "The port to connect to (" + defaultPort + ")",
            default: defaultPort,
            metavar: 'INT'
        },
        'mode': {
            abbr: 'm',
            help: "The mode of testing (" + testModes + ")",
            choices: testModes,
            default: testModes[0],
            metavar: 'STRING'
        },
        'concurrency': {
            abbr: 'c',
            help: "Concurrent flows per process",
            default: 1,
            metavar: 'INT'
        },
        'processes': {
            abbr: 'p',
            help: "How many processes to run in",
            default: 1,
            metavar: 'INT'
        },
        'delay': {
            abbr: 'd',
            help: "The delay (in milliseconds) between establishing connections",
            default: 0,
            metavar: 'INT'
        },
        'max_conn_timeout': {
            abbr: 't',
            help: "The time (in seconds) to wait before assuming max connections reached if no new conns have been established.",
            default: 30,
            metavar: 'INT'
        },
        'put': {
            abbr: 'P',
            help: "(SCP and SFTP only) Put a local file onto the remote server",
            default: '',
            metavar: 'FILE'
        },
        'get': {
            abbr: 'G',
            help: "(SCP and SFTP only) Get a remote file onto the local client",
            default: '',
            metavar: 'FILE'
        }
    };
    // Get the CLI arguments
    var args = nomnom
        .help("Performance testing tool for SSH, SCP, and SFTP." +
              "\n\nTool will run until stopped with Ctrl-C.\n")
        .options(options)
        .parse();
    // Ensure only the designated options were passed in.
    delete args._;  // don't need this - all positionals should already be mapped.
    var extras = _.difference(_.keys(args), _.keys(options));
    if (extras.length) {
        message.fatalError("Unrecognized arguments: %j", extras);
    }
    // Validate arg combos
    if (args.password === '' && args.key === '') {
         message.fatalError("You must specify either a password or a key");
    }
    if (args.mode != "sftp" && args.mode != "scp" && args.put !== '') {
        message.fatalError("'--put' may only be used in conjunction with '--mode sftp' or '--mode scp'");
    }
    if (args.mode != "sftp" && args.mode != "scp" && args.get !== '') {
        message.fatalError("'--get' may only be used in conjunction with '--mode sftp' or '--mode scp'");
    }
    if (args.mode == "sftp" && args.put === '' && args.get === '') {
        message.fatalError("'--mode sftp' requres either a '--put' or a '--get' option");
    }
    if (args.mode == "scp" && args.put === '' && args.get === '') {
        message.fatalError("'--mode scp' requres either a '--put' or a '--get' option");
    }
    if (args.mode == "sftp" && args.put !== '' && args.get !== '') {
        message.fatalError("Cannot specify both a '--put' and a --'get' option with '--mode sftp'");
    }
    if (args.mode == "scp" && args.put !== '' && args.get !== '') {
        message.fatalError("Cannot specify both a '--put' and a --'get' option with '--mode scp'");
    }
    if (args.mode !== "max-connections" && args.max_conn_timeout != 30) {
        message.fatalError("Cannot specify max_conn_timeout without specifying '--mode max-connections'");
    }
    // Log the arguments
    if (cluster.isMaster) {
        console.log("Arguments:");
        console.log(args);
    } else {
        message.status("args: %j", args);
    }
    // Translate the key arg (read the file)
    if (args.key !== '') {
        args.key = fs.readFileSync(args.key);
    }
    return args;
}


function addMode(mode, modeFunction) {
    // add a testing mode.
    // the modeFunction must take CLI arguments and a 'done' callback,
    //   which is called like done(error, results)
    if (TEST_MODE_MAP[mode] === undefined) {
        TEST_MODE_MAP[mode] = modeFunction;
    } else {
        throw new Error("Mode %s already defined", mode);
    }
}


function getTestFunction(mode) {
    // get the function to carry out the testing.
    if (TEST_MODE_MAP[mode] === undefined) {
        throw new Error("Test mode '%s' was not added as a valid mode: cannot use it now.", mode);
    } else {
        return TEST_MODE_MAP[mode];
    }
}


// [ Main ]
registerForCtrlC();
addMode('connections', worker.doSingleConnect);
addMode('execs', worker.doSingleExec);
addMode('sftp', worker.doSingleSFTP);
addMode('scp', worker.doSingleSCP);
addMode('max-connections', worker.doControlledConnect);
var args = getCliArgs();
// MULTIHOST - install redis server
//  - ssh to other hosts
//  - run little sub-masters
//  - verify connectivity to redis
//  - manage.  All masters send aggregate data via redis
//  - on teardown, remove instances from other hosts
// clustering - fork args.processes instances
if (cluster.isMaster) {
    master.main(args);
} else {
    worker.main(args, getTestFunction(args.mode));
}
