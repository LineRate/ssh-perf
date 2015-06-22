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
// [ - Third Party ]
var _ = require('underscore');
// [ - Project ]
var results = require('./results.js');


// [ Core Functions ]
function exec(conn, start, args, done) {
    // exec a command
    return conn.exec('date', function(err, stream) {
        // if an error occurred:
        if (err) {
            results.handleExecError(err);
            conn.end();
        // if we got a good stream:
        } else {
            var stdout = '';
            var stderr = '';
            stream.on('close', function(code, signal) {
                // stream closed with good exit code
                if (code === 0) {
                    // successful exec
                    results.handleSingleSuccess(start);
                // stream closed early with a stream error
                } else {
                    results.handleExecStreamError(code, signal, stdout, stderr);
                }
                conn.end();
            }).on('data', function handleStdOut(chunk) {
                stdout += chunk;
            }).stderr.on('data', function handleStdErr(chunk) {
                stderr += chunk;
            });
        }
    });
}


// [ Exports ]
exports.exec = exec;
