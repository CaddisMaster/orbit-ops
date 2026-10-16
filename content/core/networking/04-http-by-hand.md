---
# No console task: a lab (#121). The console has curl since #166, but only for the station's
# own simulated hosts; this module is about a real site, which needs the real internet.
title: HTTP by hand
minutes: 20
story: |
  **Mission log, day 32.** With the relays fixed, the station's status page is reachable from
  Earth again. "A browser shows you the page and hides the conversation," says Okafor. "I want
  the conversation."
quiz:
  - type: choice
    q: "Why did curl print no page, and what would a browser do next?"
    code: |-
      $ curl -sI http://shop.example.org/cart
      HTTP/1.1 301 Moved Permanently
      Server: nginx
      Content-Type: text/html
      Location: https://shop.example.org/cart
    options:
      - "`-I` asks for the headers only, and the answer is a redirect: a browser would follow `Location` to the HTTPS address. curl only follows it with `-L`"
      - "The page doesn't exist; a browser would show an error"
      - "The server is down; a browser would retry"
      - "`-s` hides the page; without it curl would show the cart"
    answer: 0
    explain: >-
      `301 Moved Permanently` says the thing is somewhere else, and the `Location` header says
      where. A browser follows it without asking. curl shows you each answer as it is and only
      follows with `-L`. `-I` sends a HEAD request, which never has a body anyway.
  - type: choice
    q: "A site shows an error page. Where's the problem?"
    code: |-
      $ curl -v https://api.example.org/orders
      > GET /orders HTTP/1.1
      > Host: api.example.org
      >
      < HTTP/1.1 502 Bad Gateway
      < Server: nginx
    options:
      - "Nginx answered, but couldn't get an answer from the app behind it: the app is down or not listening"
      - "The name doesn't resolve"
      - "The request is wrong: a 5xx means the client made a mistake"
      - "`/orders` doesn't exist"
    answer: 0
    explain: >-
      Something answered with a status line, so the name, the route and the port 443 are all
      fine. `502 Bad Gateway` is a proxy saying the server it passes requests to didn't give a
      good answer, usually because the app isn't running. 5xx means the server side failed; 4xx
      is the request's fault, like a missing page (404).
  - type: choice
    q: "You fetch a page you're not logged in for, and get `401`. Logged in as a normal user, you get `403`. What's the difference?"
    options:
      - "401: who are you? (no or bad credentials). 403: I know who you are, and you're not allowed"
      - "401: the page is missing. 403: the server crashed"
      - "They mean the same; servers pick either"
      - "401: too many requests. 403: try again later"
    answer: 0
    explain: >-
      Both are 4xx, the request's problem. `401 Unauthorized` means it needs credentials and
      didn't get good ones. `403 Forbidden` means the credentials are fine and the answer is
      still no. A missing page is `404`, and too many requests is `429`.
  - type: multi
    q: "Which of these does `curl -v` show?"
    options:
      - "The request line and headers curl sent, on lines starting `>`"
      - "The status line and headers that came back, on lines starting `<`"
      - "The body"
      - "Only the body, quietly"
    answer: [0, 1, 2]
    explain: >-
      `-v` shows the whole conversation: `>` for what was sent, `<` for what came back, `*` for
      curl's own notes (the address, the TLS handshake), and then the body. Plain `curl URL`
      shows only the body.
  - type: fill
    q: "Which response header names where a redirect goes?"
    answer: ["Location", "Location:"]
    explain: >-
      `Location`. A 3xx response without one would have nowhere to send you.
cards:
  - id: status-classes
    section: "Status codes"
    front: "What do 2xx, 3xx, 4xx and 5xx mean?"
    back: "2xx: it worked. 3xx: look elsewhere (a redirect). 4xx: the request's fault (404 missing, 401/403 not allowed). 5xx: the server failed (500, 502, 503)."
  - id: curl-i-v
    section: "`curl`: requests by hand"
    front: "`curl -I` versus `curl -v`?"
    back: "`-I` sends HEAD and prints only the response's headers. `-v` shows the whole conversation: `>` sent, `<` received, then the body."
  - id: follow-redirects
    section: "Redirects"
    accept: ["curl -L", "-L"]
    front: "curl got a 301. How do you make it follow the redirect?"
    back: "`curl -L`: it follows `Location` until something that isn't a redirect answers."
  - id: status-only
    section: "`curl`: requests by hand"
    accept: ["curl -s -o /dev/null -w '%{http_code}\\n' URL", "curl -so /dev/null -w '%{http_code}\\n' URL", "curl -s -o /dev/null -w '%{http_code}' URL"]
    front: "Print only a URL's status code"
    back: "`curl -s -o /dev/null -w '%{http_code}\\n' URL`"
lab:
  from: okafor
  task: |-
    The station's status page is the one you're looking at: this app answers at
    **`learn.seandesmet.com`**, and `/healthz` is the page that says whether it's well. Read it
    the way a program does, with `curl` on your own machine.

    1. Install curl if you don't have it. A Mac has it already. On Ubuntu:
       `sudo apt update`, then `sudo apt install curl`.
    2. Ask for the headers of the **plain `http://`** address, without following anything:
       `curl -sI http://learn.seandesmet.com/healthz`. Paste it in the first box.
    3. Now the whole conversation, over HTTPS: `curl -v https://learn.seandesmet.com/healthz`.
       Paste it all in the second box.
    4. From that output, copy **just two lines** into the third box: the **status line** of the
       response, and the **response header that says what kind of data the body is**.
    5. Finally, have curl follow the redirect from step 2 and report only where it ended up:
       `curl -sL -o /dev/null -w '%{http_code} %{url_effective}\n' http://learn.seandesmet.com/healthz`.
       Paste that in the last box.
  boxes:
    - prompt: The output of `curl -sI http://learn.seandesmet.com/healthz`.
      checks:
        - {regex: '^HTTP/1\.1 301 ', says: "The status line: 301, a redirect", hint: "Was it http://, not https://? The plain address is the one that redirects."}
        - {regex: '(?i)^location: https://learn\.seandesmet\.com/healthz\s*$', says: "The Location header: the same page, over HTTPS"}
        - {not_contains: " 200 ", says: "Only the first answer: curl didn't follow the redirect", hint: "Without -L: this step is the redirect itself."}
      example: |
        HTTP/1.1 301 Moved Permanently
        Server: nginx/1.24.0 (Ubuntu)
        Date: Fri, 16 Oct 2026 12:52:57 GMT
        Content-Type: text/html
        Content-Length: 178
        Connection: keep-alive
        Location: https://learn.seandesmet.com/healthz
    - prompt: The output of `curl -v https://learn.seandesmet.com/healthz`, all of it.
      checks:
        - {regex: '^> GET /healthz HTTP/(1\.1|2)\s*$', says: "The request line curl sent: GET /healthz", hint: "Paste the lines starting with > too: they're what curl sent."}
        - {regex: '(?i)^> host: learn\.seandesmet\.com\s*$', says: "The Host header: which site curl asked for"}
        - {regex: '^< HTTP/(1\.1|2) 200', says: "The response's status line: 200", hint: "Was it https://? Over http:// the answer is the redirect."}
        - {contains: '"status":"ok"', says: "The body: the app says it's well", hint: "The body comes last, after the headers. Did the paste get cut short?"}
      example: |
        * Host learn.seandesmet.com:443 was resolved.
        * IPv6: (none)
        * IPv4: 147.182.219.112
        *   Trying 147.182.219.112:443...
        * Connected to learn.seandesmet.com (147.182.219.112) port 443
        * ALPN: curl offers h2,http/1.1
        * TLSv1.3 (OUT), TLS handshake, Client hello (1):
        *  CAfile: /etc/ssl/certs/ca-certificates.crt
        *  CApath: /etc/ssl/certs
        * TLSv1.3 (IN), TLS handshake, Server hello (2):
        * TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):
        * TLSv1.3 (IN), TLS handshake, Certificate (11):
        * TLSv1.3 (IN), TLS handshake, CERT verify (15):
        * TLSv1.3 (IN), TLS handshake, Finished (20):
        * TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):
        * TLSv1.3 (OUT), TLS handshake, Finished (20):
        * SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / X25519 / id-ecPublicKey
        * ALPN: server accepted http/1.1
        * Server certificate:
        *  subject: CN=learn.seandesmet.com
        *  start date: Oct  8 17:40:05 2026 GMT
        *  expire date: Jan  6 17:40:04 2027 GMT
        *  subjectAltName: host "learn.seandesmet.com" matched cert's "learn.seandesmet.com"
        *  issuer: C=US; O=Let's Encrypt; CN=YE2
        *  SSL certificate verify ok.
        *   Certificate level 0: Public key type EC/prime256v1 (256/128 Bits/secBits), signed using ecdsa-with-SHA384
        *   Certificate level 1: Public key type EC/secp384r1 (384/192 Bits/secBits), signed using ecdsa-with-SHA384
        *   Certificate level 2: Public key type EC/secp384r1 (384/192 Bits/secBits), signed using ecdsa-with-SHA384
        *   Certificate level 3: Public key type EC/secp384r1 (384/192 Bits/secBits), signed using ecdsa-with-SHA384
        * using HTTP/1.x
        > GET /healthz HTTP/1.1
        > Host: learn.seandesmet.com
        > User-Agent: curl/8.5.0
        > Accept: */*
        >
        * TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
        * TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
        * old SSL session ID is stale, removing
        < HTTP/1.1 200 OK
        < Server: nginx/1.24.0 (Ubuntu)
        < Date: Fri, 16 Oct 2026 12:55:36 GMT
        < Content-Type: application/json
        < Content-Length: 52
        < Connection: keep-alive
        < content-security-policy: default-src 'self'; script-src 'self' 'nonce-CY3bey1N0GxWuUloYmD7bg' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
        < x-frame-options: DENY
        < x-content-type-options: nosniff
        < referrer-policy: no-referrer
        < permissions-policy: camera=(), microphone=(), geolocation=()
        < strict-transport-security: max-age=31536000; includeSubDomains
        <
        * Connection #0 to host learn.seandesmet.com left intact
        {"status":"ok","version":"0.8.0","commit":"542844a"}
    - prompt: Two lines from the second box's output, the response's status line and the header that says what kind of data the body is.
      checks:
        - {lines: {min: 2, max: 2}, says: "Two lines", hint: "Just the two lines, nothing else."}
        - {regex: '^(< )?HTTP/(1\.1|2) 200', says: "The response's status line", hint: "It's the first line starting with <, not the > GET line curl sent."}
        - {regex: '(?i)^(< )?content-type: application/json\s*$', says: "Content-Type: the body is JSON", hint: "Which header names a kind of data? Look among the < lines."}
      example: |
        < HTTP/1.1 200 OK
        < Content-Type: application/json
    - prompt: The output of `curl -sL -o /dev/null -w '%{http_code} %{url_effective}\n' http://learn.seandesmet.com/healthz`.
      checks:
        - {regex: '^200 https://learn\.seandesmet\.com/healthz\s*$', says: "It followed the redirect and ended at the HTTPS page with a 200", hint: "301 and an http:// address? That's without -L: curl stopped at the redirect."}
      example: |
        200 https://learn.seandesmet.com/healthz
comms:
  open:
    - {from: meridian, text: "STATUS PAGE · learn.seandesmet.com · REACHABLE FROM EARTH"}
    - {from: okafor, text: "Everything that talks to that page, the deploy, Mission's monitor, a browser, has the same conversation with it. Have it yourself, with curl, and show me what it says."}
  lab_done:
    - {from: meridian, text: "GET /healthz · HTTP → 301 → HTTPS · 200 OK · application/json"}
    - {from: okafor, text: "The plain address says go elsewhere, the HTTPS one answers, and it tells you it's JSON. A browser does all that without showing you."}
  complete:
    - {from: mission, text: "*Meridian*, Mission Control. We read your status page the same way: we fetch it and check the status line, not the pretty version."}
    - {from: okafor, text: "That body was JSON. Next we talk to things that answer only in JSON."}
---

## A request and a response

Every page, image and API call on the web is one **HTTP** conversation: the client sends a
**request**, and the server sends back a **response**. Both are plain text, and you can read
them. A request:

```text
GET /healthz HTTP/1.1
Host: learn.seandesmet.com
User-Agent: curl/8.5.0
Accept: */*
```

Its first line is the **method** (`GET`), the **path** (`/healthz`) and the protocol version.
Then come **headers**, `Name: value` lines, and a blank line to end them. The response has
the same shape, with a **status line** first:

```text
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 52

{"status":"ok","version":"0.8.0","commit":"542844a"}
```

After the headers and the blank line comes the **body**: the page, the image, the data. HTTPS
is the same conversation inside an encrypted connection (module 06).

## Methods

The method says what the client wants done:

| Method | Means |
|---|---|
| `GET` | send me this (a browser's every page) |
| `HEAD` | send me only the headers of what `GET` would send |
| `POST` | here is some data: do something with it (a form, a new record) |
| `PUT`, `PATCH` | replace, or change, this thing |
| `DELETE` | remove this thing |

A server that doesn't do a method for a path says `405 Method Not Allowed`.

## Status codes

The status line's three-digit number is the server's answer in brief, and **its first digit
says which kind of answer it is**:

| Code | Kind | Common ones |
|---|---|---|
| **2xx** | it worked | `200 OK`, `201 Created`, `204 No Content` |
| **3xx** | look elsewhere: a redirect | `301 Moved Permanently`, `302 Found`, `304 Not Modified` |
| **4xx** | **the request's fault** | `400 Bad Request`, `401 Unauthorized` (who are you?), `403 Forbidden` (no), `404 Not Found`, `405`, `429 Too Many Requests` |
| **5xx** | **the server failed** | `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable`, `504 Gateway Timeout` |

The split between 4xx and 5xx tells you where to look: a 4xx is fixed by sending a different
request, a 5xx by fixing the server. `502` and `504` come from a **proxy** in front of an app,
like Nginx: it answered, but the app behind it didn't, or not in time.

## Headers

Headers carry everything about a message that isn't the body. A few you'll read every day:

| Header | In | Says |
|---|---|---|
| `Host` | request | which site the client wants, since one server can host many |
| `Content-Type` | both | **what kind of data the body is**: `text/html`, `application/json` |
| `Content-Length` | both | the body's size in bytes |
| `Location` | response | **where a redirect goes** |
| `Server` | response | the server software, often a proxy like `nginx` |
| `Cache-Control` | response | whether and how long the answer may be kept |

**Header names don't care about case**: `Content-Type` and `content-type` are the same
header. You'll see both, sometimes in one response.

## `curl`: requests by hand

A Mac comes with curl. On Ubuntu, install it with `sudo apt update`, then `sudo apt install
curl`. **`curl URL`** sends a `GET` and prints the body. Its options decide what else you see:

| Option | Does |
|---|---|
| `-v` | **shows the whole conversation**: `>` lines are what curl sent, `<` lines what came back, `*` lines curl's own notes |
| `-I` | **sends `HEAD` and prints only the response's headers** |
| `-s` | silent: no progress meter or error messages |
| `-L` | **follows redirects** to wherever they lead |
| `-o FILE` | writes the body to FILE instead of the screen (`-o /dev/null` throws it away) |
| `-w '%{http_code}\n'` | **after the transfer, prints what you ask for**: here, the status code |
| `-X METHOD` | uses another method, like `-X DELETE` |

`-w` knows many names in `%{…}`: **`%{http_code}`** is the status code and
**`%{url_effective}`** is the address curl ended at. So **`curl -s -o /dev/null -w
'%{http_code}\n' URL` prints only the status code**, which is how scripts and monitors check
a page. Options combine as usual: `-sI`, `-sL`.

`-v` writes its notes to standard error, so `curl -v URL | less` shows only the body in the
pager. Use `curl -v URL 2>&1 | less` to page all of it.

## Redirects

A **3xx** response with a **`Location`** header says "what you want is over there". A
browser follows it at once, and you only notice the address bar change. **curl doesn't follow
a redirect unless you give it `-L`**: without it, you see the redirect itself, which is often
what you want to know.

```text
$ curl -sI http://github.com
HTTP/1.1 301 Moved Permanently
Content-Length: 0
Location: https://github.com/
```

`301` means moved for good (browsers remember it), `302` means just this time. **With `-I -L`
together, curl shows every hop's headers**, one status line per answer, so you can see the
whole chain.

**On the real station:** the redirect you'll meet in the lab is Certbot's. When it set up
HTTPS for `learn.seandesmet.com`, it added an Nginx rule that answers any plain `http://`
request with a `301` to the same address over `https://`. The `200` that follows has two
families of headers: `Server`, `Date` and `Content-Type` are capitalised by Nginx, and
`content-security-policy`, `x-frame-options` and `strict-transport-security` come from the
app itself, set by the security middleware in `app/security.py` and sent in lowercase by its
web framework. The CSP's `nonce` is new on
every request, which is why each page's inline scripts carry it. And `/healthz` is the page
the deploy reads: after each release it fetches it until the body names the new version.
`HEAD` requests to it once got `405 Method Not Allowed`, until the fix for issue #9 taught the
app to answer them like `GET`, without the body.

## Try it

On your own machine, Ubuntu or a Mac. A container needs curl first: `sudo apt-get update &&
sudo apt-get install -y curl`.

```bash
curl -sI https://example.com                      # HTTP/2 200 and its headers: no body
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/no-such-page   # 404
curl -sI http://github.com | grep -i '^location'  # the redirect's target
curl -sIL http://github.com | grep -i '^HTTP'     # 301, then 200: every hop
curl -s https://learn.seandesmet.com/healthz      # the body: JSON
curl -s -X DELETE -o /dev/null -w '%{http_code}\n' https://learn.seandesmet.com/healthz   # 405
```
