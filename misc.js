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


// [ Core Functions ]
function getUnifiedTime(hrtime) {
    var unifiedTime = hrtime[0] + hrtime[1]/1000000000;
    return unifiedTime;
}


function clone_obj(obj) {
    // clone a basic object (no functions or recursion)
    // also handles 'undefined' and 'null'
    if (obj === undefined || obj === null) {
        return obj;
    }
    return JSON.parse(JSON.stringify(obj));
}



// [ Exports ]
exports.unifyHrTime = getUnifiedTime;
exports.clone = clone_obj;
