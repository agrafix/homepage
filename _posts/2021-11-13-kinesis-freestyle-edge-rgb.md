---
layout: note
title:  "Kinesis Freestyle Edge RBG"
date:   2021-11-13 13:34:09
tags:   note
permalink: /notes/kinesis-freestyle-edge-rgb.html
---

I use a [Kinesis Freestyle Edge RBG](https://gaming.kinesis-ergo.com/product/freestyle-edge/) for my day to day work and coding. I'm using it with a fully extended lift kit to tent the keyboard by 15 degrees.

# 30 second delay after plugging in

I noticed that after plugging in my keyboard it was unresponsive for about 30 seconds and the LEDs where turned off. I reached out to their support, and their suggested fix worked:

 1. Backup your layout[1-9].txt file(s) in the `layouts/` folder.
 2. Press [SmartSet+shift+ctrl+f] and wait a moment.
 3. Mount the V-Drive with [SmartSet+F8] and rename it back to _FS EDGE RGB_.
 4. Move the layout files from the backup back into the `layouts/` folder.
 5. Eject the V-Drive and immediately dismount it with [SmartSet+F8].

# manual programming

[full instructions](https://www.7day.nl/ergowerken/Kinesis/edge/programming-guide.pdf)

- Use (gear)+F8 to mount vdrive
- Then edit the files below
- Then eject and quickly press (gear)+F8 again


## layout 

`layouts/layout1.txt` (mac layout)

```
[lwin]>[lalt]
[lalt]>[lwin]
[ralt]>[rwin]
```

## lightning

`lighting/led1.txt` (white > blue) 

```
[mono]>[255][255][255]
fn [mono]>[0][0][255]
```
