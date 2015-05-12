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
var util = require('util');
var fs = require('fs');
// [ - Third Party ]
var _ = require('underscore');
// [ - Project ]
var message = require('./message.js');
var results = require('./results.js');


// [ - SCP ]
function statModeToFilePerms(mode) {
    var perms = '0' + (mode & parseInt('777', 8)).toString(8);
    //message.status("perms: ", perms);
    return perms;
}


function createFileMessage(stats, filename) {
    return util.format("C%s %d %s\n", statModeToFilePerms(stats.mode), stats.size, filename);
}


function _scpPut(conn, start, args, done) {
    // exec an scp command
    var execCommand = 'scp -t -- /dev/null';
    var stdout = '';
    var stderr = '';
    var stdin = '';
    var midWarning = false;
    var excess = '';
    // hoisted
    var lastIndex = 0;
    var scpMessage = '';
    return conn.exec(execCommand, function handleExecStream(err, stream) {
        // if an error occurred:
        if (err) {
            results.handleExecError(err);
            conn.end();
        // if we got a good stream:
        } else {
            var fileStream = fs.createReadStream(args.put, {
                encoding: 'ascii'
            });
            stream.on('close', function handleClose(code, signal) {
                // stream closed with good exit code
                //if (code === 0 || (code === 1 && stdout === '' && stderr === '')) {
                if (code === 0) {
                    // successful exec
                    results.handleSingleSuccess(start);
                // stream closed early with a stream error
                } else {
                    results.handleExecStreamError(code, signal, stdout, stderr, execCommand, stdin);
                }
                conn.end();
            })
            .on('data', function handleStdOut(chunk) {
                var buf = new Buffer(chunk);
                //message.status(util.inspect(buf));
                if (midWarning) {
                    excess += buf.toString();
                    lastIndex = excess.indexOf('\n');
                    if (lastIndex < 0) {
                        midWarning=true;
                        message.status('midWarning');
                        buf = new Buffer();
                    } else {
                        scpMessage = excess.slice(0, lastIndex+1);
                        message.warning(scpMessage);
                        buf = new Buffer(excess.slice(lastIndex+1));
                    }
                }
                while (buf.length > 0) {
                    var indicator = buf[0];
                    excess = buf.slice(1).toString();
                    if (indicator === 0) {
                        buf = buf.slice(1);
                        //message.status('scp-ok');
                        stream.emit('scp-ok');
                    } else {
                        message.warning("bad response: %d", indicator);
                        lastIndex = excess.indexOf('\n');
                        if (lastIndex < 0) {
                            midWarning=true;
                            message.status('midWarning');
                            buf = new Buffer();
                        } else {
                            scpMessage = excess.slice(0, lastIndex+1);
                            message.warning(scpMessage);
                            buf = new Buffer(excess.slice(lastIndex+1));
                        }
                    }
                }
                stdout += chunk;
            }).on('error', function onError(error) {
                results.handleExecError(err);
            }).stderr.on('data', function handleStdErr(chunk) {
                stderr += chunk;
                message.warning(stderr);
            }).on('error', function onError(error) {
                results.handleExecError(err);
            });
            // need to wait for ok signal to send the file message
            stream.once('scp-ok', function sendFileMessage() {
                // get the permissions of the file
                fs.stat(args.put, function handleStats(err, stats) {
                    if (err) {
                        results.handleFileError(err);
                        conn.end();
                    } else {
                        // build the file and time messages
                        var fileMessage = createFileMessage(stats, args.put);
                        // send them
                        stream.write(fileMessage);
                        stdin += fileMessage;
                        //message.status('sent ', fileMessage);
                        //stream.write(timeMessage, 'utf8');
                        // send the file
                        // now we can send the file
                        var sendFileData = function sendFileData() {
                            fileStream.on('data', function sendChunk(chunk) {
                                stream.write(chunk);
                                stdin += chunk;
                                //message.status('sent ', chunk);
                                results.WORKER_TOTALS.bytes_sum += chunk.length;
                            });
                        };
                        stream.once('scp-ok', sendFileData);
                        // stop sending file data when there isn't any more
                        // also stop the stream.
                        fileStream.on('end', function stopFileData() {
                            // send final confirmation - EOF.
                            stream.write(new Buffer([0]));
                            stream.once('scp-ok', function sendEnd() {
                                stream.end();
                            });
                        });
                    }
                });
            });
            // read and send file as text.
        }
    });
}


function _scpGet(conn, start, args, done) {
    // exec an scp command
    var execCommand = 'scp -f -- ' + args.get;
    var stdout = '';
    var stderr = '';
    var stdin = '';
    var fileMessage = '';
    // hoisted
    var lastIndex = 0;
    var fileMessageReceived = false;
    return conn.exec(execCommand, function handleExecStream(err, stream) {
        // if an error occurred:
        if (err) {
            results.handleExecError(err);
            conn.end();
        // if we got a good stream:
        } else {
            stream.on('close', function handleClose(code, signal) {
                // stream closed with good exit code
                //if (code === 0 || (code === 1 && stderr === '')) {
                if (code === 0) {
                    // successful exec
                    results.handleSingleSuccess(start);
                // stream closed early with a stream error
                } else {
                    results.handleExecStreamError(code, signal, stdout, stderr, execCommand, stdin);
                }
                conn.end();
            })
            .on('data', function handleStdOut(chunk) {
                if (! fileMessageReceived) {
                    // find the end of the message
                    var newlineIndex = chunk.toString().indexOf('\n');
                    if (newlineIndex < 0) {
                        // no end yet...
                        fileMessage += chunk;
                    } else {
                        // found the end
                        fileMessage += chunk.slice(0, lastIndex+1);
                        // record actual data which came after
                        chunk = chunk.slice(lastIndex+1);
                        results.WORKER_TOTALS.bytes_sum += chunk.length;
                        // set the received flag
                        fileMessageReceived = true;
                        // send the ok
                        stream.write(new Buffer([0]));
                    }
                } else {
                    // this is actual message data.  Record the bytes and dump the chunk.
                    results.WORKER_TOTALS.bytes_sum += chunk.length;
                    // ack the EOF
                    if (chunk[chunk.length - 1] === 0) {
                        stream.write(new Buffer([0]));
                    }
                }
            }).on('error', function onError(error) {
                results.handleExecError(err);
            }).stderr.on('data', function handleStdErr(chunk) {
                stderr += chunk;
                message.warning(stderr);
            }).on('error', function onError(error) {
                results.handleExecError(err);
            });
            // send an initial "ok" to kick things off
            stream.write(new Buffer([0]));
        }
    });
}


function scp(conn, start, args, done) {
    // exec an scp command
    if (args.put.length > 0) {
        return _scpPut(conn, start, args, done);
    } else if (args.get.length > 0) {
        return _scpGet(conn, start, args, done);
    } else {
        throw new Error("no file to put or get.  nothing to do...");
    }
}


// [ Exports ]
exports.scp = scp;
