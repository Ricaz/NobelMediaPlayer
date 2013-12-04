#!/usr/bin/node
var sys =       require('sys');
var util =      require('util');
var exec =      require('child_process').exec;
var srv =       require('socket.io').listen(8080);
var Mopidy =    require('mopidy').Mopidy;

var password = 1337;
var revision;

var mopidy = new Mopidy({
	webSocketUrl: 'ws://localhost:6680/mopidy/ws/',
	autoConnect: true
});

srv.set('log level', 0);
var consoleError = console.error.bind(console);

exec("svn info " + __dirname +  " | grep 'Revision: ' | cut -d' ' -f2", function(err, stdout, stderr) {
    revision = stdout.replace(/[^0-9]/g, "");
    console.log('Revision: ', revision);
});

srv.sockets.on('connection', function (socket) {

    socket.adminmode = false;
    socket.ip = socket.handshake.address.address + ":" + socket.handshake.address.port;

    console.log('Client connected from:', socket.ip, ". Assigning ID:", socket.id);

    console.log('Sending revision: ', revision);
    socket.emit('revision', revision);

    socket.on('request-revision', function() {
        socket.emit('revision', revision);
    });

    socket.on('request-admin', function(pass) {
        console.log(socket.id + ' sent pass ', pass);
        if (pass == password) socket.adminmode = true;
        else socket.adminmode = false;
        console.log('Sending adminmode ', socket.adminmode, ' to client ', socket.id);
        socket.emit('adminmode', socket.adminmode);
    });

    socket.on('request-shuffle',function() {
        console.log(socket.id + ' wants to shuffle!');
        mopidy.tracklist.shuffle(1);
    });

    socket.on('request-current', function(e, data) {
        console.log(socket.id + ' asked for current song.');
        // Because this is done asynchronously, we 'bind' a function to be called when we get a response from Mopidy.
        mopidy.playback.getCurrentTlTrack().then(
            function (track) {
                socket.emit('current', track);
            }, consoleError
        );
    });

	socket.on('request-tracklist', function (e, data) {
		console.log(socket.id + ' asked for current tracklist.');
        mopidy.tracklist.getTlTracks().then(
            function(tracks) {
                socket.emit('tracklist', tracks);
            }, consoleError
        );
	});

    socket.on('request-clear', function (data) {
        console.log(socket.id + ' wants to clear tracklist.');
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
        console.log(socket.id + ' requested playlists.');
        mopidy.playlists.getPlaylists().then(
            function(playlists) {
                socket.emit('playlists', playlists);
            }, consoleError
        )
    });

    socket.on('request-add-playlist', function(data) {
        console.log(socket.id + ' requested to load playlist: ' + data.uri);
        mopidy.tracklist.add(null, null, data).then(
            mopidy.tracklist.getTlTracks().then(
                function(tracks) {
                    socket.emit('tracklist', tracks);
                }, consoleError
            ), consoleError
        )
    });

    socket.on('request-add-playlist-to-account', function(uri) {
        console.log(socket.id + ' requested to add playlist:', uri);
        mopidy.playlists.lookup(uri).then(
            function (playlist) {
                console.log(socket.id + ' wants to add:', playlist);
            }
        );
    });

    socket.on('request-playlist', function (data) {
        console.log(socket.id + ' requested playlist: ' + data.uri);
        mopidy.playlists.lookup(data).then(
            function (playlist) {
                socket.emit('playlist', playlist);
            }, consoleError
        )
    });

    // very messy :(
    // Basically: if song is added and nothing is currently playing, play first song in tracklist.
    socket.on('request-add-song', function(uri) {
        console.log(socket.id + ' requested to add: ' + uri);
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
                    console.log('Track is not in tracklist, adding...');
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
		console.log(socket.id + ' wants to change song to: ', data);

        mopidy.tracklist.index(data).then(function(i) {
            console.log('index:', i);
            mopidy.tracklist.move(i,i,1).then(function() {
                mopidy.tracklist.slice(0, 1).then(
                    function (slice) {
                        var slicetlid = [];
                        for (var i = 0; i < slice.length; i++) {
                            slicetlid.push(slice[i].tlid);
                        }
                        console.log('Removing:', slicetlid);
                        mopidy.tracklist.remove({tlid: slicetlid});
                        mopidy.playback.play(data);
                    }, consoleError
                );
            });
        });

	});

    socket.on('request-remove', function (track) {
        console.log(socket.id + ' wants to remove:', track.tlid);
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
        console.log(socket.id + ' wants to pause.');
        mopidy.playback.pause().then(function() {
                socket.emit('song-pause')
            }, consoleError
        );
    });

	socket.on('request-next', function (e, data) {
		console.log(socket.id + ' wants to skip to next song.');
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
		console.log(socket.id + ' wants to play previous song.');
        mopidy.playback.previous().then(
            mopidy.playback.getCurrentTlTrack().then(
                function (track) {
                    socket.emit('current', track);
                }, consoleError
            ), consoleError
        );
	});

    socket.on('request-current-time', function () {
        mopidy.playback.getTimePosition().then(
            function (milliseconds) {
                socket.emit('current-time', milliseconds);
            }, consoleError
        );
    });

    socket.on('request-search', function (data) {
        console.log('Received search string:', data);
        mopidy.library.search({any: data}, uris=['spotify:']).then(
            function (result) {
                console.log('Received search result!');
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
        console.log(socket.id + ' wants to set volume:', volume);
        mopidy.playback.setVolume(volume);
    });

    socket.on('request-volume', function () {
        console.log(socket.id + ' wants to get volume.');
        var vol = mopidy.playback.getVolume().then(function (volume) {
            console.log('Sending volume ' + volume + ' to client ' + socket.id);
            socket.emit('volume', volume);
        });
    });

});

mopidy.on('state:online', function() {
	console.log('Connected to Mopidy.');
    mopidy.tracklist.setConsume(true);

    mopidy.on('event:trackPlaybackStarted', function (track, time) {
        console.log('Mopidy: Playback started.');
        track = track.tl_track;
        srv.sockets.clients().forEach(function (socket) {
            console.log('Sending current and resume to client ' + socket.id);
            socket.emit('current', track);
            socket.emit('song-resume', time);
        });

        /*mopidy.tracklist.index(track).then(
            function (index) {
                console.log('Attempting to slice from 0 to', index);
                mopidy.tracklist.slice(0, index).then(
                    function (slice) {
                        var slicetlid = [];
                        for (var i = 0; i < slice.length; i++) {
                            slicetlid.push(slice[i].tlid);
                        }
                        console.log('Removing:', slicetlid);
                        mopidy.tracklist.remove({tlid: slicetlid});
                        *//**//*console.log('Songs to remove:', slice.length);
                        for (var i = 0; i < slice.length; i++) {
                            console.log('Removing', slice[i].tlid);
                            mopidy.tracklist.remove({tlid: slice[i].tlid});
                        }*//**//*
                    }, consoleError
                );
            }
        );*/

    });

    mopidy.on('event:trackPlaybackPaused', function (track, time) {
        console.log('Mopidy: Playback paused.');
        srv.sockets.clients().forEach(function (socket) {
            console.log('Sending pause to client ' + socket.id);
            socket.emit('song-pause');
        });

    });

    mopidy.on('event:trackPlaybackResumed', function (track, time) {
        console.log('Mopidy: Playback resumed.');
        srv.sockets.clients().forEach(function (socket) {
            console.log('Sending resumed to client ' + socket.id);
            socket.emit('song-resume', time);
        });
    });

    mopidy.on('event:seeked', function (time) {
        console.log('Mopidy: Playback seeked.');
        srv.sockets.clients().forEach(function (socket) {
            console.log('Sending seeked to client ' + socket.id);
            socket.emit('current-time', time.time_position);
        });
    });

    mopidy.on('event:tracklistChanged', function () {
        mopidy.tracklist.getTlTracks().then(
            function (tracks) {
                srv.sockets.clients().forEach(function (socket) {
                    console.log('Sending tracklist to client ' + socket.id);
                    socket.emit('tracklist', tracks);
                });
            }, consoleError
        );
    });

    mopidy.on('event:volumeChanged', function(volume) {
        srv.sockets.clients().forEach(function (socket) {
            console.log('Sending volume to client ' + socket.id);
            socket.emit('volume', volume);
        });
    })
});

mopidy.on('state:offline', function() {
	console.log('Disconnected from Mopidy.');
});
