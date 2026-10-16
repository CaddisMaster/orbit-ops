---
# No console task: a lab (#121). Real certificates come from real servers, which the station
# console's network isn't (decided 2026-10-14).
title: TLS and certificates
minutes: 20
story: |
  **Mission log, day 34.** The relay's link check to Earth fails with a certificate error, and
  half the crew want to switch the check off. "Not until we know which error," says Okafor.
  "An expired certificate and the wrong certificate are two different problems."
quiz:
  - type: choice
    q: "Is this certificate expired, or the wrong one?"
    code: |-
      $ curl -sS https://api.example.org/
      curl: (60) SSL: no alternative certificate subject name matches target host name 'api.example.org'
    options:
      - "The wrong one: the server sent a certificate for some other name. It may be perfectly in date"
      - "Expired: curl checks the date first"
      - "Neither: the server is down"
      - "The certificate is fine, and curl needs `-L`"
    answer: 0
    explain: >-
      "No alternative certificate subject name matches" means none of the names on the
      certificate is `api.example.org`. An expired one says `certificate has expired`. The usual
      causes: the server has no certificate for that name, or the request didn't say which name
      it wanted (SNI), so the server sent its default.
  - type: choice
    q: "It's 2026-11-20. What's wrong with this certificate?"
    code: |-
      $ openssl s_client -connect shop.example.org:443 -servername shop.example.org </dev/null 2>/dev/null | openssl x509 -noout -subject -dates
      subject=CN = shop.example.org
      notBefore=Aug  1 04:12:09 2026 GMT
      notAfter=Oct 30 04:12:08 2026 GMT
    options:
      - "It expired on 30 October: renewal didn't happen. The name is right"
      - "It isn't valid yet"
      - "It's for the wrong name"
      - "Nothing: it's a 90-day certificate"
    answer: 0
    explain: >-
      `notAfter` has passed, so every client refuses it. The subject is the right name, so this
      is an expiry problem: look at why renewal didn't run (with Certbot, `sudo certbot renew
      --dry-run` says). A 90-day certificate is normal for Let's Encrypt; it's renewing that
      matters.
  - type: choice
    q: "One server at one address hosts `a.example.org` and `b.example.org`, each with its own certificate. How does it know which to send?"
    options:
      - "The client names the site it wants at the start of the TLS handshake (SNI), and the server picks that one's certificate"
      - "It sends both, and the client chooses"
      - "From the `Host` header in the HTTP request"
      - "It can't: each certificate needs its own address"
    answer: 0
    explain: >-
      The certificate is sent before any HTTP happens, so the `Host` header comes too late. SNI,
      Server Name Indication, puts the name in the TLS handshake itself. A client that sends no
      name gets whatever the server's default is, which is how you get "the wrong certificate".
  - type: multi
    q: "What does TLS give a connection?"
    options:
      - "Privacy: nobody on the way can read it"
      - "Integrity: nobody on the way can change it unnoticed"
      - "Identity: you're talking to the server the certificate names"
      - "Speed: it makes the connection faster"
    answer: [0, 1, 2]
    explain: >-
      Encryption keeps it private, a check on every message keeps it intact, and the
      certificate, signed by an authority your machine trusts, proves who's on the other end.
      It doesn't make anything faster.
  - type: choice
    q: "Who vouches for `learn.seandesmet.com`'s certificate?"
    options:
      - "An intermediate certificate from Let's Encrypt signed it, and a root certificate your machine already trusts signed the intermediate"
      - "The server signs its own certificate"
      - "DNS: the A record proves it"
      - "Nobody: HTTPS certificates aren't signed"
    answer: 0
    explain: >-
      That's a chain: the server's certificate, the intermediate that issued it (Let's Encrypt's,
      named in its `issuer`), and a root at the top that ships with your system in its trust store.
      A self-signed certificate has no chain, so nobody trusts it unless told to.
cards:
  - id: tls-gives
    section: "What TLS gives you"
    front: "Three things TLS gives a connection"
    back: "Privacy (encrypted), integrity (can't be changed unnoticed), identity (the certificate proves who the server is)."
  - id: sni
    section: "SNI: one address, many certificates"
    front: "What is SNI, and what happens without it?"
    back: "The client names the site it wants in the TLS handshake. Without it the server sends its default certificate, which may be another site's."
  - id: read-cert
    section: "`openssl`: reading a certificate"
    accept: ["openssl s_client -connect example.org:443 -servername example.org </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates"]
    front: "Print `example.org`'s certificate's subject, issuer and dates"
    back: "`openssl s_client -connect example.org:443 -servername example.org </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates`"
  - id: expired-or-wrong
    section: "Expired, or the wrong certificate?"
    front: "curl says `certificate has expired` versus `no alternative certificate subject name matches`"
    back: "The first: `notAfter` has passed, so renew. The second: the certificate is for another name, so it's the wrong one (check SNI and the server's configuration)."
lab:
  from: okafor
  task: |-
    Look at this app's certificate the way the relay's link check does, with `openssl` on your
    own machine.

    1. Ubuntu has `openssl` already (`sudo apt install openssl` if not), and so does a Mac.
    2. Ask `learn.seandesmet.com` on port 443 for its certificate, **naming the site you want**,
       and print the certificate's **subject, issuer and dates**. Paste that in the first box.
    3. Now ask the same server again **without naming any site**, and print just the subject.
       Paste that in the second box. (OpenSSL sends the `-connect` name on its own unless you
       stop it. On a Mac, the built-in `openssl` is LibreSSL: if it doesn't know
       `-noservername`, leave it out, since LibreSSL sends no name unless you give one.)
    4. Ask `openssl x509` whether the right certificate, from step 2, will still be valid **a day
       from now**, and paste its answer in the last box.
  boxes:
    - prompt: The certificate's subject, issuer and dates, for the name `learn.seandesmet.com`.
      checks:
        - {regex: '^subject=.*CN ?= ?learn\.seandesmet\.com\s*$', says: "The subject: this site's name", hint: "Another name? You need -servername learn.seandesmet.com so the server knows which site you want."}
        - {regex: "^issuer=.*O ?= ?Let's Encrypt", says: "The issuer: Let's Encrypt"}
        - {regex: '^notBefore=\w{3} [ \d]\d \d\d:\d\d:\d\d \d{4} GMT\s*$', says: "When it became valid", hint: "openssl x509 -dates prints notBefore and notAfter."}
        - {regex: '^notAfter=\w{3} [ \d]\d \d\d:\d\d:\d\d \d{4} GMT\s*$', says: "When it expires"}
      example: |
        subject=CN = learn.seandesmet.com
        issuer=C = US, O = Let's Encrypt, CN = YE2
        notBefore=Oct  8 17:40:05 2026 GMT
        notAfter=Jan  6 17:40:04 2027 GMT
    - prompt: The subject of the certificate the server sends when you don't name a site.
      checks:
        - {regex: '^subject=.*CN ?= ?[\w.-]+\s*$', says: "A certificate's subject", hint: "Paste the subject= line openssl x509 -subject prints."}
        - {not_contains: "learn.seandesmet.com", says: "Not this site's certificate: the server's default, for another site", hint: "Still learn.seandesmet.com? OpenSSL named the site for you from -connect. -noservername stops it."}
      example: |
        subject=CN = budget.seandesmet.com
    - prompt: What `openssl x509` says about the certificate a day from now.
      checks:
        - {regex: '\A\s*Certificate will not expire\s*\Z', says: "It will still be valid in 24 hours", hint: "openssl x509 -checkend takes seconds, not hours or days."}
      example: |
        Certificate will not expire
comms:
  open:
    - {from: meridian, text: "LINK CHECK · learn.seandesmet.com · CERTIFICATE ERROR · REASON: UNREAD"}
    - {from: okafor, text: "Nobody switches a certificate check off. Read the certificate first: whose name is on it, who signed it, and when it runs out."}
  lab_done:
    - {from: meridian, text: "learn.seandesmet.com · ISSUER: LET'S ENCRYPT · VALID · UNNAMED REQUEST: budget.seandesmet.com"}
    - {from: okafor, text: "The certificate's fine. Ask that server without saying which site you want and you get the neighbour's."}
    - {from: okafor, text: "So the link check wasn't saying who it was calling. One flag in its config, and the check stays on."}
  complete:
    - {from: mission, text: "*Meridian*, Mission Control. Link check green, and still checking. That's how we like it."}
    - {from: okafor, text: "We trust the server now. Next is getting it to trust us: keys of our own."}
---

## What TLS gives you

**TLS** (Transport Layer Security) is what the S in HTTPS adds: before any HTTP is sent, the
client and server set up an encrypted connection. It gives you three things:

| | Means | Without it |
|---|---|---|
| **Privacy** | nobody on the way can read it | anyone on the Wi-Fi sees your passwords |
| **Integrity** | nobody on the way can change it unnoticed | a network can inject ads or malware |
| **Identity** | you're talking to the server you meant | anyone can pretend to be your bank |

The first two come from encryption. The third comes from a **certificate**, and that's the part
that goes wrong.

## Certificates and chains

A certificate is a small signed document the server sends at the start. It says:

- **who it's for**: its **subject** and, more importantly, its list of names (the *subject
  alternative names*), like `learn.seandesmet.com`. A name like `*.example.org` is a wildcard
  for exactly one label: `a.example.org`, not `a.b.example.org`;
- **who signed it**: its **issuer**, a certificate authority (CA);
- **when it's valid**: from **`notBefore`** to **`notAfter`**;
- the server's public key, which the encryption is built on.

Your machine doesn't know the server, so why believe it? Because of **the chain**: the
server's certificate was signed by an intermediate certificate (here Let's Encrypt's), and the
intermediate was signed by a **root** certificate that came with your system, in its **trust
store** (`/etc/ssl/certs` on Ubuntu). Each signature vouches for the next one down. If the chain
reaches a root you trust, and the name and dates are right, the connection is trusted.

**Let's Encrypt** is a free, automated CA, and it signs most of the web's certificates. Its
certificates last 90 days, on purpose: a tool like **Certbot** renews them automatically, so
nobody has to remember.

## SNI: one address, many certificates

One server often hosts several sites at one address. The certificate is sent **before** any
HTTP request, so the server can't wait for the `Host` header to decide which one to send.
Instead, **SNI** (Server Name Indication) **puts the site's name in the TLS handshake**, and the
server picks that site's certificate. Browsers and curl always send it.

**A client that sends no name gets the server's default certificate**, which can be another
site's. Then the name doesn't match, and you have "the wrong certificate" from a server that has
the right one.

## Expired, or the wrong certificate?

The two errors you'll meet most, as curl says them:

| curl says | Means | So |
|---|---|---|
| **`certificate has expired`** | **`notAfter` has passed** | renew it, and find out why renewal didn't run |
| **`no alternative certificate subject name matches target host name`** | **the certificate is for another name** | check the server has a certificate for that name, and that the client sends SNI |
| `unable to get local issuer certificate` | the chain doesn't reach a root you trust | the server isn't sending its intermediate, or it's self-signed |

**Never "fix" these by turning the check off** (`curl -k`, `verify=False`). That removes
identity, and with it the reason to use TLS at all.

## `openssl`: reading a certificate

**`openssl s_client -connect HOST:443 -servername HOST`** opens a TLS connection the way a
browser does and prints everything about it, the certificate included. **`openssl x509`** reads
a certificate and prints the parts you ask for. Pipe one into the other:

```bash
openssl s_client -connect example.org:443 -servername example.org </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

| Piece | Does |
|---|---|
| `-connect HOST:443` | where to connect |
| **`-servername NAME`** | **the name to send as SNI**: the site you want |
| `-noservername` | send no name at all (OpenSSL otherwise sends the `-connect` host's) |
| `</dev/null` | gives `s_client` nothing to send, so it closes instead of waiting for you |
| `2>/dev/null` | hides its progress notes |
| `x509 -noout` | don't print the certificate itself (a block of base64) |
| **`-subject -issuer -dates`** | **who it's for, who signed it, and when it's valid** |
| `-ext subjectAltName` | every name it covers |
| **`-checkend SECONDS`** | **says whether it will still be valid that many seconds from now**: `Certificate will not expire`, or `Certificate will expire` |

`-checkend 604800` (a week) or `2592000` (30 days) is how a script or monitor warns before a
certificate runs out. Without the `x509` half, `s_client`'s own output ends with `Verify return
code: 0 (ok)` when the chain checks out, or the reason it doesn't, like `10 (certificate has
expired)`.

**On the real station:** `learn.seandesmet.com`'s certificate is Let's Encrypt's, set up by
`sudo certbot --nginx -d learn.seandesmet.com` (RUNBOOK §2). Certbot proved the site was ours by
answering a challenge at that name over plain HTTP, which is why DNS had to point at the
droplet first (module 02), and it added the redirect you met in module 04. It renews on its own,
and `sudo certbot certificates` shows each certificate's names and expiry on the droplet. The
droplet serves three sites from one address, each with its own certificate, so it depends on
SNI: ask it with no name, as you will in the lab, and it answers with its default site's.

## Try it

On your own machine. A container needs the tools first: `sudo apt-get update && sudo apt-get
install -y openssl curl ca-certificates`. badssl.com keeps broken certificates on purpose, for
testing.

```bash
H=learn.seandesmet.com
openssl s_client -connect $H:443 -servername $H </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates
openssl s_client -connect $H:443 -servername $H </dev/null 2>/dev/null | openssl x509 -noout -ext subjectAltName
openssl s_client -connect $H:443 -servername $H </dev/null 2>&1 | grep 'Verify return code'   # 0 (ok)
curl -sS -o /dev/null https://expired.badssl.com/       # certificate has expired
openssl s_client -connect expired.badssl.com:443 -servername expired.badssl.com </dev/null 2>/dev/null | openssl x509 -noout -enddate -checkend 0
curl -sS -o /dev/null https://wrong.host.badssl.com/    # no alternative certificate subject name matches
openssl s_client -connect wrong.host.badssl.com:443 -servername wrong.host.badssl.com </dev/null 2>/dev/null | openssl x509 -noout -subject   # *.badssl.com: one label only
```
