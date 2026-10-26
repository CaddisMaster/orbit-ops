// The station console's shell, part 12 of 13 (#255): names (#165). /etc/hosts,
// the resolver, dig, host and getent hosts.
(function (root, factory) {
  if (typeof module === "object" && module.exports) factory(require("./base.js"));
  else factory(root.OrbitShellParts);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  var COMMANDS = S.COMMANDS, DAYS = S.DAYS, formatIPv4 = S.formatIPv4, lines = S.lines,
    MONTHS = S.MONTHS, ok = S.ok, padRight = S.padRight, parseIPv4 = S.parseIPv4, size = S.size,
    Shell = S.Shell, netFlags = S.netFlags, rttFor = S.rttFor;

  // --- names: /etc/hosts and the station's DNS (#165) ---------------------------------
  // getaddrinfo's order is nsswitch.conf's `hosts: files dns`: /etc/hosts
  // first, then the resolver /etc/resolv.conf names. getent, ping and nc go
  // that way; dig and host skip the file and ask the resolver. Both files are
  // read live, so editing them changes the answers. The resolver answers from
  // the exercise's `network.dns` (schema/terminal/dns.py DnsSpec). dig and host print what
  // BIND 9.18's do, checked against a bind9 resolver in ubuntu:24.04 containers.
  var ETC_HOSTS = "127.0.0.1 localhost\n127.0.1.1 meridian\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback\nfe00::0 ip6-localnet\nff00::0 ip6-mcastprefix\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n";
  var DIG_BANNER = "; <<>> DiG 9.18.39-0ubuntu0.24.04.8-Ubuntu <<>> ";
  var DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "NS", "PTR", "SOA", "TXT"];
  var OTHER_TYPES = ["ANY", "AXFR", "CAA", "DNSKEY", "DS", "HINFO", "NAPTR", "NSEC", "RRSIG", "SRV", "SSHFP", "TLSA"];

  // A system file's text, following links: the usual one when the filesystem
  // never had it, and nothing when it's gone or unreadable.
  Shell.prototype.systemFile = function (path, usual) {
    var found = this.lookup(path);
    if (found.node) return found.node.type === "file" ? found.node.contents : "";
    return this.systemFiles[path] ? usual : "";
  };

  // /etc/hosts as entries: an address and its names, comments dropped.
  Shell.prototype.hostsEntries = function () {
    // On another host (#166), that host's own: localhost and its name.
    var text = this.origin ? "127.0.0.1 localhost\n127.0.1.1 " + this.origin.name + "\n" : this.systemFile("/etc/hosts", ETC_HOSTS);
    return lines(text).map(function (l) {
      var words = l.replace(/#.*/, "").trim().split(/\s+/).filter(Boolean);
      return words.length > 1 ? { address: words[0], names: words.slice(1) } : null;
    }).filter(Boolean);
  };

  // The first line naming `name`. glibc asks for IPv6 first when `v6` (getent
  // does): an IPv6 line, or 127.0.0.1, which it hands back as ::1.
  Shell.prototype.hostsEntry = function (name, v6) {
    var key = name.toLowerCase();
    var named = this.hostsEntries().filter(function (e) {
      return e.names.some(function (n) { return n.toLowerCase() === key; });
    });
    if (v6) {
      var six = named.filter(function (e) { return e.address.indexOf(":") !== -1 || e.address === "127.0.0.1"; })[0];
      if (six) return { address: six.address === "127.0.0.1" ? "::1" : six.address, names: six.names };
    }
    return named.filter(function (e) { return parseIPv4(e.address) !== null; })[0] || null;
  };

  // The nameservers /etc/resolv.conf lists, the first three, as resolvers use them.
  Shell.prototype.nameservers = function () {
    var usual = this.net.dns.server === null ? "" : "nameserver " + formatIPv4(this.net.dns.server) + "\n";
    return lines(this.systemFile("/etc/resolv.conf", usual)).map(function (l) {
      var m = /^\s*nameserver\s+(\S+)/.exec(l);
      return m && parseIPv4(m[1]) !== null ? m[1] : null;
    }).filter(Boolean).slice(0, 3);
  };

  // Does a DNS server at `addr` answer? "answers", "refused" (the host is up
  // and nothing listens on 53: an ICMP port unreachable), "timeout", or
  // "unreachable" (no route). The station's resolver answers unless its host
  // is listed as down; any other host answers if it serves udp/53.
  Shell.prototype.dnsReach = function (addr) {
    var serves = function (s) { return s.port === 53 && (s.proto || "tcp") === "udp"; };
    if (this.isLocal(addr)) return this.net.listening.some(serves) ? "answers" : "refused";
    var route = this.route(addr);
    if (route.unreachable) return "unreachable";
    var listed = this.net.hosts.filter(function (h) { return h.address === addr; })[0];
    if (addr === this.net.dns.server) return listed && !listed.up ? "timeout" : "answers";
    if (!route.host || !route.host.up) return "timeout";
    return route.host.services.some(serves) ? "answers" : "refused";
  };

  // The zone a name belongs to, for the SOA a negative answer carries: a /24's
  // reverse zone, the station's own `meridian`, the last two labels, or for a
  // bare word that isn't `meridian`, the root ("").
  function zoneOf(name) {
    var labels = name.split(".");
    if (/\.in-addr\.arpa$/.test(name)) return labels.length > 5 ? labels.slice(-5).join(".") : name;
    if (labels[labels.length - 1] === "meridian") return "meridian";
    return labels.length > 1 ? labels.slice(-2).join(".") : "";
  }
  function soaRecord(zone) {
    if (zone === "") return { name: "", ttl: 86400, type: "SOA", mname: "a.root-servers.net", rname: "nstld.verisign-grs.com", data: "a.root-servers.net. nstld.verisign-grs.com. 2026100800 1800 900 604800 86400" };
    var home = /in-addr\.arpa$/.test(zone) ? "meridian" : zone;
    return { name: zone, ttl: 300, type: "SOA", mname: "ns1." + home, rname: "hostmaster." + home, data: "ns1." + home + ". hostmaster." + home + ". 2026100801 3600 900 604800 300" };
  }
  // A record as dig shows it, and with what the message size needs.
  function dnsRecord(owner, r) {
    var out = { name: owner, ttl: r.ttl, type: r.type };
    if (r.type === "A") out.data = r.value;
    else if (r.type === "TXT") out.data = '"' + r.value.replace(/(["\\])/g, "\\$1") + '"';
    else if (r.type === "MX") {
      var parts = r.value.split(" ");
      out.pref = +parts[0];
      out.target = parts[1];
      out.data = parts[0] + " " + parts[1] + ".";
    } else {
      out.target = r.value;
      out.data = r.value + ".";
    }
    out.value = r.value;
    return out;
  }

  // The resolver's answer to one question: {status, answer, authority, additional}.
  // A CNAME is followed, as a recursive resolver does, unless it's what was asked for.
  Shell.prototype.dnsAnswer = function (qname, qtype) {
    var records = this.net.dns.records;
    var owner = qname.replace(/\.$/, "");
    var name = owner.toLowerCase();
    var named = function (n) { return records.filter(function (r) { return r.name === n; }); };
    var answer = [], authority = [], additional = [];
    for (var hops = 0; hops < 8 && qtype !== "CNAME"; hops++) {
      var alias = named(name).filter(function (r) { return r.type === "CNAME"; })[0];
      if (!alias) break;
      answer.push(dnsRecord(owner, alias));
      owner = name = alias.value;
    }
    var zone = zoneOf(name);
    var hits = named(name).filter(function (r) { return r.type === qtype; }).map(function (r) { return dnsRecord(owner, r); });
    var apexHit = name === zone && records.some(function (r) { return zoneOf(r.name) === zone; });
    if (qtype === "SOA" && apexHit) hits = [soaRecord(zone)];
    answer = answer.concat(hits);
    var exists = apexHit || records.some(function (r) { return r.name === name || r.name.slice(-name.length - 1) === "." + name; });
    if (!hits.length) authority.push(soaRecord(zone));
    hits.forEach(function (r) {
      if (r.type !== "MX") return;
      named(r.target).forEach(function (a) { if (a.type === "A") additional.push(dnsRecord(a.name, a)); });
    });
    return { status: hits.length || exists ? "NOERROR" : "NXDOMAIN", answer: answer, authority: authority, additional: additional };
  };

  // Ask the nameservers in turn, `tries` times each, until one answers.
  // {result, server, failures: [{server, why}]}; the clock moves 5 s per timeout.
  Shell.prototype.askDns = function (qname, qtype, tries, servers) {
    var sh = this;
    var failures = [];
    if (this.origin && !servers) return { result: this.dnsAnswer(qname, qtype), server: formatIPv4(this.net.dns.server || 0), failures: [] }; // another host's resolver answers it
    servers = servers || this.nameservers();
    // With no nameserver at all, resolvers fall back to this machine.
    var list = servers.length ? servers : ["::1", "127.0.0.1"];
    for (var i = 0; i < list.length; i++) {
      var server = list[i];
      var reach = parseIPv4(server) === null ? "refused" : this.dnsReach(parseIPv4(server));
      if (reach === "answers") return { result: this.dnsAnswer(qname, qtype), server: server, failures: failures };
      // The last fallback is tried once; with no route, every client tries three times.
      var times = !servers.length && server === "127.0.0.1" ? 1 : reach === "unreachable" ? 3 : tries;
      for (var t = 0; t < times; t++) {
        failures.push({ server: server, why: reach });
        if (reach === "timeout") sh.clock += 5;
      }
    }
    return { result: null, failures: failures };
  };

  // An address back to a name, for ping's replies: /etc/hosts, then a PTR.
  Shell.prototype.reverseName = function (addr) {
    var shown = formatIPv4(addr);
    var entry = this.hostsEntries().filter(function (e) { return e.address === shown; })[0];
    if (entry) return entry.names[0];
    var asked = this.askDns(reverseOf(shown), "PTR", 2);
    var ptr = asked.result && asked.result.answer.filter(function (r) { return r.type === "PTR"; })[0];
    return ptr ? ptr.value : null;
  };
  function reverseOf(address) { return address.split(".").reverse().join(".") + ".in-addr.arpa"; }

  // The size of the reply on the wire, which dig prints: names are compressed
  // (a repeated suffix is a two-byte pointer), and the OPT record is 11 bytes.
  function dnsSize(qname, sections) {
    var seen = {}, size = 12;
    function name(n) {
      var labels = n.replace(/\.$/, "").split(".").filter(Boolean);
      for (var i = 0; i < labels.length; i++) {
        var suffix = labels.slice(i).join(".").toLowerCase();
        if (seen[suffix] !== undefined) { size += 2; return; }
        seen[suffix] = size;
        size += 1 + labels[i].length;
      }
      size += 1;
    }
    name(qname);
    size += 4;
    sections.forEach(function (r) {
      name(r.name);
      size += 10;
      if (r.type === "A") size += 4;
      else if (r.type === "TXT") size += 1 + new TextEncoder().encode(r.value).length;
      else if (r.type === "SOA") { name(r.mname); name(r.rname); size += 20; }
      else { if (r.type === "MX") size += 2; name(r.target); }
    });
    return size + 11;
  }

  // dig's columns: tabs to the next stop, or one space when the text is past it.
  function digColumns(fields, stops) {
    var line = "", col = 0;
    fields.forEach(function (f, k) {
      line += f;
      col += f.length;
      if (k === fields.length - 1) return;
      if (col >= stops[k]) { line += " "; col++; return; }
      while (col < stops[k]) { line += "\t"; col = (col + 8) & ~7; }
    });
    return line + "\n";
  }
  function digRecord(r) { return digColumns([r.name ? r.name + "." : ".", String(r.ttl), "IN", r.type, r.data], [24, 32, 40, 48]); }

  function stationWhen(d) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return DAYS[d.getDay()] + " " + MONTHS[d.getMonth()] + " " + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + " UTC " + d.getFullYear();
  }

  // What the servers said when none answered, as dig and host print it. With
  // no route, each try gives up at once and says so in full, and dig prints
  // no banner.
  function dnsFailure(f, qname) {
    if (f.why === "unreachable") return ";; UDP setup with " + f.server + "#53(" + f.server + ") for " + qname + " failed: network unreachable.\n;; no servers could be reached\n";
    return ";; communications error to " + f.server + "#53: " + (f.why === "timeout" ? "timed out" : "connection refused") + "\n";
  }
  function dnsFailures(failures, qname, banner) {
    var out = failures.map(function (f) { return dnsFailure(f, qname); }).join("");
    var last = failures[failures.length - 1];
    return last && last.why === "unreachable" ? out : out + (banner || "") + ";; no servers could be reached\n";
  }

  // A name dig will send, or why not.
  function illegalName(name) {
    var labels = name.replace(/\.$/, "").split(".");
    if (name !== "." && labels.some(function (l) { return l === ""; })) return "empty label";
    if (labels.some(function (l) { return l.length > 63; })) return "label too long";
    return null;
  }

  // The server a command was told to ask (dig @SERVER, host NAME SERVER), by
  // address or by name.
  Shell.prototype.namedServer = function (text) {
    if (parseIPv4(text) !== null) return { address: text, name: text };
    var found = this.resolveName(text);
    return found.error ? null : { address: formatIPv4(found.address), name: text };
  };

  // --- dig ----------------------------------------------------------------------------
  COMMANDS.dig = function (args, stdin, io) {
    var o = { short: false, server: null, type: null, name: null };
    for (var i = 0; i < args.length; i++) {
      var a = args[i], upper = a.toUpperCase();
      if (a[0] === "@") o.server = a.slice(1);
      else if (a === "+short") o.short = true;
      else if (a === "+noshort") o.short = false;
      else if (a[0] === "+") throw new Error(a + " isn't supported on this console; dig and dig +short are");
      else if (a === "-4") continue;
      else if (a === "-x" || a === "-t") {
        var value = args[++i];
        if (value === undefined) return { out: "", err: "dig: option requires an argument -- '" + a[1] + "'\n", code: 1 };
        if (a === "-t") { o.type = value.toUpperCase(); continue; }
        if (parseIPv4(value) === null) throw new Error("dig -x takes an IPv4 address on this console, like dig -x 203.0.113.47");
        o.name = reverseOf(value);
        o.type = o.type || "PTR";
      } else if (a[0] === "-") throw new Error(a + " isn't supported on this console");
      else if (o.type === null && DNS_TYPES.indexOf(upper) !== -1) o.type = upper;
      else if (OTHER_TYPES.indexOf(upper) !== -1) throw new Error("dig " + upper + " isn't supported on this console; try A, CNAME, MX, TXT, PTR or SOA");
      else if (upper === "IN") continue;
      else if (o.name === null) o.name = a;
      else throw new Error("one name at a time on this console: dig " + o.name);
    }
    if (o.type !== null && DNS_TYPES.indexOf(o.type) === -1) throw new Error("dig " + o.type + " isn't supported on this console; try A, CNAME, MX, TXT, PTR or SOA");
    if (o.name === null) throw new Error("give dig a name to look up: dig relay.depot-sync.net");
    var why = illegalName(o.name);
    if (why) return { out: "", err: "dig: '" + o.name + "' is not a legal name (" + why + ")\n", code: 10 };
    var type = o.type || "A";
    var servers = null;
    if (o.server !== null) {
      var named = this.namedServer(o.server);
      if (!named) return { out: "", err: "dig: couldn't get address for '" + o.server + "': not found\n", code: 10 };
      servers = [named.address];
    }
    var asked = this.askDns(o.name, type, 3, servers);
    this.reap();
    var banner = "\n" + DIG_BANNER + args.join(" ") + "\n" + (o.server !== null ? "; (1 server found)\n" : "") + ";; global options: +cmd\n";
    if (!asked.result) {
      io.out.write(dnsFailures(asked.failures, o.name, o.short ? "" : banner));
      return { out: "", err: "", code: 9 };
    }
    var out = asked.failures.map(function (f) { return dnsFailure(f, o.name); }).join(""); // servers that didn't answer before one did
    var r = asked.result;
    if (o.short) return ok(out + r.answer.map(function (x) { return x.data + "\n"; }).join(""));
    var qname = o.name.replace(/\.$/, "") + ".";
    var sections = function (title, list) { return list.length ? ";; " + title + " SECTION:\n" + list.map(digRecord).join("") + "\n" : ""; };
    var server = asked.server, addr = parseIPv4(server);
    var route = this.route(addr);
    var ms = route.local || route.via === null ? Math.floor(rttFor(addr, this.clock, 1)) : Math.round(rttFor(addr, this.clock, 24));
    var id = ((addr ^ Math.imul(this.clock + 1, 2654435761) ^ Math.imul(qname.length, 7919)) >>> 0) % 65536; // steady, like the round trips
    out += banner + ";; Got answer:\n" +
      ";; ->>HEADER<<- opcode: QUERY, status: " + r.status + ", id: " + id + "\n" +
      ";; flags: qr rd ra; QUERY: 1, ANSWER: " + r.answer.length + ", AUTHORITY: " + r.authority.length + ", ADDITIONAL: " + (r.additional.length + 1) + "\n\n" +
      ";; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 1232\n" +
      ";; QUESTION SECTION:\n;" + digColumns([qname, "IN", type], [32, 40]) + "\n" +
      sections("ANSWER", r.answer) + sections("AUTHORITY", r.authority) + sections("ADDITIONAL", r.additional) +
      ";; Query time: " + ms + " msec\n" +
      ";; SERVER: " + server + "#53(" + server + ") (UDP)\n" +
      ";; WHEN: " + stationWhen(this.now()) + "\n" +
      ";; MSG SIZE  rcvd: " + dnsSize(qname, r.answer.concat(r.authority, r.additional)) + "\n\n";
    return ok(out);
  };

  // --- host ---------------------------------------------------------------------------
  var HOST_SAYS = { A: "has address", AAAA: "has IPv6 address", MX: "mail is handled by", TXT: "descriptive text", PTR: "domain name pointer", SOA: "has SOA record", NS: "name server" };
  COMMANDS.host = function (args) {
    var p = netFlags("host", args, "t4", "aACdilrsTUvVwW:c:N:R:m:p:t:46".replace(/:/g, ""), "cNRmptW");
    var name = p.args[0];
    if (name === undefined) return { out: "", err: "Usage: host [-aCdilrTvVw] [-c class] [-N ndots] [-t type] [-W time]\n            [-R number] [-m flag] [-p port] hostname [server]\n", code: 1 };
    if (p.args.length > 2) throw new Error("usage: host [-t TYPE] NAME [SERVER]");
    var asked = p.opts.t === undefined ? null : p.opts.t.toUpperCase();
    if (asked !== null && DNS_TYPES.indexOf(asked) === -1) throw new Error("host -t " + p.opts.t + " isn't supported on this console; try A, CNAME, MX, TXT, PTR or SOA");
    var why = illegalName(name);
    if (why) return { out: "", err: "host: '" + name + "' is not a legal name (" + why + ")\n", code: 1 };
    var reverse = parseIPv4(name) !== null;
    var qname = reverse ? reverseOf(name) : name;
    var out = "", servers = null, named = null;
    if (p.args[1] !== undefined) {
      named = this.namedServer(p.args[1]);
      if (!named) return { out: "", err: "host: couldn't get address for '" + p.args[1] + "': not found\n", code: 1 };
      servers = [named.address];
    }
    var types = asked ? [asked] : reverse ? ["PTR"] : ["A", "AAAA", "MX"];
    var aliased = {};
    for (var k = 0; k < types.length; k++) {
      var res = this.askDns(qname, types[k], 2, servers);
      if (!res.result) {
        this.reap();
        return { out: out + dnsFailures(res.failures, qname), err: "", code: 1 };
      }
      var r = res.result;
      // Which server answered is said once it has.
      if (named && !k) out += "Using domain server:\nName: " + named.name + "\nAddress: " + named.address + "#53\nAliases: \n\n";
      if (r.status === "NXDOMAIN") return { out: out + "Host " + qname + (reverse ? "." : "") + " not found: 3(NXDOMAIN)\n", err: "", code: 1 };
      r.answer.forEach(function (x) {
        if (x.type === "CNAME") {
          if (!aliased[x.name]) out += x.name + " is an alias for " + x.data + "\n";
          aliased[x.name] = true;
        } else out += x.name + " " + HOST_SAYS[x.type] + " " + x.data + "\n";
      });
      if (asked && !r.answer.length) out += qname + " has no " + asked + " record\n";
    }
    this.reap();
    return ok(out);
  };

  // getent hosts: the way programs look names up, /etc/hosts first. Listing
  // the file prints its IPv4 lines, and ::1 as 127.0.0.1, as glibc does.
  Shell.prototype.getentHosts = function (keys) {
    var sh = this;
    var line = function (address, names) { return padRight(address, 15) + " " + names.join(" ") + "\n"; };
    if (!keys.length) {
      return ok(this.hostsEntries().map(function (e) {
        if (e.address === "::1") return line("127.0.0.1", e.names);
        return parseIPv4(e.address) !== null ? line(e.address, e.names) : "";
      }).join(""));
    }
    var out = "", missing = false;
    keys.forEach(function (key) {
      if (parseIPv4(key) !== null || key.indexOf(":") !== -1) {
        var entry = sh.hostsEntries().filter(function (e) { return e.address === key; })[0];
        if (entry) { out += line(key, entry.names); return; }
        var ptr = parseIPv4(key) !== null && sh.askDns(reverseOf(key), "PTR", 2).result;
        var found = ptr && ptr.answer.filter(function (r) { return r.type === "PTR"; })[0];
        if (found) out += line(key, [found.value]); else missing = true;
        return;
      }
      var file = sh.hostsEntry(key, true);
      if (file) { out += line(file.address, file.names); return; }
      var asked = sh.askDns(key, "A", 2);
      var a = asked.result && asked.result.answer.filter(function (r) { return r.type === "A"; })[0];
      if (!a) { missing = true; return; }
      out += line(a.data, a.name.toLowerCase() === key.toLowerCase() ? [a.name] : [a.name, key]);
    });
    this.reap();
    return { out: out, err: "", code: missing ? 2 : 0 };
  };

});
