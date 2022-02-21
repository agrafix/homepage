---
layout: note
title:  "HTTP Cookies"
date:   2021-11-13 19:05:51
tags:   note
permalink: /notes/http-cookies.html
---

# Localhost cookies not working?

Omit `domain` and `sameSite` when setting `localhost` cookies during development -- the browser will ignore the cookie entirely if set.
