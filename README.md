Nobel Media Player
==================

A touch-friendly web-based client and a WebSocket server using [Mopidy](https://github.com/mopidy/mopidy).

![Client screenshot](/client/img/nmp.png?raw=true)

This was built for my dorm's commonhouse bar where we have a touch-screen monitor. The server runs on the box that
is hooked up to our sound system.

Features
--------

As this is made for a specific purpose (parties) with a specific audience (drunk people), it has limited functionality.
Currently, it works kind of like the "Play Queue" in Spotify, with support for loading playlists and searching.

There is also an "admin mode". This is usually turned off during our parties.

With admin mode off, you can:
*   Play/Pause
*   Control (Mopidy's) volume
*   Toggle fullscreen
*   Search and add single songs (at a time)
*   Load playlists and add single songs from them

With admin mode on, you can also:
*   Clear the tracklist
*   Shuffle the tracklist
*   Change to a specific song in the tracklist
*   Click the Next button
*   Add entire playlists to the tracklist.

Features on the todo list:
*   Make admin mode completely server-side with checks on each function
*   Make an aditional mode called "party mode".
    This will replace admin mode so when it's on,
    you lose the privileges of admin mode.
    The new admin mode can change the password of party mode
    among other things.


What you need to use this:
--------------------------

* A server box with [Mopidy](https://github.com/mopidy/mopidy) and [Node JS](http://nodejs.org/) installed
* A client with a web browser on the same network as the server

On your server box, configure Mopidy (usually `~/.config/mopidy/mopidy.conf`) to log in to Spotify and enable the HTTP backend:

    [spotify]
    enabled = true
    username = user
    password = pass

    [http]
    enabled = true
    hostname = 127.0.0.1
    port = 6680

**Note:** *You need a Spotify Premium account.*

In the future, the client and server will be combined so a webserver is not needed.
After this, you need to configure the client to connect to the correct port.
You can do this in `client/js/app.js` on the first line.

Now, all you need to do is start the server script with Node: `node server/server.js` (depending on where you put the server).