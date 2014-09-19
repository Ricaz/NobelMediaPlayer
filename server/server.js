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

exec("svn info " + __dirname +  " | grep 'Revision: ' | cut -d' ' -f2", function(err, stdout) {
    revision = stdout.replace(/[^0-9]/g, "");
});

revision = '40';

srv.sockets.on('connection', function (socket) {

    socket.adminmode = false;
    socket.ip = socket.handshake.address.address;

    logC(socket.id, 'Client connected from ' + socket.ip, 'green');

    logC(socket.id, 'Sending revision.');
    socket.emit('revision', revision);

    socket.on('request-revision', function() {
        socket.emit('revision', revision);
    });

    socket.on('disconnect', function() {
        logC(socket.id, 'Disconnected.', 'red');
    });

    socket.on('request-admin', function(pass) {
        logC(socket.id, 'sent pass: '+ pass);
        socket.adminmode = pass == password;
        logC(socket.id, 'Sending adminmode ' + socket.adminmode + ' to client.');
        socket.emit('adminmode', socket.adminmode);
    });

    socket.on('request-shuffle',function() {
        logC(socket.id, 'wants to shuffle.');
        mopidy.tracklist.shuffle(1);
    });

    socket.on('request-current', function(e, data) {
        logC(socket.id, 'asked for current song.');
        // Because this is done asynchronously, we 'bind' a function to be called when we get a response from Mopidy.
        mopidy.playback.getCurrentTlTrack().then(
            function (track) {
                socket.emit('current', track);
            }, consoleError
        );
    });

	socket.on('request-tracklist', function (e, data) {
		logC(socket.id, 'asked for current tracklist.');
        mopidy.tracklist.getTlTracks().then(
            function(tracks) {
                socket.emit('tracklist', tracks);
            }, consoleError
        );
	});

    socket.on('request-clear', function (data) {
        logC(socket.id, 'wants to clear tracklist.');
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
        logC(socket.id, 'requested playlists.');
        mopidy.playlists.getPlaylists().then(
            function(playlists) {
                socket.emit('playlists', playlists);
            }, consoleError
        )
    });

    socket.on('request-add-playlist', function(data) {
        logC(socket.id, 'requested to load playlist: ' + data.uri);
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
        logC(socket.id, 'requested to add playlist: ' + uri);
        mopidy.playlists.lookup(uri).then(
            function (playlist) {
                logC(socket.id, 'wants to add: ' + playlist);
            }
        );
    });

    socket.on('request-playlist', function (data) {
        logC(socket.id, 'requested playlist: ' + data.uri);
        mopidy.playlists.lookup(data).then(
            function (playlist) {
                socket.emit('playlist', playlist);
            }, consoleError
        )
    });

    // very messy :(
    // Basically: if song is added and nothing is currently playing, play first song in tracklist.
    socket.on('request-add-song', function(uri) {
        logC(socket.id, 'requested to add: ' + uri);
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
        logC(socket.id, 'wants to change song to:' + data);

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
        logC(socket.id, 'wants to remove: ' + track.tlid);
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
        logC(socket.id, 'wants to pause.');
        mopidy.playback.pause().then(function() {
                socket.emit('song-pause')
            }, consoleError
        );
    });

	socket.on('request-next', function (e, data) {
		logC(socket.id, 'wants to skip to next song.');
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
		logC(socket.id, 'wants to play previous song.');
        mopidy.playback.previous().then(
            mopidy.playback.getCurrentTlTrack().then(
                function (track) {
                    socket.emit('current', track);
                }, consoleError
            ), consoleError
        );
	});

    socket.on('request-current-time', function () {
        logC(socket.id, 'requested current time.');
        mopidy.playback.getTimePosition().then(
            function (milliseconds) {
                socket.emit('current-time', milliseconds);
            }, consoleError
        );
    });

    socket.on('request-search', function (data) {
        logC(socket.id, 'Received search string: ' + data);
        mopidy.library.search({any: data}, uris=['spotify:']).then(
            function (result) {
                console.log('['.yellow, '        SERVER      '.white, ']'.yellow, 'Received search result.');
                if (result) {
                    var tracks = result[0].tracks;
                    socket.emit('search-result', tracks);
                } else {
                    console.log('Search result == null');
                }
            }, consoleError
        );
    });

    socket.on('request-set-volume', function (volume) {
        logC(socket.id, 'wants to set volume: ' + volume);
        mopidy.playback.setVolume(volume);
    });

    socket.on('request-volume', function () {
        logC(socket.id, 'wants to get volume.');
        var vol = mopidy.playback.getVolume().then(function (volume) {
            logC(socket.id, 'Sending volume ' + volume + ' to client.');
            socket.emit('volume', volume);
        });
    });

});

mopidy.on('state:online', function() {
    logM('Connected.', 'green');
    mopidy.tracklist.setConsume(true);

    mopidy.on('event:trackPlaybackStarted', function (track, time) {
        logM('Playback started.');
        logA('Sending playback started.');
        track = track.tl_track;
        srv.sockets.emit('current', track);
        srv.sockets.emit('song-resume', time);
    });

    mopidy.on('event:trackPlaybackPaused', function (track, time) {
        logM('Playback paused.');
        srv.sockets.emit('song-pause');
        logA('Sending pause.');
    });

    mopidy.on('event:trackPlaybackResumed', function (track, time) {
        logM('Playback resumed.');
        logA('Sending resumed.');
        srv.sockets.emit('song-resume', time);
    });

    mopidy.on('event:seeked', function (time) {
        logM('Playback seeked.');
        logA('Sending seek.');
        srv.sockets.emit('current-time', time.time_position);
    });

    mopidy.on('event:tracklistChanged', function () {
        logM('Tracklist changed.');
        mopidy.tracklist.getTlTracks().then(
            function (tracks) {
                logA('Sending tracklist.');
                srv.sockets.emit('tracklist', tracks);
            }
        );
    });

    mopidy.on('event:volumeChanged', function(volume) {
        logM('Volume changed.');
        logA('Sending volume.');
        srv.sockets.emit('volume', volume);
    });
});

mopidy.on('state:offline', function() {
    logM('Disconnected.', 'red');
    srv.sockets.emit('mopidy-disconnect');
});

function logA(message, color) {
    if (color == 'green') console.log('['.yellow, '     All clients    '.white, ']'.yellow + ' ' + message.green);
    else if (color == 'red') console.log('['.yellow, '     All clients    '.white, ']'.yellow + ' ' + message.red);
    else console.log('['.yellow, '     All clients    '.white, ']'.yellow + ' ' + message);
}

function logM(message, color) {
    if (color == 'green') console.log('['.yellow, '        Mopidy      '.white, ']'.yellow + ' ' + message.green);
    else if (color == 'red') console.log('['.yellow, '        Mopidy      '.white, ']'.yellow + ' ' + message.red);
    else console.log('['.yellow, '        Mopidy      '.white, ']'.yellow + ' ' + message);
}

function logC(id, message, color) {
    if (color == 'green') console.log('['.yellow, id.white, ']'.yellow + ' ' + message.green);
    else if (color == 'red') console.log('['.yellow, id.white, ']'.yellow + ' ' + message.red);
    else console.log('['.yellow, id.white, ']'.yellow + ' ' + message);
}
