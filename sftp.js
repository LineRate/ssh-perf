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
