// The station console's shell, part 11 of 13 (#255): the station network
// (#164). ip, ss, ping, nc, hostname, the firewall (ufw), curl and ssh.
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var COMMANDS = S.COMMANDS, DAYS = S.DAYS, flags = S.flags, formatIPv4 = S.formatIPv4,
    HOSTNAME_ADDRESS = S.HOSTNAME_ADDRESS, lines = S.lines, MONTHS = S.MONTHS, ok = S.ok,
    padRight = S.padRight, parseIPv4 = S.parseIPv4, prefixMask = S.prefixMask,
    serviceName = S.serviceName, Shell = S.Shell, renderUsage = S.renderUsage,
    procName = S.procName;

  // A name for ping and nc, as getaddrinfo finds it: /etc/hosts, then DNS (#165).
  Shell.prototype.resolveName = function (name) {
    if (parseIPv4(name) !== null) return { address: parseIPv4(name), numeric: true };
    if (/^[\d.]+$/.test(name)) return { error: "Name or service not known" };
    var entry = this.hostsEntry(name, false);
    if (entry) return { address: parseIPv4(entry.address), canonical: entry.names[0] };
    var asked = this.askDns(name, "A", 2);
    if (!asked.result) return { error: "Temporary failure in name resolution" };
    var a = asked.result.answer.filter(function (r) { return r.type === "A"; })[0];
    if (!a) return { error: asked.result.status === "NXDOMAIN" ? "Name or service not known" : "No address associated with hostname" };
    return { address: parseIPv4(a.data), canonical: a.name };
  };

  // route() as another host sees it (#166), for ping inside `ssh HOST '…'`: it
  // reaches the console (ufw lets ping in) and every host the exercise has;
  // anything else is silence.
  Shell.prototype.routeFrom = function (addr) {
    var origin = this.origin;
    var iface = { address: origin.address, broadcast: -1 };
    if (addr === origin.address || addr >>> 24 === 127) return { local: true, iface: iface };
    if (this.isConsole(addr)) return { iface: iface, via: null, host: { up: true, ping: true } };
    var host = this.net.hosts.filter(function (h) { return h.address === addr; })[0] || null;
    return { iface: iface, via: host ? null : origin.address, host: host };
  };

  Shell.prototype.isLocal = function (addr) {
    return addr >>> 24 === 127 || this.net.ifaces.some(function (i) { return i.address === addr; });
  };

  // Where a packet to `addr` goes: {local}, {unreachable} (no route), or the
  // interface it leaves by, `via` the gateway unless it's on that subnet, and
  // the host that answers (null when no machine has that address).
  Shell.prototype.route = function (addr) {
    var net = this.net;
    if (this.isLocal(addr)) return { local: true };
    var onlink = net.ifaces.filter(function (i) { return ((addr & i.mask) >>> 0) === i.network; })[0];
    var iface = onlink || (net.gateway !== null && net.ifaces.filter(function (i) { return ((net.gateway & i.mask) >>> 0) === i.network; })[0]);
    if (!iface) return { unreachable: true };
    var host = net.hosts.filter(function (h) { return h.address === addr; })[0] || null;
    if (!host && addr === net.gateway) host = { name: "gateway", address: addr, up: true, ping: true, services: [], filtered: [] };
    return { iface: iface, via: onlink ? null : net.gateway, host: host };
  };

  // The console's own sockets, held by its live processes: kill the process
  // and its sockets go too. sshd listens on 22, as on any server.
  Shell.prototype.sockets = function () {
    var sh = this, net = this.net, fds = {}, out = [];
    function add(socket, name) {
      var proc = sh.procs.filter(function (p) { return p.alive && procName(p.command) === name; })[0];
      if (!proc) return;
      fds[proc.pid] = (fds[proc.pid] || 2) + 1;
      socket.proc = proc;
      socket.fd = fds[proc.pid];
      out.push(socket);
    }
    add({ proto: "tcp", state: "LISTEN", local: "0.0.0.0", port: 22, peer: "0.0.0.0", peerPort: "*" }, "sshd");
    net.listening.forEach(function (s) {
      var proto = s.proto || "tcp";
      add({ proto: proto, state: proto === "tcp" ? "LISTEN" : "UNCONN", local: s.address || "0.0.0.0", port: s.port, peer: "0.0.0.0", peerPort: "*", spec: s }, s.process);
    });
    add({ proto: "tcp", state: "LISTEN", local: "[::]", port: 22, peer: "[::]", peerPort: "*", v6: true }, "sshd");
    net.connections.forEach(function (c, i) {
      var at = c.remote.lastIndexOf(":");
      var remote = parseIPv4(c.remote.slice(0, at));
      var route = sh.route(remote);
      var src = route.iface ? formatIPv4(route.iface.address) : "127.0.0.1";
      // An outgoing connection's own port is an ephemeral one, picked by the kernel.
      var port = c.local_port || 32768 + ((i + 1) * 15485 + +c.remote.slice(at + 1) * 31) % 28232;
      add({ proto: "tcp", state: "ESTAB", local: src, port: port, peer: c.remote.slice(0, at), peerPort: +c.remote.slice(at + 1) }, c.process);
    });
    return out;
  };

  // Is something on the console listening on tcp `port` at `addr`?
  Shell.prototype.listensOn = function (addr, port) {
    return this.sockets().some(function (s) {
      if (s.proto !== "tcp" || s.state !== "LISTEN" || s.port !== port) return false;
      return s.local === "0.0.0.0" || s.local === "[::]" || parseIPv4(s.local) === addr;
    });
  };

  // Options a real command has and the console doesn't, said in so many words.
  function netFlags(cmd, args, supported, real, valued) {
    var p = flags(cmd, args, real, valued);
    Object.keys(p.opts).forEach(function (f) {
      if (supported.indexOf(f) === -1) throw new Error("-" + f + " isn't supported on this console");
    });
    return p;
  }

  // --- ip -----------------------------------------------------------------------------
  function ipFlags(iface) {
    return iface ? "<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP" : "<LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN";
  }
  function ipHeader(iface, link) {
    var head = iface ? iface.index + ": " + iface.name + ": " : "1: lo: ";
    return head + ipFlags(iface) + (link ? " mode DEFAULT" : "") + " group default qlen 1000\n";
  }
  function ipLinkLine(iface) {
    return iface ? "    link/ether " + iface.mac + " brd ff:ff:ff:ff:ff:ff\n" : "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n";
  }
  var FOREVER = "       valid_lft forever preferred_lft forever\n";

  Shell.prototype.ipAddr = function (o, dev, link) {
    var list = [null].concat(this.net.ifaces); // null is lo
    if (dev !== null) {
      list = list.filter(function (i) { return (i ? i.name : "lo") === dev; });
      if (!list.length) return { out: "", err: 'Device "' + dev + '" does not exist.\n', code: 1 };
    }
    var out = "";
    list.forEach(function (i) {
      var name = i ? i.name : "lo";
      var v4 = i ? [formatIPv4(i.address) + "/" + i.prefix] : ["127.0.0.1/8"];
      var v6 = i ? [i.linkLocal + "/64"] : ["::1/128"];
      if (o.brief) {
        var state = i ? "UP" : "UNKNOWN";
        var rest = link
          ? (i ? i.mac : "00:00:00:00:00:00") + " <" + ipFlags(i).slice(1, ipFlags(i).indexOf(">")) + "> "
          : (o.family === 6 ? [] : v4).concat(o.family === 4 ? [] : v6).map(function (a) { return a + " "; }).join("");
        out += padRight(name, 16) + " " + padRight(state, 14) + " " + rest + "\n";
        return;
      }
      out += ipHeader(i, link);
      if (link) { out += ipLinkLine(i); return; }
      if (!o.family) out += ipLinkLine(i);
      if (o.family !== 6) {
        out += i ? "    inet " + v4[0] + " brd " + formatIPv4(i.broadcast) + " scope global " + name + "\n" : "    inet 127.0.0.1/8 scope host lo\n";
        out += FOREVER;
      }
      if (o.family !== 4) {
        out += i ? "    inet6 " + v6[0] + " scope link \n" : "    inet6 ::1/128 scope host noprefixroute \n";
        out += FOREVER;
      }
    });
    return ok(out);
  };

  Shell.prototype.ipRoute = function (words) {
    var net = this.net;
    var verb = words[0] || "show";
    if (/^g(e(t)?)?$/.test(verb)) {
      var target = words[1];
      if (target === "to") target = words[2];
      if (target === undefined) return { out: "", err: "need at least a destination address\n", code: 1 };
      var addr = parseIPv4(target);
      if (addr === null) return { out: "", err: 'Error: any valid prefix is expected rather than "' + target + '".\n', code: 1 };
      var uid = this.account(this.user) ? this.account(this.user).uid : 1000;
      if (this.isLocal(addr)) return ok("local " + target + " dev lo src " + target + " uid " + uid + " \n    cache <local> \n");
      var r = this.route(addr);
      if (r.unreachable) return { out: "", err: "RTNETLINK answers: Network is unreachable\n", code: 2 };
      return ok(target + (r.via !== null ? " via " + formatIPv4(r.via) : "") + " dev " + r.iface.name + " src " + formatIPv4(r.iface.address) + " uid " + uid + " \n    cache \n");
    }
    if (!/^(s(h(o(w)?)?)?|l(i(s(t)?)?)?|lst)$/.test(verb)) return this.ipChange(verb, "route");
    var only = words[1];
    if (only !== undefined && only !== "default") throw new Error("ip route show " + only + " isn't supported on this console; try ip route, or ip route get ADDRESS");
    var out = "";
    if (net.gateway !== null) {
      var gw = net.ifaces.filter(function (i) { return ((net.gateway & i.mask) >>> 0) === i.network; })[0];
      out += "default via " + formatIPv4(net.gateway) + " dev " + gw.name + " proto static \n";
    }
    if (only !== "default") {
      net.ifaces.forEach(function (i) {
        out += formatIPv4(i.network) + "/" + i.prefix + " dev " + i.name + " proto kernel scope link src " + formatIPv4(i.address) + " \n";
      });
    }
    return ok(out);
  };

  // Changing the network: a normal user isn't allowed, as on a real server;
  // root is, there, but this console's network is the exercise's.
  Shell.prototype.ipChange = function (verb, object) {
    if (["add", "del", "delete", "change", "replace", "flush", "set", "append"].indexOf(verb) === -1) {
      return { out: "", err: 'Command "' + verb + '" is unknown, try "ip ' + object + ' help".\n', code: 255 };
    }
    if (this.user !== "root") return { out: "", err: "RTNETLINK answers: Operation not permitted\n", code: 2 };
    throw new Error("changing the network isn't supported on this console");
  };

  COMMANDS.ip = function (args) {
    var o = { family: 0, brief: false };
    var i = 0;
    for (; i < args.length && args[i][0] === "-"; i++) {
      var a = args[i].replace(/^--?/, "-");
      if (a === "-4") o.family = 4;
      else if (a === "-6") o.family = 6;
      else if (/^-br(i(e(f)?)?)?$/.test(a)) o.brief = true;
      else if (/^-c(o(l(o(r)?)?)?)?(=.*)?$/.test(a)) continue; // colour: the console prints plain text
      else if (/^-h(e(l(p)?)?)?$/.test(a)) return ok(renderUsage("ip"));
      else throw new Error(args[i] + " isn't supported on this console");
    }
    var object = args[i];
    var words = args.slice(i + 1);
    if (object === undefined) return { out: "", err: renderUsage("ip"), code: 255 };
    var objects = ["address", "addrlabel", "link", "route", "rule", "neighbour", "neighbor", "ntable", "tunnel", "maddress", "monitor", "netns", "help"];
    var full = objects.filter(function (w) { return w.indexOf(object) === 0; })[0];
    if (!full) return { out: "", err: 'Object "' + object + '" is unknown, try "ip help".\n', code: 1 };
    if (full === "help") return ok(renderUsage("ip"));
    if (full === "route") return this.ipRoute(words);
    if (full !== "address" && full !== "link") throw new Error("ip " + full + " isn't supported on this console; try ip addr, ip link or ip route");
    var verb = words[0] || "show";
    if (!/^(s(h(o(w)?)?)?|l(i(s(t)?)?)?|lst)$/.test(verb)) return this.ipChange(verb, full);
    var rest = words.slice(1);
    if (rest[0] === "dev") rest = rest.slice(1);
    if (rest[0] === "dev" || rest.length > 1) throw new Error("ip " + full + " show takes one device name on this console");
    if (words.length > 1 && !rest.length) return { out: "", err: "Command line is not complete. Try option \"help\"\n", code: 255 };
    return this.ipAddr(o, rest.length ? rest[0] : null, full === "link");
  };

  // --- ss -----------------------------------------------------------------------------
  // Columns as ss lays them out when its output isn't a terminal: each as wide
  // as its widest entry (the header's too), addresses right-aligned against
  // their ports. The console has no screen width to spread them over.
  var SS_COLUMNS = [
    { header: "Netid", delim: "" }, { header: "State", delim: " " }, { header: "Recv-Q", delim: " " }, { header: "Send-Q", delim: " " },
    { header: "Local Address:", delim: " ", right: true }, { header: "Port", delim: "" },
    { header: "Peer Address:", delim: " ", right: true }, { header: "Port", delim: "" }, { header: "Process", delim: "" },
  ];
  function renderSs(rows, withNetid, header) {
    var cols = SS_COLUMNS.map(function (c, k) { return { header: c.header, delim: c.delim, right: c.right, on: k > 0 || withNetid }; });
    var lines = (header ? [cols.map(function (c) { return c.header; })] : []).concat(rows);
    var first = true;
    cols.forEach(function (c, k) {
      if (!c.on) return;
      var max = Math.max.apply(null, lines.map(function (l) { return l[k].length; }));
      c.width = !first && max ? max + c.delim.length : max;
      if (c.width) first = false;
    });
    return lines.map(function (l) {
      var line = "", started = false;
      cols.forEach(function (c, k) {
        if (!c.on) return;
        var printed = started ? c.delim.length : 0;
        line += started ? c.delim : "";
        started = true;
        if (c.right) line += new Array(Math.max(0, c.width - l[k].length - printed) + 1).join(" ") + l[k];
        else line += l[k] + new Array(Math.max(0, c.width - printed - l[k].length) + 1).join(" ");
      });
      return line + "\n";
    }).join("");
  }

  COMMANDS.ss = function (args) {
    var p = netFlags("ss", args, "tulanp46H", "hVHnraloempisEZzb460tuwSxdMKOfAFDN", "fAFDN");
    if (p.args.length) throw new Error("filters (" + p.args.join(" ") + ") aren't supported on this console; pipe ss to grep instead");
    var o = p.opts;
    var sh = this;
    var protos = o.t || o.u ? [o.u && "udp", o.t && "tcp"].filter(Boolean) : ["udp", "tcp"]; // ss lists UDP first
    var root = this.user === "root";
    var rows = [];
    protos.forEach(function (proto) {
      sh.sockets().forEach(function (s) {
        if (s.proto !== proto) return;
        if ((o["4"] && s.v6) || (o["6"] && !s.v6)) return;
        var listening = s.state === "LISTEN" || s.state === "UNCONN";
        if (!o.a && (o.l ? !listening : listening)) return;
        var port = function (n) { return n === "*" || o.n ? String(n) : serviceName(n, proto) || String(n); };
        rows.push([
          proto, s.state, padRight("0", 6), padRight(s.state === "LISTEN" ? "4096" : "0", 6),
          s.local + ":", port(s.port), s.peer + ":", port(s.peerPort),
          // Only root sees other users' processes.
          o.p && (root || s.proc.user === sh.user) ? ' users:(("' + procName(s.proc.command) + '",pid=' + s.proc.pid + ",fd=" + s.fd + "))" : "",
        ]);
      });
    });
    return ok(renderSs(rows, protos.length > 1, !o.H));
  };

  // --- ping ---------------------------------------------------------------------------
  // Round trips are made up but steady: the same host and sequence number
  // always take the same time, so output can be checked.
  function rttFor(addr, seq, base) {
    var h = (((addr >>> 0) ^ Math.imul(seq, 2654435761)) >>> 0) % 1000 / 1000;
    return base * (0.8 + 0.6 * h);
  }
  function pingTime(ms) {
    return ms >= 100 ? String(Math.round(ms)) : ms >= 10 ? ms.toFixed(1) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(3);
  }

  COMMANDS.ping = function (args, stdin, io) {
    var p = netFlags("ping", args, "cqW4", "aAbBc:dDefhHi:I:l:LmM:nOp:qQ:rRs:S:t:T:UvVw:W:4".replace(/:/g, ""), "ciIlMpQsStTwW");
    var o = p.opts;
    if (!p.args.length) return { out: "", err: "ping: usage error: Destination address required\n", code: 1 };
    if (o.c === undefined) return { out: "", err: "ping: give it a count on this console: ping -c 4 " + p.args[p.args.length - 1] + " (a real ping runs until Ctrl-C)\n", code: 2 };
    if (!/^\d+$/.test(o.c)) return { out: "", err: "ping: invalid argument: '" + o.c + "'\n", code: 1 };
    var count = parseInt(o.c, 10);
    if (count < 1) return { out: "", err: "ping: invalid argument: '" + o.c + "': out of range: 1 <= value <= 9223372036854775807\n", code: 1 };
    if (count > 100) throw new Error("-c " + count + " is more than this console will send; 100 at most");
    var name = p.args[p.args.length - 1];
    var found = this.resolveName(name);
    if (found.error) return { out: "", err: "ping: " + name + ": " + found.error + "\n", code: 2 };
    var addr = found.address;
    var shown = formatIPv4(addr);
    // Given a name, ping prints the canonical one and names each reply's
    // sender (/etc/hosts, then a PTR), or just its address without a name.
    var title = found.numeric ? name : found.canonical;
    var sh = this;
    var from = function (a) {
      if (found.numeric) return formatIPv4(a);
      var back = sh.reverseName(a);
      return back ? back + " (" + formatIPv4(a) + ")" : formatIPv4(a);
    };
    var route = this.origin ? this.routeFrom(addr) : this.route(addr);
    if (route.unreachable) return { out: "", err: "ping: connect: Network is unreachable\n", code: 2 };
    if (route.iface && addr === route.iface.broadcast) return { out: "", err: "ping: Do you want to ping broadcast? Then -b. If not, check your local firewall rules\n", code: 2 };
    var host = route.host;
    var answers = route.local || (host && host.up && host.ping);
    var noArp = !route.local && route.via === null && !(host && host.up); // nothing on the wire answers for the address
    var who = answers ? from(addr) : null, me = noArp ? from(route.iface.address) : null;
    io.out.write("PING " + title + " (" + shown + ") 56(84) bytes of data.\n");
    var times = [], errors = 0;
    for (var seq = 1; seq <= count; seq++) {
      if (answers) {
        var ms = rttFor(addr, seq, route.local ? 0.04 : route.via === null ? 0.45 : 24);
        times.push(ms);
        if (!o.q) io.out.write("64 bytes from " + who + ": icmp_seq=" + seq + " ttl=" + (route.via === null || route.local ? 64 : 63) + " time=" + pingTime(ms) + " ms\n");
      } else if (noArp) {
        // The kernel gives up asking who has the address after three tries.
        if (seq === 4) { io.err.write("ping: sendmsg: No route to host\n"); continue; }
        errors++;
        if (!o.q) io.out.write("From " + me + " icmp_seq=" + seq + " Destination Host Unreachable\n");
      }
    }
    this.clock += count;
    this.reap();
    var received = times.length;
    var elapsed = count === 1 ? 0 : (count - 1) * 1000 + (answers ? 2 * count : 20 + 24 * (count - 1));
    var out = "\n--- " + title + " ping statistics ---\n" + count + " packets transmitted, " + received + " received, " +
      (errors ? "+" + errors + " errors, " : "") + Math.round(100 - (received * 100) / count) + "% packet loss, time " + elapsed + "ms\n";
    var tail = [];
    if (received) {
      var sum = times.reduce(function (a, b) { return a + b; }, 0), sq = times.reduce(function (a, b) { return a + b * b; }, 0);
      var avg = sum / received;
      tail.push("rtt min/avg/max/mdev = " + [Math.min.apply(null, times), avg, Math.max.apply(null, times), Math.sqrt(Math.max(0, sq / received - avg * avg))]
        .map(function (n) { return n.toFixed(3); }).join("/") + " ms");
    }
    var pipe = noArp ? Math.min(count, 3) : 1;
    if (pipe > 1) tail.push("pipe " + pipe);
    io.out.write(out + tail.join(", ") + "\n");
    return { out: "", err: "", code: received ? 0 : 1 };
  };

  // --- nc -----------------------------------------------------------------------------
  // nc -z: is anything listening? Three answers, and the lesson is telling
  // them apart: succeeded, refused (the host said no), and timed out or no
  // route (nothing said anything). Debian's nc reports success even without
  // -v, and says all of it on stderr.
  COMMANDS.nc = function (args, stdin, io) {
    var p = netFlags("nc", args, "zvwn4", "46CDdFhI:i:klM:m:NnO:P:p:q:rSs:T:tUuV:vW:w:X:x:Zz".replace(/:/g, ""), "IiMmOPpqsTVWwXx");
    var o = p.opts;
    if (!o.z) throw new Error("this console's nc only checks ports: nc -zv HOST PORT");
    if (o.w !== undefined && !/^\d+$/.test(o.w)) return { out: "", err: "nc: timeout invalid: " + o.w + "\n", code: 1 };
    var name = p.args[0];
    if (name === undefined) throw new Error("usage: nc -zv HOST PORT");
    if (p.args.length < 2) return { out: "", err: "nc: missing port number\n", code: 1 };
    var ports = [];
    for (var k = 1; k < p.args.length; k++) {
      var m = /^(\d+)(?:-(\d+))?$/.exec(p.args[k]);
      if (!m) return { out: "", err: "nc: port number invalid: " + p.args[k] + "\n", code: 1 };
      var lo = +m[1], hi = m[2] === undefined ? lo : +m[2];
      if (hi > 65535 || lo > 65535) return { out: "", err: "nc: port number too large: " + (lo > 65535 ? m[1] : m[2]) + "\n", code: 1 };
      if (lo < 1 || hi < lo) return { out: "", err: "nc: port range not valid: " + p.args[k] + "\n", code: 1 };
      if (hi - lo > 1000) throw new Error("ranges of more than 1000 ports aren't supported on this console");
      for (var n = lo; n <= hi; n++) ports.push(n);
    }
    var found = o.n && parseIPv4(name) === null ? { error: "Name or service not known" } : this.resolveName(name); // -n: no lookups
    if (found.error) return { out: "", err: 'nc: getaddrinfo for host "' + name + '" port ' + p.args[1] + ": " + found.error + "\n", code: 1 };
    var addr = found.address;
    var who = found.numeric ? name : name + " (" + formatIPv4(addr) + ")";
    var opened = false;
    var sh = this;
    ports.forEach(function (port) {
      var outcome = sh.connect(addr, port).outcome; // from here, or from the host `ssh` is on (#166)
      var fail = "nc: connect to " + who + " port " + port + " (tcp) ";
      if (outcome === "open") {
        opened = true;
        io.err.write("Connection to " + who + " " + port + " port [tcp/" + (serviceName(port, "tcp") || "*") + "] succeeded!\n");
      } else if (outcome === "timeout") {
        // With -w, nc gives up when it says; without, the kernel does, after
        // its SYN retries: two minutes and more.
        sh.clock += o.w !== undefined ? +o.w : 134;
        if (o.v) io.err.write(fail + (o.w !== undefined ? "timed out: Operation now in progress\n" : "failed: Connection timed out\n"));
      } else if (o.v) {
        if (outcome === "noroute") sh.clock += 3;
        io.err.write(fail + "failed: " + { refused: "Connection refused", noroute: "No route to host", unreachable: "Network is unreachable" }[outcome] + "\n");
      }
    });
    this.reap();
    return { out: "", err: "", code: opened ? 0 : 1 };
  };

  // --- hostname -----------------------------------------------------------------------
  COMMANDS.hostname = function (args) {
    var p = netFlags("hostname", args, "Iisf", "aAbdfFhiIsvVy", "F");
    var o = p.opts;
    if (p.args.length) {
      if (this.user !== "root") return { out: "", err: "hostname: you must be root to change the host name\n", code: 1 };
      throw new Error("renaming the station isn't supported on this console");
    }
    if (this.origin) return ok(o.I ? formatIPv4(this.origin.address) + " \n" : o.i ? "127.0.1.1\n" : this.origin.name + "\n");
    if (o.I) return ok(this.net.ifaces.map(function (i) { return formatIPv4(i.address) + " "; }).join("") + "\n");
    if (o.i) return ok(HOSTNAME_ADDRESS + "\n");
    return ok("meridian\n");
  };

  // --- the console's firewall: ufw (#166) ---------------------------------------------
  // ufw keeps its state in its own files, and so does the console: ENABLED in
  // /etc/ufw/ufw.conf, and the rules as `### tuple ###` lines in user.rules
  // (schema/terminal/firewall.py writes them for the starting filesystem, byte for byte as ufw
  // 0.36.2 does, and a test holds this renderer to the same bytes). Rules only
  // touch connections *into* the console from other hosts: the first rule that
  // matches decides, and with none, incoming is denied, which drops the packet,
  // so the other end times out. Ping gets through, as ufw's before.rules allow.
  var UFW_CHAINS = ["user-input", "user-output", "user-forward", "before-logging-input", "before-logging-output",
    "before-logging-forward", "user-logging-input", "user-logging-output", "user-logging-forward",
    "after-logging-input", "after-logging-output", "after-logging-forward", "logging-deny", "logging-allow",
    "user-limit", "user-limit-accept"];
  function ufwConf(enabled) {
    return "# /etc/ufw/ufw.conf\n#\n\n# Set to yes to start on boot. If setting this remotely, be sure to add a rule\n" +
      "# to allow your remote connection before starting ufw. Eg: 'ufw allow 22/tcp'\nENABLED=" + (enabled ? "yes" : "no") +
      "\n\n# Please use the 'ufw' command to set the loglevel. Eg: 'ufw logging medium'.\n# See 'man ufw' for details.\nLOGLEVEL=low\n";
  }
  var UFW_INSTALLED = "*filter\n:ufw-user-input - [0:0]\n:ufw-user-output - [0:0]\n:ufw-user-forward - [0:0]\n" +
    ":ufw-user-limit - [0:0]\n:ufw-user-limit-accept - [0:0]\n### RULES ###\n" +
    '-A ufw-user-limit -m limit --limit 3/minute -j LOG --log-prefix "[UFW LIMIT BLOCK] "\n' +
    "-A ufw-user-limit -j REJECT\n-A ufw-user-limit-accept -j ACCEPT\nCOMMIT\n";
  function ufwRules(tuples, six) {
    var chain = six ? "ufw6" : "ufw";
    var log = "-m limit --limit 3/min --limit-burst 10";
    var out = "*filter\n" + UFW_CHAINS.map(function (c) { return ":" + chain + "-" + c + " - [0:0]\n"; }).join("") + "### RULES ###\n";
    tuples.forEach(function (t) {
      var w = t.split(" ");
      if (six) {
        if (w[5] !== "0.0.0.0/0") return; // an IPv4 source has no IPv6 rule
        t = t.replace(/0\.0\.0\.0\/0/g, "::/0");
      }
      out += "\n### tuple ### " + t + "\n";
      var jump = w[0] === "allow" ? "ACCEPT" : "DROP";
      var source = w[5] === "0.0.0.0/0" ? "" : " -s " + w[5];
      if (w[2] === "any") out += "-A " + chain + "-user-input" + source + " -j " + jump + "\n";
      else (w[1] === "any" ? ["tcp", "udp"] : [w[1]]).forEach(function (p) {
        out += "-A " + chain + "-user-input -p " + p + " --dport " + w[2] + source + " -j " + jump + "\n";
      });
    });
    return out + "\n### END RULES ###\n\n### LOGGING ###\n" +
      "-A " + chain + '-after-logging-input -j LOG --log-prefix "[UFW BLOCK] " ' + log + "\n" +
      "-A " + chain + '-after-logging-forward -j LOG --log-prefix "[UFW BLOCK] " ' + log + "\n" +
      "-I " + chain + "-logging-deny -m conntrack --ctstate INVALID -j RETURN " + log + "\n" +
      "-A " + chain + '-logging-deny -j LOG --log-prefix "[UFW BLOCK] " ' + log + "\n" +
      "-A " + chain + '-logging-allow -j LOG --log-prefix "[UFW ALLOW] " ' + log + "\n" +
      "### END LOGGING ###\n\n### RATE LIMITING ###\n" +
      "-A " + chain + '-user-limit -m limit --limit 3/minute -j LOG --log-prefix "[UFW LIMIT BLOCK] "\n' +
      "-A " + chain + "-user-limit -j REJECT\n-A " + chain + "-user-limit-accept -j ACCEPT\n### END RATE LIMITING ###\nCOMMIT\n";
  }
  function ruleTuple(r) { return r.action + " " + r.proto + " " + (r.port === null ? "any" : r.port) + " 0.0.0.0/0 any " + (r.from || "0.0.0.0/0") + " in"; }
  function parseTuple(t) {
    var w = t.split(" ");
    return { action: w[0], proto: w[1], port: w[2] === "any" ? null : +w[2], from: w[5] === "0.0.0.0/0" ? null : w[5] };
  }
  // A rule as `ufw delete` and its prompt write it: allow from 10.4.0.5 to any port 9000 proto tcp.
  function ruleText(r) {
    if (!r.from) return r.action + " " + r.port + (r.proto === "any" ? "" : "/" + r.proto);
    return r.action + " from " + r.from + (r.port === null ? "" : " to any port " + r.port + (r.proto === "any" ? "" : " proto " + r.proto));
  }
  function inNetwork(addr, cidr) {
    var parts = cidr.split("/");
    var mask = prefixMask(parts[1] === undefined ? 32 : +parts[1]);
    return ((addr & mask) >>> 0) === ((parseIPv4(parts[0]) & mask) >>> 0);
  }

  Shell.prototype.ufwState = function () {
    var conf = this.systemFile("/etc/ufw/ufw.conf", ufwConf(false));
    var rules = this.systemFile("/etc/ufw/user.rules", UFW_INSTALLED);
    return {
      enabled: /^ENABLED=yes\s*$/m.test(conf),
      rules: (rules.match(/^### tuple ### .*$/gm) || []).map(function (l) { return parseTuple(l.slice(14)); }),
    };
  };
  // ufw runs as root and writes its files whatever their mode.
  Shell.prototype.ufwWrite = function (path, text, mode) {
    var sh = this;
    ["/etc", "/etc/ufw"].forEach(function (d) {
      if (!sh.fs[d]) sh.fs[d] = { type: "dir", mode: 0o755, owner: "root", group: "root", contents: "", mtime: sh.now() };
    });
    var node = this.fs[path];
    if (!node) node = this.fs[path] = { type: "file", mode: mode, owner: "root", group: "root", contents: "" };
    node.contents = text;
    node.mtime = this.now();
  };
  Shell.prototype.ufwSave = function (state) {
    var tuples = state.rules.map(ruleTuple);
    this.ufwWrite("/etc/ufw/ufw.conf", ufwConf(state.enabled), 0o644);
    this.ufwWrite("/etc/ufw/user.rules", ufwRules(tuples), 0o640);
    this.ufwWrite("/etc/ufw/user6.rules", ufwRules(tuples, true), 0o640);
  };
  // Does the firewall let a connection from `src` in to `port`/`proto`?
  Shell.prototype.firewallLets = function (src, port, proto) {
    var st = this.ufwState();
    if (!st.enabled) return true;
    for (var i = 0; i < st.rules.length; i++) {
      var r = st.rules[i];
      if ((r.proto === "any" || r.proto === proto) && (r.port === null || r.port === port) && (!r.from || inNetwork(src, r.from))) return r.action === "allow";
    }
    return false;
  };

  var UFW_USAGE = "Usage: ufw COMMAND\n\nCommands:\n enable                          enables the firewall\n disable                         disables the firewall\n" +
    " default ARG                     set default policy\n logging LEVEL                   set logging to LEVEL\n allow ARGS                      add allow rule\n" +
    " deny ARGS                       add deny rule\n reject ARGS                     add reject rule\n limit ARGS                      add limit rule\n" +
    " delete RULE|NUM                 delete RULE\n insert NUM RULE                 insert RULE at NUM\n prepend RULE                    prepend RULE\n" +
    " route RULE                      add route RULE\n route delete RULE|NUM           delete route RULE\n route insert NUM RULE           insert route RULE at NUM\n" +
    " reload                          reload firewall\n reset                           reset firewall\n status                          show firewall status\n" +
    " status numbered                 show firewall status as numbered list of RULES\n status verbose                  show verbose firewall status\n" +
    " show ARG                        show firewall report\n version                         display version information\n\n" +
    "Application profile commands:\n app list                        list application profiles\n app info PROFILE                show information on PROFILE\n" +
    " app update PROFILE              update PROFILE\n app default ARG                 set default application policy\n\n";

  // The words after allow/deny: PORT[/PROTO], or from ADDR [to any port PORT [proto PROTO]].
  function parseUfwRule(action, words) {
    var r = { action: action, port: null, proto: "any", from: null };
    if (!words.length) return { error: "ERROR: Invalid syntax\n\n" + UFW_USAGE };
    if (words[0] !== "from") {
      if (words.length > 1) throw new Error("this console's ufw takes PORT[/PROTO] or from ADDR [to any port PORT [proto PROTO]]");
      var m = /^(\d+)(?:\/(tcp|udp))?$/.exec(words[0]);
      if (!m) return { error: /^\d/.test(words[0]) ? "ERROR: Bad port\n" : "ERROR: Could not find a profile matching '" + words[0] + "'\n" };
      if (+m[1] < 1 || +m[1] > 65535) return { error: "ERROR: Bad port\n" };
      r.port = +m[1];
      r.proto = m[2] || "any";
      return { rule: r };
    }
    var src = words[1];
    if (src === undefined) return { error: "ERROR: Invalid syntax\n\n" + UFW_USAGE };
    var cm = /^(\d+\.\d+\.\d+\.\d+)(?:\/(\d+))?$/.exec(src);
    if (src !== "any" && (!cm || parseIPv4(cm[1]) === null || (cm[2] !== undefined && +cm[2] > 32))) return { error: "ERROR: Bad source address\n" };
    r.from = src === "any" ? null : src;
    var rest = words.slice(2);
    if (rest.length) {
      if (rest[0] !== "to" || rest[1] !== "any") throw new Error("this console's ufw only writes rules `to any`: ufw allow from ADDR to any port PORT");
      rest = rest.slice(2);
      if (rest[0] === "port") {
        if (!/^\d+$/.test(rest[1] || "") || +rest[1] < 1 || +rest[1] > 65535) return { error: "ERROR: Bad port\n" };
        r.port = +rest[1];
        rest = rest.slice(2);
      }
      if (rest[0] === "proto") {
        if (rest[1] !== "tcp" && rest[1] !== "udp") return { error: "ERROR: Unsupported protocol '" + (rest[1] || "") + "'\n" };
        if (r.port === null) throw new Error("a protocol needs a port on this console: to any port PORT proto " + rest[1]);
        r.proto = rest[1];
        rest = rest.slice(2);
      }
      if (rest.length) return { error: "ERROR: Invalid syntax\n\n" + UFW_USAGE };
    }
    if (r.from === null && r.port === null) throw new Error("ufw allow from any would let everything in; give a port");
    return { rule: r };
  }
  function sameRule(a, b) { return a.action === b.action && a.port === b.port && a.proto === b.proto && a.from === b.from; }

  // `ufw status`: the rules as ufw lays them out, columns of 27, 12 and 26, IPv4
  // first, then each rule without a source again for IPv6.
  function ufwStatus(st, how) {
    if (!st.enabled) return "Status: inactive\n";
    var rows = [];
    st.rules.forEach(function (r) { rows.push({ r: r, six: false }); });
    st.rules.forEach(function (r) { if (!r.from) rows.push({ r: r, six: true }); });
    var lead = how === "numbered" ? "     " : "";
    var out = "Status: active\n";
    if (how === "verbose") out += "Logging: on (low)\nDefault: deny (incoming), allow (outgoing), deny (routed)\nNew profiles: skip\n";
    if (!rows.length) return out;
    out += "\n" + lead + padRight("To", 27) + padRight("Action", 12) + "From\n" + lead + padRight("--", 27) + padRight("------", 12) + "----\n";
    rows.forEach(function (row, k) {
      var r = row.r, v6 = row.six ? " (v6)" : "";
      var to = (r.port === null ? "Anywhere" : r.port + (r.proto === "any" ? "" : "/" + r.proto)) + v6;
      var action = r.action.toUpperCase() + (how ? " IN" : "");
      var from = (r.from || "Anywhere") + v6;
      var num = how === "numbered" ? "[" + (k + 1 < 10 ? " " : "") + (k + 1) + "] " : "";
      out += num + padRight(to, 27) + padRight(action, 12) + padRight(from, 26) + "\n";
    });
    return out + "\n";
  }

  COMMANDS.ufw = function* (args, stdin, io) {
    if (this.user !== "root") return { out: "", err: "ERROR: You need to be root to run this script\n", code: 1 };
    var st = this.ufwState();
    var verb = args[0];
    var sh = this;
    var out = { err: "" };
    var said = "";
    if (verb === "status") {
      var how = args[1];
      if (how !== undefined && how !== "verbose" && how !== "numbered") return { out: "", err: "ERROR: Invalid syntax\n\n" + UFW_USAGE, code: 1 };
      return ok(ufwStatus(st, how));
    }
    if (verb === "version") return ok("ufw 0.36.2\nCopyright 2008-2023 Canonical Ltd.\n");
    if (verb === "enable" || verb === "disable") {
      if (verb === "enable") {
        // The console's login is over SSH (its shell's parent is sshd), so ufw asks.
        var yes = yield* this.confirm("Command may disrupt existing ssh connections. Proceed with operation (y|n)? ", io, out);
        if (!yes) return { out: "Aborted\n", err: out.err, code: 0 };
      }
      st.enabled = verb === "enable";
      this.ufwSave(st);
      return { out: verb === "enable" ? "Firewall is active and enabled on system startup\n" : "Firewall stopped and disabled on system startup\n", err: out.err, code: 0 };
    }
    if (verb === "allow" || verb === "deny") {
      var parsed = parseUfwRule(verb, args.slice(1));
      if (parsed.error) return { out: "", err: parsed.error, code: 1 };
      var r = parsed.rule;
      var v6 = r.from ? [""] : ["", " (v6)"];
      if (st.rules.some(function (x) { return sameRule(x, r); })) return ok(v6.map(function (s) { return "Skipping adding existing rule" + s + "\n"; }).join(""));
      st.rules.push(r);
      this.ufwSave(st);
      // While ufw is off it only updates the files; while it's on, the rule is live.
      return ok(v6.map(function (s) { return (st.enabled ? "Rule added" : "Rules updated") + s + "\n"; }).join(""));
    }
    if (verb === "delete") {
      var target = args.slice(1);
      if (target.length === 1 && /^\d+$/.test(target[0])) {
        var n = +target[0];
        var listed = st.rules.length + st.rules.filter(function (x) { return !x.from; }).length;
        if (n < 1 || n > listed) return { out: "", err: "ERROR: Could not find rule '" + target[0] + "'\n", code: 1 };
        if (n > st.rules.length) throw new Error("deleting just a (v6) rule isn't supported on this console; delete the rule itself, like ufw delete allow 8080/tcp");
        var rule = st.rules[n - 1];
        if (!(yield* this.confirm("Deleting:\n " + ruleText(rule) + "\nProceed with operation (y|n)? ", io, out))) return { out: "Aborted\n", err: out.err, code: 0 };
        st.rules.splice(n - 1, 1);
        this.ufwSave(st);
        return { out: "Rule deleted\n", err: out.err, code: 0 };
      }
      if (target[0] !== "allow" && target[0] !== "deny") return { out: "", err: "ERROR: Invalid syntax\n\n" + UFW_USAGE, code: 1 };
      var del = parseUfwRule(target[0], target.slice(1));
      if (del.error) return { out: "", err: del.error, code: 1 };
      var suffixes = del.rule.from ? [""] : ["", " (v6)"];
      var at = -1;
      st.rules.forEach(function (x, k) { if (at === -1 && sameRule(x, del.rule)) at = k; });
      if (at === -1) return ok(suffixes.map(function (s) { return "Could not delete non-existent rule" + s + "\n"; }).join(""));
      st.rules.splice(at, 1);
      this.ufwSave(st);
      return ok(suffixes.map(function (s) { return "Rule deleted" + s + "\n"; }).join(""));
    }
    if (["default", "logging", "reject", "limit", "insert", "prepend", "route", "reload", "reset", "show", "app"].indexOf(verb) !== -1) {
      throw new Error("ufw " + verb + " isn't supported on this console; status, enable, disable, allow, deny and delete are");
    }
    said = verb === undefined ? "ERROR: not enough args\n" : "ERROR: Invalid syntax\n\n" + UFW_USAGE;
    return { out: "", err: said, code: 1 };
  };

  // --- connections, from the console or from another host (#166) -----------------------
  // Inside `ssh HOST '…'`, this.origin is that host, and nc, curl and ping see the
  // network from there: the console is just another address, behind its firewall.
  // Where a TCP connection to addr:port gets: {outcome: "open" | "refused" |
  // "timeout" | "noroute" | "unreachable", service, src}. `service` is what
  // answered (a host's ServiceSpec or the console's ListenSpec), for curl.
  Shell.prototype.listener = function (addr, port) {
    return this.sockets().filter(function (s) {
      if (s.proto !== "tcp" || s.state !== "LISTEN" || s.port !== port) return false;
      return s.local === "0.0.0.0" || s.local === "[::]" || parseIPv4(s.local) === addr;
    })[0] || null;
  };
  Shell.prototype.isConsole = function (addr) { return this.net.ifaces.some(function (i) { return i.address === addr; }); };
  function served(host, port) {
    return host.services.filter(function (s) { return s.port === port && (s.proto || "tcp") === "tcp"; })[0] || null;
  }
  Shell.prototype.connect = function (addr, port) {
    var net = this.net, origin = this.origin;
    if (!origin) {
      if (this.isLocal(addr)) {
        var mine = this.listener(addr, port);
        return { outcome: mine ? "open" : "refused", service: mine && mine.spec, src: addr };
      }
      var route = this.route(addr);
      if (route.unreachable) return { outcome: "unreachable" };
      var src = route.iface.address;
      var host = route.host;
      if (!host || !host.up) return { outcome: route.via === null ? "noroute" : "timeout", src: src };
      var svc = served(host, port);
      if (svc) return { outcome: "open", service: svc, host: host, src: src };
      return { outcome: host.filtered.indexOf(port) !== -1 ? "timeout" : "refused", host: host, src: src };
    }
    if (addr === origin.address || addr >>> 24 === 127) {
      var own = served(origin, port);
      return { outcome: own ? "open" : "refused", service: own, host: origin, src: addr };
    }
    if (this.isConsole(addr)) {
      if (!this.firewallLets(origin.address, port, "tcp")) return { outcome: "timeout", src: origin.address };
      var l = this.listener(addr, port);
      return { outcome: l ? "open" : "refused", service: l && l.spec, src: origin.address };
    }
    var other = net.hosts.filter(function (h) { return h.address === addr; })[0];
    if (!other || !other.up) return { outcome: "timeout", src: origin.address };
    var theirs = served(other, port);
    if (theirs) return { outcome: "open", service: theirs, host: other, src: origin.address };
    return { outcome: other.filtered.indexOf(port) !== -1 ? "timeout" : "refused", host: other, src: origin.address };
  };

  // --- curl -----------------------------------------------------------------------------
  // HTTP to the station's services: a host's service (or one of the console's
  // own listeners) with `http` routes answers them; any other path is that
  // server's 404. What it prints is curl 8.5.0's, checked against Ubuntu
  // 24.04's curl talking to a small test server, with no progress meter (the
  // console's output always counts as a terminal).
  var REASONS = { 200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 303: "See Other",
    304: "Not Modified", 307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 418: "I'm a teapot", 422: "Unprocessable Entity", 429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };
  var CURL_TLS = ["* ALPN: curl offers h2,http/1.1", "* TLSv1.3 (OUT), TLS handshake, Client hello (1):", "*  CAfile: /etc/ssl/certs/ca-certificates.crt",
    "*  CApath: /etc/ssl/certs", "* TLSv1.3 (IN), TLS handshake, Server hello (2):", "* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):",
    "* TLSv1.3 (IN), TLS handshake, Certificate (11):"];
  var CURL_TLS_DONE = ["* TLSv1.3 (IN), TLS handshake, CERT verify (15):", "* TLSv1.3 (IN), TLS handshake, Finished (20):",
    "* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):", "* TLSv1.3 (OUT), TLS handshake, Finished (20):",
    "* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / X25519 / id-ecPublicKey", "* ALPN: server accepted http/1.1"];
  var CURL_60 = "\ncurl failed to verify the legitimacy of the server and therefore could not\nestablish a secure connection to it. To learn more about this situation and\nhow to fix it, please visit the web page mentioned above.\n";

  function parseUrl(text) {
    var m = /^(?:([a-zA-Z][a-zA-Z0-9+.-]*):\/\/)?([^\/:?#\s@]+)(?::(\d+))?(\/[^?#\s]*)?(\?[^#\s]*)?(?:#\S*)?$/.exec(text || "");
    if (!m) return null;
    var scheme = (m[1] || "http").toLowerCase();
    return { scheme: scheme, host: m[2].toLowerCase(), port: m[3] ? +m[3] : scheme === "https" ? 443 : 80, explicit: !!m[3], path: m[4] || "/", query: m[5] || "" };
  }
  function urlText(u) {
    var dflt = u.scheme === "https" ? 443 : 80;
    return u.scheme + "://" + u.host + (u.port !== dflt ? ":" + u.port : "") + u.path + u.query;
  }
  function httpDate(d) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return DAYS[d.getDay()] + ", " + pad(d.getDate()) + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + " GMT";
  }
  // What a service answers to METHOD PATH: {status, headers: [[name, value]], body}, or null for no HTTP at all.
  function httpAnswer(service, method, path) {
    if (!service || !service.http) return null;
    var want = method === "HEAD" ? "GET" : method;
    var routes = service.http;
    var route = routes.filter(function (r) { return r.path === path && (r.method || "GET") === want; })[0];
    if (!route) {
      var other = routes.filter(function (r) { return r.path === path; });
      if (other.length) return { status: 405, headers: [["Allow", other.map(function (r) { return r.method || "GET"; }).join(", ")], ["Content-Type", "text/plain"]], body: "Method Not Allowed\n" };
      return { status: 404, headers: [["Content-Type", "text/plain"]], body: "Not Found\n" };
    }
    var headers = Object.keys(route.headers || {}).map(function (k) { return [k, route.headers[k]]; });
    var body = route.body || "";
    if (!headers.some(function (h) { return h[0].toLowerCase() === "content-length"; })) headers.push(["Content-Length", String(new TextEncoder().encode(body).length)]);
    return { status: route.status || 200, headers: headers, body: body };
  }

  var CURL_FLAGS = { v: "verbose", s: "silent", S: "show-error", I: "head", i: "include", L: "location", k: "insecure", f: "fail" };
  var CURL_VALUED = { o: "output", H: "header", X: "request", d: "data", w: "write-out", m: "max-time", A: "user-agent" };
  var CURL_LONG = ["verbose", "silent", "show-error", "head", "include", "location", "insecure", "fail", "output", "header", "request", "data", "data-raw",
    "write-out", "max-time", "connect-timeout", "user-agent"];

  function parseCurl(args) {
    var o = { header: [], data: [], urls: [] };
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a.slice(0, 2) === "--") {
        var eq = a.indexOf("=");
        var name = eq === -1 ? a.slice(2) : a.slice(2, eq);
        if (CURL_LONG.indexOf(name) === -1) throw new Error("option " + a + " isn't supported on this console; try curl --help");
        var takes = ["output", "header", "request", "data", "data-raw", "write-out", "max-time", "connect-timeout", "user-agent"].indexOf(name) !== -1;
        if (!takes) { o[name] = true; continue; }
        var v = eq === -1 ? args[++i] : a.slice(eq + 1);
        if (v === undefined) return { error: "curl: option " + a + ": requires parameter\ncurl: try 'curl --help' or 'curl --manual' for more information\n", code: 2 };
        if (name === "data-raw") name = "data";
        if (name === "header" || name === "data") o[name].push(v); else o[name] = v;
      } else if (a[0] === "-" && a.length > 1) {
        for (var j = 1; j < a.length; j++) {
          var c = a[j];
          if (CURL_FLAGS[c]) { o[CURL_FLAGS[c]] = true; continue; }
          if (CURL_VALUED[c]) {
            var val = a.slice(j + 1) || args[++i];
            if (val === undefined) return { error: "curl: option -" + c + ": requires parameter\ncurl: try 'curl --help' or 'curl --manual' for more information\n", code: 2 };
            var key = CURL_VALUED[c];
            if (key === "header" || key === "data") o[key].push(val); else o[key] = val;
            break;
          }
          throw new Error("option -" + c + " isn't supported on this console; try curl --help");
        }
      } else o.urls.push(a);
    }
    return { opts: o };
  }

  COMMANDS.curl = function (args, stdin, io) {
    var p = parseCurl(args);
    if (p.error) return { out: "", err: p.error, code: p.code };
    var o = p.opts;
    if (!o.urls.length) return { out: "", err: "curl: try 'curl --help' or 'curl --manual' for more information\n", code: 2 };
    if (o.urls.length > 1) throw new Error("one URL at a time on this console");
    var sh = this;
    var say = function (text) { if (o.verbose) io.err.write(text); };
    var fail = function (code, msg) {
      if (!o.silent || o["show-error"]) io.err.write("curl: (" + code + ") " + msg + "\n" + (code === 60 ? "More details here: https://curl.se/docs/sslcerts.html\n" + CURL_60 : ""));
      return code;
    };
    var url = parseUrl(o.urls[0]);
    if (!url) return { out: "", err: o.silent && !o["show-error"] ? "" : "curl: (3) URL rejected: Malformed input to a URL function\n", code: 3 };
    if (url.scheme !== "http" && url.scheme !== "https") return { out: "", err: o.silent && !o["show-error"] ? "" : 'curl: (1) Protocol "' + url.scheme + '" not supported\n', code: 1 };
    var method = o.request || (o.head ? "HEAD" : o.data.length ? "POST" : "GET");
    if (o.verbose && o.request === "POST" && o.data.length) io.err.write("Note: Unnecessary use of -X or --request, POST is already inferred.\n");
    var connectLimit = o["connect-timeout"] !== undefined ? parseFloat(o["connect-timeout"]) : null;
    var maxTime = o["max-time"] !== undefined ? parseFloat(o["max-time"]) : null;
    if ((connectLimit !== null && isNaN(connectLimit)) || (maxTime !== null && isNaN(maxTime))) return { out: "", err: "curl: option: expected a proper numerical parameter\n", code: 2 };
    var body = o.data.join("&");
    var redirects = 0, last = null, remote = "", code = 0, contentType = "";
    var written = "";
    for (;;) {
      var hostShown = url.host + ":" + url.port;
      var found = parseIPv4(url.host) !== null ? { address: parseIPv4(url.host), numeric: true } : this.resolveName(url.host);
      if (found.error) { code = fail(6, "Could not resolve host: " + url.host); say("* Closing connection\n"); break; }
      var addr = found.address, shown = formatIPv4(addr);
      remote = shown;
      if (!found.numeric) say("* Host " + hostShown + " was resolved.\n* IPv6: (none)\n* IPv4: " + shown + "\n");
      say("*   Trying " + shown + ":" + url.port + "...\n");
      var c = this.connect(addr, url.port);
      var limit = connectLimit !== null && maxTime !== null ? Math.min(connectLimit, maxTime) : connectLimit !== null ? connectLimit : maxTime;
      if (c.outcome !== "open") {
        var after;
        if (c.outcome === "timeout") {
          if (limit !== null) {
            this.clock += Math.ceil(limit);
            var ms = Math.round(limit * 1000);
            if (limit === maxTime && (connectLimit === null || maxTime <= connectLimit)) {
              say("* Connection timed out after " + (ms + 4) + " milliseconds\n* Closing connection\n");
              code = fail(28, "Connection timed out after " + (ms + 4) + " milliseconds");
            } else {
              say("* ipv4 connect timeout after " + (ms - 1) + "ms, move on!\n* Failed to connect to " + url.host + " port " + url.port + " after " + (ms + 2) + " ms: Timeout was reached\n* Closing connection\n");
              code = fail(28, "Failed to connect to " + url.host + " port " + url.port + " after " + (ms + 2) + " ms: Timeout was reached");
            }
            break;
          }
          // No limit: the kernel gives up on its SYN retries, as nc's does.
          this.clock += 134;
          after = 134000 + (addr % 997);
          say("* connect to " + shown + " port " + url.port + " from " + formatIPv4(c.src) + " port " + (40000 + addr % 20000) + " failed: Connection timed out\n");
        } else if (c.outcome === "refused") {
          after = 0;
          say("* connect to " + shown + " port " + url.port + " from " + formatIPv4(c.src) + " port " + (40000 + addr % 20000) + " failed: Connection refused\n");
        } else if (c.outcome === "noroute") {
          this.clock += 3;
          after = 3069;
          say("* connect to " + shown + " port " + url.port + " from " + formatIPv4(c.src) + " port " + (40000 + addr % 20000) + " failed: No route to host\n");
        } else {
          after = 0;
          say("* Immediate connect fail for " + shown + ": Network is unreachable\n");
        }
        say("* Failed to connect to " + url.host + " port " + url.port + " after " + after + " ms: Couldn't connect to server\n* Closing connection\n");
        code = fail(c.outcome === "timeout" ? 28 : 7, "Failed to connect to " + url.host + " port " + url.port + " after " + after + " ms: Couldn't connect to server");
        break;
      }
      say("* Connected to " + url.host + " (" + shown + ") port " + url.port + "\n");
      var svc = c.service;
      if (url.scheme === "https") {
        if (!svc || !svc.tls) {
          say(CURL_TLS.slice(0, 4).join("\n") + "\n* OpenSSL/3.0.13: error:0A00010B:SSL routines::wrong version number\n* Closing connection\n");
          code = fail(35, "OpenSSL/3.0.13: error:0A00010B:SSL routines::wrong version number");
          break;
        }
        say(CURL_TLS.join("\n") + "\n");
        var named = parseIPv4(url.host) === null;
        if (!named && !o.insecure) {
          say(CURL_TLS_DONE.join("\n") + "\n* SSL: no alternative certificate subject name matches target host name '" + url.host + "'\n* Closing connection\n");
          code = fail(60, "SSL: no alternative certificate subject name matches target host name '" + url.host + "'");
          break;
        }
        if (svc.tls === "expired" && !o.insecure) {
          say("* TLSv1.3 (OUT), TLS alert, certificate expired (557):\n* SSL certificate problem: certificate has expired\n* Closing connection\n");
          code = fail(60, "SSL certificate problem: certificate has expired");
          break;
        }
        var expired = svc.tls === "expired";
        say(CURL_TLS_DONE.join("\n") + "\n* Server certificate:\n*  subject: CN=" + url.host + "\n" +
          "*  start date: " + (expired ? "Jun 30 09:00:00 2026 GMT" : "Sep 21 09:00:00 2026 GMT") + "\n" +
          "*  expire date: " + (expired ? "Sep 28 09:00:00 2026 GMT" : "Dec 20 09:00:00 2026 GMT") + "\n" +
          '*  subjectAltName: host "' + url.host + '" matched cert\'s "' + url.host + '"\n' +
          "*  issuer: C=US; O=Meridian Station; CN=Meridian Station CA\n" +
          (expired ? "*  SSL certificate verify result: certificate has expired (10), continuing anyway.\n" : "*  SSL certificate verify ok.\n") + "* using HTTP/1.x\n");
      }
      // The request.
      var reqHeaders = [["Host", url.host + (url.explicit && url.port !== (url.scheme === "https" ? 443 : 80) ? ":" + url.port : "")],
        ["User-Agent", o["user-agent"] || "curl/8.5.0"], ["Accept", "*/*"]];
      o.header.forEach(function (h) {
        var at = h.indexOf(":");
        if (at === -1) return;
        var name = h.slice(0, at).trim(), value = h.slice(at + 1).trim();
        var same = reqHeaders.filter(function (x) { return x[0].toLowerCase() === name.toLowerCase(); })[0];
        if (same) same[1] = value; else reqHeaders.push([name, value]);
      });
      if (body && method !== "GET" && method !== "HEAD") {
        if (!reqHeaders.some(function (x) { return x[0].toLowerCase() === "content-type"; })) reqHeaders.push(["Content-Type", "application/x-www-form-urlencoded"]);
        reqHeaders.push(["Content-Length", String(new TextEncoder().encode(body).length)]);
      }
      say("> " + method + " " + url.path + url.query + " HTTP/1.1\n" + reqHeaders.map(function (h) { return "> " + h[0] + ": " + h[1] + "\n"; }).join("") + "> \n");
      var answer = httpAnswer(svc, method, url.path);
      if (!answer) {
        say("* Empty reply from server\n* Closing connection\n");
        code = fail(52, "Empty reply from server");
        break;
      }
      last = answer;
      contentType = (answer.headers.filter(function (h) { return h[0].toLowerCase() === "content-type"; })[0] || ["", ""])[1];
      var statusLine = "HTTP/1.1 " + answer.status + " " + (REASONS[answer.status] || "");
      var headerBlock = statusLine + "\n" + answer.headers.map(function (h) { return h[0] + ": " + h[1] + "\n"; }).join("") + "\n";
      say(headerBlock.split("\n").slice(0, -1).map(function (l) { return "< " + l + "\n"; }).join(""));
      var location = (answer.headers.filter(function (h) { return h[0].toLowerCase() === "location"; })[0] || [])[1];
      var redirect = o.location && location && [301, 302, 303, 307, 308].indexOf(answer.status) !== -1;
      if (o.fail && answer.status >= 400) {
        say("* The requested URL returned error: " + answer.status + "\n* Closing connection\n");
        code = fail(22, "The requested URL returned error: " + answer.status);
        break;
      }
      say("* Connection #0 to host " + url.host + " left intact\n");
      var shownHeaders = o.head || o.include;
      var chunk = (shownHeaders ? headerBlock : "") + (method === "HEAD" || redirect ? "" : answer.body);
      if (redirect && o.head) chunk = headerBlock;
      written += chunk;
      if (!redirect) break;
      if (++redirects > 50) { code = fail(47, "Maximum (50) redirects followed"); break; }
      var next = parseUrl(location);
      if (location[0] === "/") next = { scheme: url.scheme, host: url.host, port: url.port, explicit: url.explicit, path: location.split("?")[0], query: location.indexOf("?") === -1 ? "" : location.slice(location.indexOf("?")) };
      if (!next) { code = fail(3, "URL rejected: Malformed input to a URL function"); break; }
      say("* Issue another request to this URL: '" + urlText(next) + "'\n");
      if ([301, 302, 303].indexOf(answer.status) !== -1 && method === "POST") { method = "GET"; body = ""; }
      url = next;
    }
    // The body, to the screen or a file.
    if (written) {
      if (o.output) {
        var why = this.writeFile(o.output, written, false);
        if (why) {
          io.err.write("Warning: Failed to open the file " + o.output + ": " + why.replace(o.output + ": ", "") + "\n");
          code = fail(23, "Failure writing output to destination");
        }
      } else io.out.write(written);
    }
    if (o["write-out"] !== undefined) {
      var vars = { http_code: last ? String(last.status) : "000", url_effective: urlText(url), remote_ip: remote, num_redirects: String(redirects),
        content_type: contentType, method: method, response_code: last ? String(last.status) : "0" };
      io.out.write(o["write-out"].replace(/%\{(\w+)\}/g, function (m, k) { return k in vars ? vars[k] : ""; })
        .replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r"));
    }
    this.reap();
    return { out: "", err: "", code: code };
  };

  // --- ssh HOST 'COMMAND': from another machine ------------------------------------------
  // Real ssh, but only for one command on a host the exercise lets you log in
  // to (`login: true`, your key already there), so a task can see the console
  // from outside: through its firewall, at its real address.

  COMMANDS.ssh = function* (args, stdin, io) {
    if (this.origin) throw new Error("this console doesn't go another hop: run ssh from the console itself");
    var user = this.user, target = null, rest = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (target === null && a[0] === "-") {
        if (a === "-o" || a === "-i" || a === "-p" || a === "-l") {
          var v = args[++i];
          if (a === "-l") user = v;
          if (a === "-p" && v !== "22") throw new Error("the station's hosts all run sshd on 22; leave -p out");
          continue;
        }
        if (/^-[qT]+$/.test(a)) continue;
        throw new Error(a + " isn't supported on this console; ssh HOST 'COMMAND' is");
      }
      if (target === null) target = a; else rest.push(a);
    }
    if (target === null) return { out: "", err: "usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] [-b bind_address]\n           [-c cipher_spec] [-D [bind_address:]port] [-E log_file]\n           [-e escape_char] [-F configfile] [-I pkcs11] [-i identity_file]\n           [-J destination] [-L address] [-l login_name] [-m mac_spec]\n           [-O ctl_cmd] [-o option] [-P tag] [-p port] [-R address]\n           [-S ctl_path] [-W host:port] [-w local_tun[:remote_tun]]\n           destination [command [argument ...]]\n", code: 255 };
    if (target.indexOf("@") !== -1) { user = target.slice(0, target.indexOf("@")); target = target.slice(target.indexOf("@") + 1); }
    if (!rest.length) throw new Error("this console runs one command on another machine: ssh " + target + " 'COMMAND'");
    var found = this.resolveName(target);
    if (found.error) return { out: "", err: "ssh: Could not resolve hostname " + target + ": " + found.error + "\n", code: 255 };
    var c = this.connect(found.address, 22);
    var fail = { refused: "Connection refused", timeout: "Connection timed out", noroute: "No route to host", unreachable: "Network is unreachable" }[c.outcome];
    if (fail) {
      if (c.outcome === "timeout") this.clock += 134;
      if (c.outcome === "noroute") this.clock += 3;
      this.reap();
      return { out: "", err: "ssh: connect to host " + target + " port 22: " + fail + "\n", code: 255 };
    }
    var host = c.host;
    if (!host || !host.login) return { out: "", err: user + "@" + target + ": Permission denied (publickey).\n", code: 255 };
    this.origin = host;
    try {
      return yield* this.child(rest.join(" "), "bash", [], io);
    } finally {
      this.origin = null;
    }
  };

  Object.assign(S, { netFlags: netFlags, rttFor: rttFor });
});
