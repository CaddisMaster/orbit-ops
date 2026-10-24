// The station console's shell, part 1 of 12 (#255): what every other part
// shares. The station's clock, paths, the output sink, the helpers commands
// use (flags, lines, modes, sizes), and the network's addresses and defaults.
// Pure: no Shell here.
//
// The parts share one namespace, S (OrbitShellParts in the browser). Each part
// takes what it needs from S at load and adds what others need at its end, so
// a part may use only the parts before it. The order is shell.js's PARTS.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../manual.js"));
  else root.OrbitShellParts = factory(root.OrbitManual);
})(typeof self !== "undefined" ? self : this, function (MANUAL) {
  "use strict";

  var S = { MANUAL: MANUAL };

  var UMASK = 0o002;
  var KiB = 1024, MiB = 1024 * 1024, GiB = 1024 * 1024 * 1024;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // The station's "now" when the console starts (#67): files are dated from it
  // and it moves on with the console's clock, so find -mtime and the server's
  // age checks (app/terminal.py STATION_NOW) agree whatever today's date is.
  var START_TIME = new Date(2026, 9, 8, 9, 0);
  // "2026-09-20T14:30:00", local time, as the exercise and the server write them.
  function parseStamp(text) {
    var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?$/.exec(text || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : START_TIME;
  }
  function isoStamp(d) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  // --- paths -----------------------------------------------------------------
  function normalize(path) {
    var out = [];
    path.split("/").forEach(function (part) {
      if (part === "" || part === ".") return;
      if (part === "..") out.pop();
      else out.push(part);
    });
    return "/" + out.join("/");
  }
  function parentOf(path) {
    var i = path.lastIndexOf("/");
    return i <= 0 ? "/" : path.slice(0, i);
  }
  function baseName(path) {
    return path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
  }
  function join(dir, name) {
    return dir === "/" ? "/" + name : dir + "/" + name;
  }

  // --- output -------------------------------------------------------------------
  // Output goes to sinks: the terminal, a pipe, a file, or $(…)'s capture.
  // Commands still return {out, err, code}; scripts and compound commands
  // write as they go, so a prompt in the middle of a script follows what it
  // has already printed.
  function Sink() { this.text = ""; }
  Sink.prototype.write = function (s) { this.text += s; };

  // --- helpers for commands ---------------------------------------------------------
  // Split "-la" style flags from operands. `allowed` lists the letters; a flag
  // taking a value (like -n 5) is listed in `valued`.
  function flags(cmd, args, allowed, valued) {
    var opts = {};
    var rest = [];
    valued = valued || "";
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === "--") { rest = rest.concat(args.slice(i + 1)); break; }
      if (a.length > 1 && a[0] === "-" && !/^-\d+$/.test(a)) {
        for (var j = 1; j < a.length; j++) {
          var f = a[j];
          if (valued.indexOf(f) !== -1) {
            var v = a.slice(j + 1) || args[++i];
            if (v === undefined) throw new Error("option requires an argument -- '" + f + "'");
            opts[f] = v;
            break;
          }
          if (allowed.indexOf(f) === -1) throw new Error("invalid option -- '" + f + "'");
          opts[f] = true;
        }
      } else rest.push(a);
    }
    return { opts: opts, args: rest };
  }

  function ok(out) { return { out: out || "", err: "", code: 0 }; }
  function lines(text) {
    if (text === "") return [];
    var ls = text.split("\n");
    if (ls[ls.length - 1] === "") ls.pop();
    return ls;
  }
  function unlines(ls) { return ls.length ? ls.join("\n") + "\n" : ""; }
  function compareNames(a, b) {
    var ka = a.replace(/^\.+/, "").toLowerCase();
    var kb = b.replace(/^\.+/, "").toLowerCase();
    return ka < kb ? -1 : ka > kb ? 1 : a < b ? -1 : a > b ? 1 : 0;
  }
  function modeString(node) {
    var s = node.type === "dir" ? "d" : node.type === "link" ? "l" : "-";
    var chars = "rwxrwxrwx";
    for (var i = 0; i < 9; i++) s += node.mode & (1 << (8 - i)) ? chars[i] : "-";
    if (node.mode & 0o1000) s = s.slice(0, 9) + (node.mode & 1 ? "t" : "T"); // sticky, like /tmp's
    return s;
  }
  // A file's size: what the exercise says (a big log is sampled), or its contents.
  function size(node) {
    if (node.type === "dir") return 4096;
    if (node.type === "link") return node.target.length;
    return node.size !== undefined ? node.size : new TextEncoder().encode(node.contents).length;
  }
  // What it takes on disk: whole 4K blocks (a link takes none), as du counts.
  function usage(node) {
    if (node.type === "link") return 0;
    return Math.ceil(size(node) / 4096) * 4096;
  }
  function human(n) {
    if (n < 1024) return String(n);
    var units = ["K", "M", "G"];
    var v = n;
    for (var i = 0; i < units.length; i++) {
      v /= 1024;
      if (v < 1024 || i === units.length - 1) return v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) + units[i] : Math.ceil(v) + units[i];
    }
  }
  // ls's date: the time for the last six months, the year before that.
  function stamp(d, now) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var day = d.getDate();
    var old = now && (now - d > 182.5 * 86400000 || d - now > 3600000);
    return MONTHS[d.getMonth()] + " " + (day < 10 ? " " : "") + day + " " + (old ? " " + d.getFullYear() : pad(d.getHours()) + ":" + pad(d.getMinutes()));
  }
  function padLeft(s, n) { s = String(s); while (s.length < n) s = " " + s; return s; }
  function padRight(s, n) { s = String(s); while (s.length < n) s += " "; return s; }

  // Apply a chmod mode ("600", "u+x,go-w", "a=r") to a mode number.
  function applyMode(spec, mode) {
    if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
    var result = mode;
    spec.split(",").forEach(function (clause) {
      var m = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(clause);
      if (!m) throw new Error("invalid mode: '" + spec + "'");
      var who = m[1] || "a";
      if (who.indexOf("a") !== -1) who = "ugo";
      var bits = (m[3].indexOf("r") !== -1 ? 4 : 0) | (m[3].indexOf("w") !== -1 ? 2 : 0) | (m[3].indexOf("x") !== -1 ? 1 : 0);
      who.split("").forEach(function (w) {
        var shift = w === "u" ? 6 : w === "g" ? 3 : 0;
        if (m[2] === "+") result |= bits << shift;
        else if (m[2] === "-") result &= ~(bits << shift);
        else result = (result & ~(7 << shift)) | (bits << shift);
      });
    });
    return result;
  }

  // Read each operand (or stdin when there are none) for a text filter.
  function inputs(sh, cmd, args, stdin) {
    if (!args.length || (args.length === 1 && args[0] === "-")) {
      if (sh.reading) sh.reading.used = true;
      return { texts: [{ name: "", text: stdin }], err: "" };
    }
    var texts = [];
    var err = "";
    args.forEach(function (a) {
      var r = sh.readFile(cmd, a);
      if (r.error) err += r.error + "\n";
      else texts.push({ name: a, text: r.text });
    });
    return { texts: texts, err: err };
  }

  // --- the station network (#164) -------------------------------------------------------
  // The console's interfaces, its own sockets and the other hosts come from the
  // exercise's `network:` (app/content/schema/terminal/network.py NetworkSpec). Nothing real is
  // touched: ip, ss, ping and nc read this, and print what Ubuntu 24.04's do
  // (iproute2 6.1, iputils 20240117, OpenBSD netcat 1.226), checked against
  // the real ones. DEFAULT_NETWORK is NetworkSpec's defaults; a test keeps
  // them equal.
  var DEFAULT_NETWORK = {"interfaces": [{"name": "eth0", "address": "10.4.0.12/24"}], "gateway": "10.4.0.1", "listening": [], "connections": [], "hosts": [], "dns": {"server": null, "records": []}, "firewall": {"enabled": false, "rules": []}};
  var HOSTNAME_ADDRESS = "127.0.1.1"; // the console's own name, as Ubuntu's /etc/hosts has it

  // Port names, as /etc/services on Ubuntu 24.04 has them (ss without -n, nc's [tcp/NAME]).
  var SERVICES = {
    tcp: "1 tcpmux 7 echo 9 discard 11 systat 13 daytime 15 netstat 17 qotd 19 chargen 20 ftp-data 21 ftp 22 ssh 23 telnet 25 smtp 37 time 43 whois 49 tacacs 53 domain 70 gopher 79 finger 80 http 88 kerberos 102 iso-tsap 104 acr-nema 110 pop3 111 sunrpc 113 auth 119 nntp 135 epmap 139 netbios-ssn 143 imap2 161 snmp 162 snmp-trap 163 cmip-man 164 cmip-agent 174 mailq 179 bgp 199 smux 209 qmtp 210 z3950 345 pawserv 346 zserv 369 rpc2portmap 370 codaauth2 389 ldap 427 svrloc 443 https 444 snpp 445 microsoft-ds 464 kpasswd 465 submissions 487 saft 554 rtsp 607 nqs 628 qmqp 631 ipp 646 ldp 512 exec 513 login 514 shell 515 printer 538 gdomap 540 uucp 543 klogin 544 kshell 548 afpovertcp 563 nntps 587 submission 636 ldaps 655 tinc 706 silc 749 kerberos-adm 853 domain-s 873 rsync 989 ftps-data 990 ftps 992 telnets 993 imaps 995 pop3s 1080 socks 1093 proofd 1094 rootd 1194 openvpn 1099 rmiregistry 1352 lotusnote 1433 ms-sql-s 1524 ingreslock 1645 datametrics 1646 sa-msg-port 1649 kermit 1677 groupwise 1812 radius 1813 radius-acct 2000 cisco-sccp 2049 nfs 2086 gnunet 2101 rtcm-sc104 2119 gsigatekeeper 2135 gris 2401 cvspserver 2430 venus 2431 venus-se 2432 codasrv 2433 codasrv-se 2583 mon 2628 dict 2792 f5-globalsite 2811 gsiftp 2947 gpsd 3050 gds-db 3205 isns 3260 iscsi-target 3306 mysql 3389 ms-wbt-server 3493 nut 3632 distcc 3689 daap 3690 svn 4031 suucp 4094 sysrqd 4190 sieve 4369 epmd 4373 remctl 4353 f5-iquery 4460 ntske 4691 mtn 4899 radmin-port 5060 sip 5061 sip-tls 5222 xmpp-client 5269 xmpp-server 5308 cfengine 5432 postgresql 5556 freeciv 5671 amqps 5672 amqp 6000 x11 6001 x11-1 6002 x11-2 6003 x11-3 6004 x11-4 6005 x11-5 6006 x11-6 6007 x11-7 6346 gnutella-svc 6347 gnutella-rtr 6379 redis 6444 sge-qmaster 6445 sge-execd 6446 mysql-proxy 6697 ircs-u 7000 bbs 7100 font-service 8080 http-alt 8140 puppet 9101 bacula-dir 9102 bacula-fd 9103 bacula-sd 9667 xmms2 10809 nbd 10050 zabbix-agent 10051 zabbix-trapper 10080 amanda 11112 dicom 11371 hkp 17500 db-lsp 22125 dcap 22128 gsidcap 22273 wnn6 750 kerberos4 751 kerberos-master 754 krb-prop 2121 iprop 871 supfilesrv 1127 supfiledbg 106 poppassd 775 moira-db 777 moira-update 783 spamd 1178 skkserv 1236 rmtcfg 1313 xtel 1314 xtelw 2600 zebrasrv 2601 zebra 2602 ripd 2603 ripngd 2604 ospfd 2605 bgpd 2606 ospf6d 2607 ospfapi 2608 isisd 4557 fax 4559 hylafax 4949 munin 5666 nrpe 5667 nsca 5680 canna 6514 syslog-tls 6566 sane-port 6667 ircd 8021 zope-ftp 8081 tproxy 8088 omniorb 8990 clc-build-daemon 9098 xinetd 9418 git 9673 zope 10000 webmin 10081 kamanda 10082 amandaidx 10083 amidxtape 17004 sgi-cad 24554 binkp 27374 asp 30865 csync2 57000 dircproxy 60177 tfido 60179 fido",
    udp: "7 echo 9 discard 13 daytime 19 chargen 21 fsp 37 time 49 tacacs 53 domain 67 bootps 68 bootpc 69 tftp 88 kerberos 111 sunrpc 123 ntp 137 netbios-ns 138 netbios-dgm 161 snmp 162 snmp-trap 163 cmip-man 164 cmip-agent 177 xdmcp 213 ipx 319 ptp-event 320 ptp-general 369 rpc2portmap 370 codaauth2 371 clearcase 389 ldap 427 svrloc 443 https 464 kpasswd 500 isakmp 554 rtsp 623 asf-rmcp 646 ldp 512 biff 513 who 514 syslog 517 talk 518 ntalk 520 route 538 gdomap 546 dhcpv6-client 547 dhcpv6-server 636 ldaps 655 tinc 853 domain-s 1194 openvpn 1434 ms-sql-m 1645 datametrics 1646 sa-msg-port 1701 l2f 1812 radius 1813 radius-acct 2049 nfs 2086 gnunet 2101 rtcm-sc104 2430 venus 2431 venus-se 2432 codasrv 2433 codasrv-se 2583 mon 3130 icpv2 3205 isns 3493 nut 4500 ipsec-nat-t 4569 iax 5060 sip 5061 sip-tls 5353 mdns 6346 gnutella-svc 6347 gnutella-rtr 6696 babel 7000 afs3-fileserver 7001 afs3-callback 7002 afs3-prserver 7003 afs3-vlserver 7004 afs3-kaserver 7005 afs3-volser 7007 afs3-bos 7008 afs3-update 7009 afs3-rmtsys 750 kerberos4 751 kerberos-master 752 passwd-server 2102 zephyr-srv 2103 zephyr-clt 2104 zephyr-hm 779 moira-ureg 1210 predict 5555 rplay 17001 sgi-cmsd 17002 sgi-crsd 17003 sgi-gcd 27374 asp",
  };
  Object.keys(SERVICES).forEach(function (proto) {
    var words = SERVICES[proto].split(" ");
    var names = {};
    for (var i = 0; i + 1 < words.length; i += 2) names[words[i]] = words[i + 1];
    SERVICES[proto] = names;
  });
  function serviceName(port, proto) { return SERVICES[proto][port]; }

  function parseIPv4(text) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text || "");
    if (!m) return null;
    var n = 0;
    for (var i = 1; i <= 4; i++) {
      if (+m[i] > 255) return null;
      n = n * 256 + +m[i];
    }
    return n;
  }
  function formatIPv4(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."); }
  function prefixMask(prefix) { return prefix ? (0xffffffff << (32 - prefix)) >>> 0 : 0; }

  function buildNetwork(spec) {
    var ifaces = spec.interfaces.map(function (i, k) {
      var parts = i.address.split("/");
      var address = parseIPv4(parts[0]);
      var prefix = +parts[1];
      var mask = prefixMask(prefix);
      var mac = [0x52, 0x54, 0x00, (address >>> 16) & 255, (address >>> 8) & 255, address & 255];
      // The link-local IPv6 address the kernel derives from the MAC (EUI-64).
      var eui = [((mac[0] ^ 2) << 8) | mac[1], (mac[2] << 8) | 0xff, 0xfe00 | mac[3], (mac[4] << 8) | mac[5]];
      return {
        name: i.name, index: k + 2, address: address, prefix: prefix, mask: mask,
        network: (address & mask) >>> 0, broadcast: ((address & mask) | ~mask) >>> 0,
        mac: mac.map(function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join(":"),
        linkLocal: "fe80::" + eui.map(function (g) { return g.toString(16); }).join(":"),
      };
    });
    var dns = spec.dns || { server: null, records: [] };
    var gateway = spec.gateway ? parseIPv4(spec.gateway) : null;
    return {
      ifaces: ifaces,
      gateway: gateway,
      // The resolver, and the records it answers from (#165).
      dns: {
        server: dns.server ? parseIPv4(dns.server) : gateway,
        records: (dns.records || []).map(function (r) { return { name: r.name, type: r.type || "A", value: r.value, ttl: r.ttl || 300 }; }),
      },
      listening: spec.listening || [],
      connections: spec.connections || [],
      hosts: (spec.hosts || []).map(function (h) {
        return { name: h.name, address: parseIPv4(h.address), up: h.up !== false, ping: h.ping !== false, services: h.services || [], filtered: h.filtered || [], login: h.login === true };
      }),
    };
  }

  // Which of `letters` comes last among the options (rm -fi asks, rm -if doesn't).
  function lastOf(rawArgs, letters) {
    var last = null;
    for (var i = 0; i < rawArgs.length && rawArgs[i] !== "--"; i++) {
      if (!/^-[a-zA-Z]+$/.test(rawArgs[i])) continue;
      rawArgs[i].slice(1).split("").forEach(function (l) { if (letters.indexOf(l) !== -1) last = l; });
    }
    return last;
  }

  // A yes-or-no question for -i: from the keyboard at the prompt, or a line of
  // standard input, as GNU's tools read it. Anything starting with y is yes.

  // The commands, by name. Each family's part adds its own: editor, builtins,
  // files, text, system, network and dns.
  var COMMANDS = {};

  Object.assign(S, { applyMode: applyMode, baseName: baseName, buildNetwork: buildNetwork,
    COMMANDS: COMMANDS, compareNames: compareNames, DAYS: DAYS, DEFAULT_NETWORK: DEFAULT_NETWORK,
    flags: flags, formatIPv4: formatIPv4, GiB: GiB, HOSTNAME_ADDRESS: HOSTNAME_ADDRESS,
    human: human, inputs: inputs, isoStamp: isoStamp, join: join, KiB: KiB, lastOf: lastOf,
    lines: lines, MiB: MiB, modeString: modeString, MONTHS: MONTHS, normalize: normalize, ok: ok,
    padLeft: padLeft, padRight: padRight, parentOf: parentOf, parseIPv4: parseIPv4,
    parseStamp: parseStamp, prefixMask: prefixMask, serviceName: serviceName, Sink: Sink,
    size: size, stamp: stamp, START_TIME: START_TIME, UMASK: UMASK, unlines: unlines,
    usage: usage });
  return S;
});
