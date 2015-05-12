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
