Nobel Media Player
==================

A web-based client and a WebSocket server using [Mopidy](https://github.com/mopidy/mopidy).

This was built for my dorm's commonhouse bar where we have a touch-screen monitor. The server runs on the box that
is hooked up to our sound system.



### What you need to use this:

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

*Note:* You need a Spotify Premium account.
