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
function connect(conn, start, args, done) {
        // successfull connection
        results.handleSingleSuccess(start);
        // end the connection gracefully so as not to pile up connections on either client or server.
        conn.end();
        // return true (so the caller knows it's ok to send more data)
        return true;
}


function controlledConnect(conn, start, args, done) {
        // successfull connection
        results.handleSingleSuccess(start);
        // let the next worker open a new conn
        done();
        // return true (so the caller knows it's ok to send more data)
        return true;
}


// [ Exports ]
exports.connect = connect;
exports.controlledConnect = controlledConnect;
