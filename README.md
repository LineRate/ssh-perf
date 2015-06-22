<!---
 ssh-perf: An SSH2 performance testing tool
 Copyright (C) 2015  F5 Networks
 
 This program is free software; you can redistribute it and/or
 modify it under the terms of the GNU General Public License
 as published by the Free Software Foundation; either version 2
 of the License, or (at your option) any later version.
 
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.
 
 You should have received a copy of the GNU General Public License
 along with this program; if not, write to the Free Software
 Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

-->

# SSH-Perf

A tool for testing SSH, SCP, and SFTP performance.

# Features

* benchmarking of:
    * raw connections per second
    * exec commands per second
    * SCP/SFTP Upload/Download speeds
    * maximum open connections
* single-process concurrency
* multi-process concurrency
* staggered/delayed request init

# Flow

The tool is started from the CLI in one of the following modes:
* connections per second
* execs per second
* sftp performance
* scp performance

For SCP and SFTP, either a local path for upload or a remote path for download must be specified (without hostname).

The tool attempts a test connection to the specified host.  If that fails, the tool exits.

The tool then spins up as many workers and processes as instructed, and attempts to run in the specified mode
as fast as possible.  It aggregates the results of all requests and prints running summaries in JSON format
once every second:

```
[*] {"time":123.620521976,"successes_per_sec":0,"errors_per_sec":0, ... }
```

Once you are satisfied with a run, you must manually stop the tool\*.  This is in contrast to many other
performance tools, which send a specified amount of traffic, or run for a particular amount of time.  There are
three "stop levels" which are triggered by successive `ctrl-c` presses (or `SIGINT` events):
1. Soft stop:  After one `ctrl-c`, the program will stop queuing events, will wait for all outstanding connections to complete, and will print a final report.
1. Active stop:  After two `ctrl-c`'s, the program will actively close all outstanding connections and print a final report.
1. Hard stop:  After three `ctrl-c`'s, the program will simply exit.  Outstanding connections are dropped, workers are killed, and no report is printed.

The soft stop is entirely graceful, and thus the preferred stop level, though it may distort results of a test if a few long-lived connections drag out.

The active stop is useful in the case of long-lived connections (say, testing SCP perf with petabyte transfers).

The hard stop is only useful if you just need to kill the thing and kill it NOW.  It prints no report, because that would mean analyzing and formatting data,
and presumably the point of a hard stop is to make the program just stop doing things and quit.  It's meant as a just-slightly more user-friendly option than
opening another window and issuing a `kill -9`.

When stopped either via the soft or active stops, the program will analyze the data it has collected and present a final report, again in JSON format, but this time
spaced out over multiple lines:

```
[!] WARNING: Caught second interrupt signal.  Active stop initiated.
[*] Active stop: Killing workers...
[*] Active stop: aggregated and reporting current stats.  Will exit after report...
[*] {
    "duration": 124.452788963,
    "successes_per_sec": 0,
    "errors_per_sec": 1060.1128435878136,
    ...
}
```

\* The "max-connections" test uses the "-t" option to define an automatic timeout.  This test works differently than the others.  You may stop it as normal,
but the point of this test is to determine the maximum open connections somewhat 'intelligently'.  This mode opens connections and leaves them open.  Once a
worker has successfully opened a connection, it moves on and opens another.  The test ends when the maximum number of open connections during a test run has
not changed for the duration specified via "-t".  This can occur either due to errors ending connections, or to new-connection latency exceeding the value set
in "-t".

# CLI Use

```
$ ssh-perf --help
```

```

Usage: node ssh-perf <user> <host> [options]

user     The user to log in as
host     The host to log in to

Options:
   --port INT                       The port to connect to (22)  [22]
   --password                       The password to log in with  []
   --key PATH                       The private key to log in with  []
   --agent PATH                     The ssh-agent's socket path, if using an agent
   -m STRING, --mode STRING         The mode of testing (connections,execs,sftp,scp,max-connections)  [connections]
   -c INT, --concurrency INT        Concurrent flows per process  [1]
   -p INT, --processes INT          How many processes to run in  [1]
   -d INT, --delay INT              The delay (in milliseconds) between establishing connections  [0]
   -t INT, --max_conn_timeout INT   The time (in seconds) to wait before assuming max connections reached if no new conns have been established.  [30]
   -P FILE, --put FILE              (SCP and SFTP only) Put a local file onto the remote server  []
   -G FILE, --get FILE              (SCP and SFTP only) Get a remote file onto the local client  []
   --debug                          Print SSH Debug information  [false]

Performance testing tool for SSH, SCP, and SFTP.

Tool will run until stopped with Ctrl-C.

```

# Installation
ssh-perf is written in javascript, and depends on the Node.js ecosystem.  To install:
1. Install [Node.js](https://nodejs.org/download/)
1. `npm install -g ssh-perf`

# Contributing
Contributions are welcome!  We built this tool because we couldn't find anything like it for SSH, but it's far
from complete.  We'd love your help making improvements, adding features, fixing bugs, etc!

## Commit Message Template
If you do decide to help contribute, please follow the template below:

```
Summary: <a short one-liner, including any gh issues fixed>

**Problem:**
<The problem this commit solves>

**Analysis:**
<Your analysis of the problem, such as root cause analysis>
< -and- >
<An analysis of the chosen solution, such as (briefly) what it is, why you chose it, and what impact it has>

**Testing:**
<What testing was done on this commit.  Some kind of testing must be done.>

**Documentation:**
<What documentation was created or updated, or why that wasn't necessary>
```

## Needs

For a full list of current needs, see the issues for this project.
