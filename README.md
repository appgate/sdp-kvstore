# Proof of concept 
## Overview
The architecture involves the following components:

1. Customization with the kv store consul. Deployed on Gateways.
2. Condition which can write and read from the kv store.

The problem to solve is to give entitlement scripts and conditions a way to keep state between runs since they cannot keep state or create claims [1]. The kv store allows to store/retrieve data necessary for the logic to expand. A simple use case could be setting flags to, example `true|false`, to be carried on to be used in a later run or in a other condition/entitlement script (e.g create an external claim).


This demonstrate the feasibility of consul as data store. The kv data store can be used for example in keeping stateful information during a session. The kv store can be read/written in for example a condition. The provided configuration can be summarized as:

* Consul is running on single node. 
* There is no security configured 
* It has not been investigated how it scales
* Logging is set to INFO (syslog destination)
* The JS is an example how to read/write per session with a session-key. 


## The customization
[Read the documentation how customization work before continuing](https://sdphelp.appgate.com/adminguide/appliance-customizations-configure.html).
* Clone this repository, and cd into it.
* Download the latest binary [https://www.consul.io/](https://www.consul.io/)
	* Save it as `customization/data/bin/consul`
* Create the customization zip-file:
``` 
$cd customization
$zip -r consul_customisation.zip *
```

The customization has the following structure prior to zipping it:
```
.
├── data
│   ├── bin
│   │   └── consul <the consul binary>
│   └── consul.d
│       ├── config.json <consul config>
│       └── scripts <currently not used>
├── start <start script>
└── stop < stop script>
```

Now upload the customization __Scripts > Appliance Customizations__. On the appliance setting you can choose to deploy the customization.

## The JS code/condition
See the `condition.js` for details. It basically writes and reads at the same time to the store and shows a result in the `console.log` when running with the test button.

>When testing a condition script, remember the script is always executed on the controller, so you would need to have it running on the controller as well.

* The code read/writes on a path which is deduced from device ID. This allows `per-session` store e.g. a uniq-id which can be predicted from existing claims on every run. 
* If you run it in real, on a GW, you can check with the Admin UI session details, or using `curl` on the command line. See below.

#### Curl examples
You can run the following examples on the appliance for which you installed the customization.


*Store*
```
curl -v --request PUT  --data "[{'state':'excellent', 'date':'2020-04-29T13:41:09.546Z'}]" http://127.0.0.1:8500/v1/kv/superstate

```

*Read*

``` sh
curl -s http://127.0.0.1:8500/v1/kv/superstate|jq
[
  {
    "LockIndex": 0,
    "Key": "superstate",
    "Flags": 0,
    "Value": "W3snc3RhdGUnOidleGNlbGxlbnQnLCAnZGF0ZSc6JzIwMjAtMDQtMjlUMTM6NDE6MDkuNTQ2Wid9XQ==",
    "CreateIndex": 228,
    "ModifyIndex": 228
  }
]
```
Or even better to retrieve the *value* for that *key*
```sh 
curl -s http://127.0.0.1:8500/v1/kv/superstate|jq -r '.[0].Value'|base64 -d
[{'state':'excellent', 'date':'2020-04-29T13:41:09.546Z'}]
```


# Study on multi GW per site setup
As soon as you have more than one GW on a site, you will need to assure the session's data is accessible from all GWs. If a user session flips to the other gateway, for example because of gateway error, it would be in need to access the data independently of its session egress point for that site.

## Using consul with data replication 
There is a fallacy with consul for Appgate: the [consensus protocol](https://www.consul.io/docs/internals/consensus.html)  will need to fulfill a quorum of `(n/2) + 1` {where n is number of nodes} to make it work. This means there needs always to be (n/2) +1 nodes available for consul to work. Example:
- 2 Gateways: If one of them is down, no entries can be read/written in consul.
- 3 Gateways: only 1 GW is tolerated to be down. But if 2 would be down/unreachable r/w will not work.

So this basically means it would require an additional node to tolerate an Appgate failure. Examples here mean number of GWs per site:
- 2 Gateways -> require 1 dedicated instance:
	- If one of the GW is down, it will still work.
- 3 Gateways  require 2 dedicated instance:
	- If one or 2 GW will not be available, it will still work.

To make the nodes talk to each other, you would need to adjust the iptables as to [ports and protocols used](https://www.consul.io/docs/install/ports.html). This would be as part of the start script, or could be stored permanently per appliance:
``` 
sudo iptables -t filter -A INPUT -p tcp --dport 8600 -j ACCEPT -m conntrack --ctstate NEW,ESTABLISHED -m comment --comment consul-dns-tcp
sudo iptables -t filter -A INPUT -p udp --dport 8600 -j ACCEPT -m conntrack --ctstate NEW,ESTABLISHED -m comment --comment consul-dns-udp
sudo iptables -t filter -A INPUT -p tcp --dport 8500 -j ACCEPT -m conntrack --ctstate NEW,ESTABLISHED -m comment --comment consul-http
sudo iptables -t filter -A INPUT -p tcp --dport 8300 -j ACCEPT -m conntrack --ctstate NEW,ESTABLISHED -m comment --comment consul-server_rpc-tcp
sudo iptables -t filter -A INPUT -p tcp --dport 8301 -j ACCEPT -m conntrack --ctstate NEW,ESTABLISHED -m comment --comment consul-serfLan-tcp
sudo iptables -t filter -A INPUT -p tcp --dport 8302 -j ACCEPT -m conntrack --ctstate NEW,ESTABLISHED -m comment --comment consul-serWan-tcp
sudo iptables -t filter -A INPUT -p udp --dport 8301 -j ACCEPT -m conntrack --ctstate NEW,ESTABLISHED -m comment --comment consul-serfLan-udp
```
This will become also more difficult if you are running GW on WANs. You would like to add a more strict rule for the `source IP`s but not `ANY`. This means the customization will need to know about each others IP. 
In a local network you can at least restrict to source IP from local network, example deduced from the interface (assuming a /24):
``` 
ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' |  sed -e 's/\([0-9]\+\)\.\([0-9]\+\)\.\([0-9]\+\)\.\([0-9]\+\)/\1\.\2\.\3\.0\/24/'
 --> 10.10.10.0/24
```
The consul configuration will also need to be aware of each others IPs. For that you will also need to have either a customization per site, or doing some sort of init script which deduces from a list the sites IP addresses, or does some lookup. In any case, you need to take care of it. An example of a configuration:
```
{
    "bind_addr": "<local nodes listen address>",
    "client_addr": "<local nodes listen address>",
    "datacenter": "localAppliance",
    "data_dir": "/tmp/consul",
    "domain": "consul",
    "enable_script_checks": true,
    "dns_config": {
        "enable_truncate": true,
        "only_passing": true
    },
    "enable_syslog": true,
    "encrypt": "",
    "leave_on_terminate": true,
    "log_level": "INFO",
    "rejoin_after_leave": true,
    "server": true,
    "ui": false,
    "retry_join": ["<other nodes IP address>"]
}
``` 

### Conclusion
To add additional nodes adds to the complexity (if those are not available as server-less function). It becomes expensive, and also adding more nodes means also higher fault propability a single node fails. Second, you would need to handle ports and ip access rules for the nodes to talk to each other, and you would need to might need to make the nodes aware of each others IP address.



## Using local consul with multi writes
You can run the consul as local single store to the appliance:
- Write session data: to all consul nodes on every gateway in that site.
- Read session data: read on the local node.

This will have some overhead for the multi writes, but you will not need to require to have a quorum to make the data store available. You will need however to think of some engineering items:
- the http request can time-out: the outgoing call can take no longer than 3 seconds (max request time-out). The total runtime of the code cannot take longer than 5 seconds to complete, otherwise it will be killed and will not complete. With the number of writes you need to do, you will need to set time-outs accordingly.
- You need to open only one port for the http call. 
	- But you might restrict it source as well based on your type of network the gateways running in.
	- You might need to give the source IP or use as above to allow from local network. You will need to take care of it.


### Conclusion
The nodes might fail, and hence you want to time-out that write request quickly. You will have probably an easier solution than with the replicated one: it will not guarantee that the data is same on all nodes (write and continue). So you would need to use some practical writes e.g replace all data when write, no dependency. On the other hand you should understand how strong your logic relies on the read data, and account for data that might be not correct.


## End notes
If you consider to build a logic with a stand-alone consul node, you will need to think of the data's life-cycle:
* Possible start options for kv store. 
	* Assume the store is initial empty or contains unusable data (e.g. after reboot).
	* there could be a value from previous run or previous (ended) session. 
* Modus operandi 
	* Always *read* then *write* value. Use a time-stamp as part of the data (inner JSON, or different key).
	* Have an external cron job cleaning out old records (option 1).
	* Have a  dedicated maintenance code: it executes cleanup logic for the uniq-id every once a week. Using kv store to manage cleanup timing (option 2).
* Possible end states for kv store for a session. 
	* There is no notion of a logout-action. A *maintenance* code or procedures might be used to clear store.
	* A reboot of the appliance clears the store. If you required persistence, you will need to engineer for it, otherwise your code needs to take care of this case.


