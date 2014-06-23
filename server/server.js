#!/usr/bin/node
var sys =       require('sys');
var util =      require('util');
var exec =      require('child_process').exec;
var srv =       require('socket.io').listen(8080);
var Mopidy =    require('mopidy');
var colors =    require('colors');

var password = 1337;
var revision;

var mopidy = new Mopidy({
	webSocketUrl: 'ws://localhost:6680/mopidy/ws/',
	autoConnect: true
});

var consoleError = console.error.bind(console);

exec("svn info " + __dirname +  " | grep 'Revision: ' | cut -d' ' -f2", function(err, stdout, stderr) {
    revision = stdout.replace(/[^0-9]/g, "");
});

srv.sockets.on('connection', function (socket) {

    socket.adminmode = false;
    socket.ip = socket.handshake.address.address;

    console.log('['.yellow, socket.id.white, ']'.yellow, 'Client connected from'.green, socket.ip);

    console.log('['.yellow, socket.id.white, ']'.yellow, 'Sending revision.');
    socket.emit('revision', revision);

    socket.on('request-revision', function() {
        socket.emit('revision', revision);
    });

    socket.on('disconnect', function() {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'Disconnected.'.red);
    });

    socket.on('request-admin', function(pass) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'sent pass: ', pass);
        if (pass == password) socket.adminmode = true;
        else socket.adminmode = false;
        console.log('['.yellow, socket.id.white, ']'.yellow, 'Sending adminmode ', socket.adminmode, 'to client.');
        socket.emit('adminmode', socket.adminmode);
    });

    socket.on('request-shuffle',function() {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'wants to shuffle.');
        mopidy.tracklist.shuffle(1);
    });

    socket.on('request-current', function(e, data) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'asked for current song.');
        // Because this is done asynchronously, we 'bind' a function to be called when we get a response from Mopidy.
        mopidy.playback.getCurrentTlTrack().then(
            function (track) {
                socket.emit('current', track);
            }, consoleError
        );
    });

	socket.on('request-tracklist', function (e, data) {
		console.log('['.yellow, socket.id.white, ']'.yellow, 'asked for current tracklist.');
        mopidy.tracklist.getTlTracks().then(
            function(tracks) {
                socket.emit('tracklist', tracks);
            }, consoleError
        );
	});

    socket.on('request-clear', function (data) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'wants to clear tracklist.');
        mopidy.tracklist.clear().then(
            mopidy.tracklist.getTlTracks().then(
                function(tracks) {
                    socket.emit('tracklist', tracks);
                    mopidy.playback.getCurrentTlTrack().then(
                        function (track) {
                            socket.emit('current', track);
                        }, consoleError
                    );
                }, consoleError
            ), consoleError
        )
    });

    socket.on('request-playlists', function (data) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'requested playlists.');
        mopidy.playlists.getPlaylists().then(
            function(playlists) {
                socket.emit('playlists', playlists);
            }, consoleError
        )
    });

    socket.on('request-add-playlist', function(data) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'requested to load playlist: ' + data.uri);
        mopidy.tracklist.add(null, null, data).then(
            mopidy.tracklist.getTlTracks().then(
                function(tracks) {
                    socket.emit('tracklist', tracks);
                }, consoleError
            ), consoleError
        )
    });

    // currently not in use, no support from Mopidy
    socket.on('request-add-playlist-to-account', function(uri) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'requested to add playlist:', uri);
        mopidy.playlists.lookup(uri).then(
            function (playlist) {
                console.log('['.yellow, socket.id.white, ']'.yellow, 'wants to add: ' + playlist);
            }
        );
    });

    socket.on('request-playlist', function (data) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'requested playlist: ' + data.uri);
        mopidy.playlists.lookup(data).then(
            function (playlist) {
                socket.emit('playlist', playlist);
            }, consoleError
        )
    });

    // very messy :(
    // Basically: if song is added and nothing is currently playing, play first song in tracklist.
    socket.on('request-add-song', function(uri) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'requested to add: ' + uri);
        var exists = false;
        mopidy.tracklist.getTracks().then(
            function(tracks) {
                for (var i = 0; i < tracks.length; i++) {
                    if (tracks[i].uri == uri) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    console.log('['.yellow, '        SERVER      '.white, ']'.yellow, 'Track not in tracklist, adding...');
                    mopidy.tracklist.add(null, null, uri).then(
                        function() {
                            mopidy.tracklist.getTlTracks().then(
                                function (tracks) {
                                    mopidy.playback.getState().then(
                                        function (state) {
                                            if (state == 'stopped') {
                                                mopidy.playback.getCurrentTlTrack().then(
                                                    function (track) {
                                                        if (!track) {
                                                            mopidy.playback.play(tracks[0]);
                                                        }
                                                    }
                                                );
                                            }
                                        }, consoleError
                                    )
                                }, consoleError
                            );

                        }, consoleError
                    );
                }
            }, consoleError
        );
    });

	socket.on('request-song-change', function (data) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'wants to change song to:', data);

        mopidy.tracklist.index(data).then(function(i) {
            console.log('['.yellow, '        SERVER      '.white, ']'.yellow, 'Index:', i);
            mopidy.tracklist.move(i,i,1).then(function() {
                mopidy.tracklist.slice(0, 1).then(
                    function (slice) {
                        var slicetlid = [];
                        for (var i = 0; i < slice.length; i++) {
                            slicetlid.push(slice[i].tlid);
                        }
                        console.log('['.yellow, '        SERVER      '.white, ']'.yellow, 'Removing:', slicetlid);
                        mopidy.tracklist.remove({tlid: slicetlid});
                        mopidy.playback.play(data);
                    }, consoleError
                );
            });
        });

	});

    socket.on('request-remove', function (track) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'wants to remove:', track.tlid);
        var arr = [];
        arr.push(track.tlid);
        mopidy.tracklist.remove({tlid: arr});
    });

    socket.on('request-state', function(e, data) {
        mopidy.playback.getState().then(
            function (state) {
                socket.emit('state', state);
            }, consoleError
        )
    });

    socket.on('request-play', function () {
        mopidy.playback.resume();
    });

    socket.on('request-pause', function () {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'wants to pause.');
        mopidy.playback.pause().then(function() {
                socket.emit('song-pause')
            }, consoleError
        );
    });

	socket.on('request-next', function (e, data) {
		console.log('['.yellow, socket.id.white, ']'.yellow, 'wants to skip to next song.');
        // First ask mopidy to change song. On success, send back the new song.
        mopidy.playback.getCurrentTlTrack().then(
            function(prevTrack) {
                mopidy.playback.next().then(
                    mopidy.playback.getCurrentTlTrack().then(
                        function (track) {
                            mopidy.tracklist.remove({tlid: [prevTrack.tlid]});
                            socket.emit('current', track);
                        }
                    )
                )
            }
        )
	});

	socket.on('request-previous', function (e, data) {
		console.log('['.yellow, socket.id.white, ']'.yellow, 'wants to play previous song.');
        mopidy.playback.previous().then(
            mopidy.playback.getCurrentTlTrack().then(
                function (track) {
                    socket.emit('current', track);
                }, consoleError
            ), consoleError
        );
	});

    socket.on('request-current-time', function () {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'requested current time.');
        mopidy.playback.getTimePosition().then(
            function (milliseconds) {
                socket.emit('current-time', milliseconds);
            }, consoleError
        );
    });

    socket.on('request-search', function (data) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'Received search string: ', data);
        mopidy.library.search({any: data}, uris=['spotify:']).then(
            function (result) {
                console.log('['.yellow, '        SERVER      '.white, ']'.yellow, 'Received search result.');
                if (result) {
                    var tracks = result[0].tracks;
                    socket.emit('search-result', tracks);
                } else {
                    console.log('Result == null');
                }
            }, consoleError
        );
    });

    socket.on('request-set-volume', function (volume) {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'wants to set volume:', volume);
        mopidy.playback.setVolume(volume);
    });

    socket.on('request-volume', function () {
        console.log('['.yellow, socket.id.white, ']'.yellow, 'wants to get volume.');
        var vol = mopidy.playback.getVolume().then(function (volume) {
            console.log('['.yellow, socket.id.white, ']'.yellow, 'Sending volume ' + volume + ' to client.');
            socket.emit('volume', volume);
        });
    });

});

mopidy.on('state:online', function() {
    console.log('['.yellow, '        Mopidy      '.white, ']'.yellow, 'Connected.'.green);
    mopidy.tracklist.setConsume(true);

    mopidy.on('event:trackPlaybackStarted', function (track, time) {
        console.log('['.yellow, '        Mopidy      '.white, ']'.yellow, 'Playback started.');
        console.log('['.yellow, '     All clients    '.white, ']'.yellow, 'Sending playback started.');
        track = track.tl_track;
        srv.sockets.emit('current', track);
        srv.sockets.emit('song-resume', time);
    });

    mopidy.on('event:trackPlaybackPaused', function (track, time) {
        console.log('['.yellow, '        Mopidy      '.white, ']'.yellow, 'Playback paused.');
        srv.sockets.emit('song-pause');
        console.log('['.yellow, '     All clients    '.white, ']'.yellow, 'Sending pause.');
    });

    mopidy.on('event:trackPlaybackResumed', function (track, time) {
        console.log('['.yellow, '        Mopidy      '.white, ']'.yellow, 'Playback resumed.');
        console.log('['.yellow, '     All clients    '.white, ']'.yellow, 'Sending resumed.');
        srv.sockets.emit('song-resume', time);
    });

    mopidy.on('event:seeked', function (time) {
        console.log('['.yellow, '        Mopidy      '.white, ']'.yellow, 'Playback seeked.');
        console.log('['.yellow, '     All clients    '.white, ']'.yellow, 'Sending seek.');
        srv.sockets.emit('current-time', time.time_position);
    });

    mopidy.on('event:tracklistChanged', function () {
        console.log('['.yellow, '        Mopidy      '.white, ']'.yellow, 'Tracklist changed.');
        mopidy.tracklist.getTlTracks().then(
            function (tracks) {
                console.log('['.yellow, '     All clients    '.white, ']'.yellow, 'Sending tracklist.');
                srv.sockets.emit('tracklist', tracks);
            }
        );
    });

    mopidy.on('event:volumeChanged', function(volume) {
        console.log('['.yellow, '        Mopidy      '.white, ']'.yellow, 'Volume changed.');
        console.log('['.yellow, '     All clients    '.white, ']'.yellow, 'Sending volume.');
        srv.sockets.emit('volume', volume);
    });
});

mopidy.on('state:offline', function() {
    console.log('['.yellow, '        Mopidy      '.white, ']'.yellow, 'Disconnected.'.red);
    srv.sockets.emit('mopidy-disconnect');
});
