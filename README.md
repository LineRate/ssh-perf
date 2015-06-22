<!---
Copyright (c) 2015, F5 Networks, Inc. All rights reserved.

No part of this software may be reproduced or transmitted in any
form or by any means, electronic or mechanical, for any purpose,
without express written permission of F5 Networks, Inc.

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
   --agent PATH                     The ssh-agent's socket path, if using an agent
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
