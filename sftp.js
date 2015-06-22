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
var message = require('./message.js');
var results = require('./results.js');


// [ Core Functions ]
function sftp(conn, start, args, done) {
    return conn.sftp(function(err, sftp) {
        // if an error occurred:
        if (err) {
            results.handleSftpError(err);
            conn.end();
        // if we got a good sftp connection
        } else {
            if (args.put.length > 0) {
                sftp.fastPut(args.put, '/dev/null', {
                    step: function(totalTx, chunk, total) {
                        //message.status("%d - %d - %d", totalTx, chunk, total);
                        results.WORKER_TOTALS.bytes_sum += chunk;
                    }
                }, function onError(err) {
                    if (err) {
                        results.handlePutError(err);
                    } else {
                        results.handleSingleSuccess(start);
                    }
                    conn.end();
                });
            } else if (args.get.length > 0) {
                sftp.fastGet(args.get, '/dev/null', {
                    step: function(totalTx, chunk, total) {
                        //message.status("%d - %d - %d", totalTx, chunk, total);
                        results.WORKER_TOTALS.bytes_sum += chunk;
                    }
                }, function onError(err) {
                    if (err) {
                        results.handleGetError(err);
                    } else {
                        results.handleSingleSuccess(start);
                    }
                    conn.end();
                });
            } else {
                throw new Error("no file to put or get.  nothing to do...");
            }
        }
    });
}


// [ Exports ]
exports.sftp = sftp;
