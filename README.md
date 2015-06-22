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

# ssh-perf

A tool for testing SSH, SCP, and SFTP performance.

# CLI Use

```
$ npm install ssh-perf
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
   -m STRING, --mode STRING         The mode of testing (connections,execs,sftp,scp,max-connections)  [connections]
   -c INT, --concurrency INT        How many requests can be open simultaneously  [1]
   -p INT, --processes INT          How many processes to run in  [1]
   -d INT, --delay INT              The delay (in milliseconds) between establishing connections  [0]
   -t INT, --max_conn_timeout INT   The time (in seconds) to wait before assuming max connections reached if no new conns have been established.  [30]
   -P FILE, --put FILE              (SCP and SFTP only) Put a local file onto the remote server  []
   -G FILE, --get FILE              (SCP and SFTP only) Get a remote file onto the local client  []

Performance testing tool for SSH, SCP, and SFTP.

Tool will run until stopped with Ctrl-C.
```
