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


// [ Core Functions ]
// [ - Messaging ]
function fatalError() {
    error.apply(this, arguments);
    process.exit(1);
}


function error(message) {
    if (cluster.isMaster) {
        arguments[0] = "[!] ERROR: " + arguments[0];
    } else {
        arguments[0] = "[!] ERROR: worker " + cluster.worker.id + ": " + arguments[0];
    }
    console.error.apply(console, arguments);
}


function warning(message) {
    if (cluster.isMaster) {
        arguments[0] = "[!] WARNING: " + arguments[0];
    } else {
        arguments[0] = "[!] WARNING: worker " + cluster.worker.id + ": " + arguments[0];
    }
    console.error.apply(console, arguments);
}


function status(message) {
    if (cluster.isMaster) {
        arguments[0] = "[*] " + arguments[0];
    } else {
        arguments[0] = "[*] worker " + cluster.worker.id + ": " + arguments[0];
    }
    console.error.apply(console, arguments);
}

function partialStatus(message) {
    process.stderr.write.apply(process.stderr, arguments);
}


// [ Exports ]
exports.fatalError = fatalError;
exports.error = error;
exports.warning = warning;
exports.status = status;
exports.partialStatus = partialStatus;
