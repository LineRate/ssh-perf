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
