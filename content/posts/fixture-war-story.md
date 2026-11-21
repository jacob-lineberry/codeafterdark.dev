+++
# DESIGN FIXTURE: synthetic content for checking the layout. Draft only; never publish.
draft = true
date = '2026-11-12T02:40:00-05:00'
title = 'The MTU mismatch that only broke one region'
description = 'Health checks were green and small requests were fine. Big TLS responses died in a tunnel, and one ping flag found out why.'
formats = ['war-story']
tags = ['networking', 'aws', 'tls']
+++

> [!NOTE] Design fixture
> Synthetic sample post used to check the site's design.

At 2:40 a.m. the pager said TLS handshakes were timing out, but only between two regions, and only for responses bigger than a few kilobytes. Health checks were green. Small requests were fine. This is the story of a 1500-byte assumption hiding in a tunnel, and the one `ping` flag that found it.

## What we saw

```console
$ ping -M do -s 1472 10.42.8.15
ping: local error: message too long, mtu=1436
$ ping -M do -s 1408 10.42.8.15
1436 bytes from 10.42.8.15: icmp_seq=1 ttl=62 time=71.4 ms
```

## Ruling out the obvious

DNS resolved. Security groups allowed 443. The load balancer saw the connection and then nothing. Everything that could be green was green.

## Path MTU discovery, briefly

When a packet is too big for a link and has the don't-fragment bit set, the router drops it and sends back an ICMP message saying how big it may be. If that ICMP message is blocked, the sender never learns, and large packets disappear without a trace.

## The fix

We allowed ICMP type 3 code 4 back through, and clamped MSS on the tunnel for good measure.

## What I'd check first next time

Any time small requests work and big ones hang, test the path MTU before anything else.
