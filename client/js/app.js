var host = 'http://localhost:8080/';
var client = io.connect(host);

var currentPage;
var currentState;
var currentSong;
var currentTime;
var currentPercentage;
var tracklist;
var connectTimer;
var timer;
var adminmode = false;
var volume = 0;
var slider;
var playlistDisplaying = false;

var version = '0.1';

client = io.connect(host);

client.on('connect', function () {
    clearInterval(connectTimer);
    console.log('Connected to WS host: ', host);
    $('.connection-status').html('Connected');


    // Start off by loading the default (music) page.
    loadTracklistPage();
    requestGlobals();

    // Add listeners for all the events the server will send
    client.on('revision', function(data) {
        $('.revision').html('v' + version + '.' + data);
    });

    client.on('adminmode', function(data) {
        console.log('Received adminmode:', data);
        if (data) login();
        else logout();
    });

    // Tracklist is received
    client.on('tracklist', function (data) {
        console.log('Received tracklist: ', data);
        updateTracklist(data);
    });

    // Currently playing song is received
    client.on('current', function (data) {
        console.log('Received current: ', data);
        updateCurrent(data);
    });

    // Time on playing song is received
    client.on('current-time', function (data) {
        console.log('Received current time: ', data);
        handleCurrentTime(data);
    });

    // List of playlists received
    client.on('playlists', function (data) {
        console.log('Received playlists:', data);
        updatePlaylists(data);
    });

    // One playlist received
    client.on('playlist', function (data) {
        console.log('Received playlist:', data);
        handlePlaylistResult(data);
    });

    // When volume is received
    client.on('volume', function(data) {
        console.log('Received volume:', data);
        handleVolume(data);
    });

    // State of playback is received (playing, paused, stopped)
    client.on('state', function (data) {
        console.log('Received state: ', data);
        handleState(data);
    });

    // Song is removed
    client.on('song-remove', function (data) {
        console.log('Song removed: ', data);
    });

    // Current song is paused
    client.on('song-pause', function () {
        console.log('Received pause');
        clearInterval(timer);
        handleState('paused');
    });

    // Current song is resumed
    client.on('song-resume', function () {
        console.log('Received resume');
        handleState('playing');
        client.emit('request-current-time');
    });

    // Song is played (???)
    client.on('song-play', function () {
        console.log('Received play');
        handleState('playing');
    });

    // Search result (list of tracks) received
    client.on('search-result', function (data) {
        console.log('Received search result:', data);
        handleSearchResult(data);
    });

    client.on('disconnect', function () {
        console.log('Disconnected from WS host: ', host);
        $('.connection-status').html('Disconnected');

		removeListeners();
    });
});


function removeListeners() {
	client.removeAllListeners('revision');
	client.removeAllListeners('adminmode');
	client.removeAllListeners('tracklist');
	client.removeAllListeners('current');
	client.removeAllListeners('current-time');
	client.removeAllListeners('playlists');
	client.removeAllListeners('playlist');
	client.removeAllListeners('volume');
	client.removeAllListeners('state');
	client.removeAllListeners('song-remove');
	client.removeAllListeners('song-pause');
	client.removeAllListeners('song-resume');
	client.removeAllListeners('song-play');
	client.removeAllListeners('search-result');
	client.removeAllListeners('disconnect');
}

// appearantly I still suck at js
// when a page is loaded, unbind ALL events.
// then add events on global buttons
function fixEvents() {
    playlistDisplaying = false;
    clearInterval(connectTimer);
    $.keyboard.keyaction.enter = function (base) {
        base.accept();      // accept the content
        $('.btn-admin-submit').click(); // submit form on enter
        $('#loginModal').modal('hide');
    };
    $('.admin-password').keyboard({
        accepted: function() {
            $('.btn-admin-submit').click(); // submit form on enter
            $('#loginModal').modal('hide');
        }
    });
    // unbind all click eventhandlers
    $('*', document).unbind('click');

    $('.btn-next').click(function () {
        console.log('Going to next song...');
        client.emit('request-next');
    });

    $('.btn-play').click(function () {
        if (currentState == 'playing') {
            console.log('Pausing...');
            client.emit('request-pause');
        } else {
            console.log('Playing...');
            client.emit('request-play');
        }
    });

    $('.btn-clear').click(function (e) {
        if (adminmode) {
            console.log('Requesting to clear tracklist...');
            client.emit('request-clear');
        } else {
            $('#loginModal').modal('show');
        }
    });

    $('.btn-admin-submit').click(function () {
        var pass = $('.admin-password').val();
        console.log('Trying pass: ' + pass + '...');
        client.emit('request-admin', pass);
        $('#loginModal').modal('hide');
    });

    $('.btn-tracklist').click(function () {
        $('.nav li').removeClass('active');
        $(this).addClass('active');
        loadTracklistPage();
    });

    $('.btn-library').click(function () {
        $('.nav li').removeClass('active');
        $(this).addClass('active');
        loadLibraryPage();
    });

    $('.btn-refresh').click(function () {
        location.reload();
    });

    $('.btn-shuffle').click(function() {
        client.emit('request-shuffle');
    });

    $('.btn-fullscreen').click(function() {
        if (getFullscreen()) setFullScreen(true);
        else setFullScreen(false);
    });

    slider = $('#slider').slider({
        min: 0,
        max: 100,
        step: 5,
        value: volume
    });

    // TODO: Find a more reliable way of getting the value
    // (right now it divides by 2 because the element is 200px wide)
    slider.off('slideStop');
    slider.on('slideStop', function () {
        volume = $('.slider-selection').width() / 2;
        //volume = slider.slider('setValue', volume);
        console.log('Volume slid to:', volume);
        client.emit('request-set-volume', volume);
    });

}

function requestGlobals() {
    client.emit('request-current');
    client.emit('request-state');
    client.emit('request-volume');
}

// Loads the page from sections.php, and binds events on its buttons.
function loadTracklistPage() {
    console.log('Loading tracklist page...');
    $('.content').hide().empty().load('sections.html #tracklist', function () {
        currentPage = 'tracklist';
        client.emit('request-tracklist');

        $('.content').fadeIn(300);

        fixEvents();
        handleAdminMode();

        // TEMPORARY FIX
        // somehow fixEvents() won't remove these events..
        $(document).off('click', '.table.tracklist tbody tr:not(:first) td');

        $(document).on('click', '.table.tracklist tbody tr:not(:first) td', function () {
            if (!$(this).hasClass('delete')) {
                if (adminmode) {
                    console.log(this, 'was clicked.');
                    var track = getTrackByID($(this).parent().attr('id'));
                    if (track !== 'undefined') {
                        console.log('Sending:', track);
                        client.emit('request-song-change', track);
                    }
                } else {
                    $('#loginModal').modal('show');
                }
            } else {
                if (adminmode) {
                    var track = getTrackByID($(this).parent().attr('id'));
                    console.log('Deleting track:', track);
                    client.emit('request-remove', track);
                } else {
                    $('#loginModal').modal('show');
                }
            }
        });

    });

}

function loadLibraryPage() {
    currentPage = 'library';
    console.log('Loading library page...');
    $('.content').hide().empty().load('sections.html #library', function () {
        // This happens after the AJAX request
        $('.btn-append-playlist').hide();
        playlistDisplaying = false;

        client.emit('request-playlists');

        $('.content').fadeIn(300);

        fixEvents();
        handleAdminMode();

        // Create new events
        $(document).on('click', '.btn-search', function () {
            var search = $(this).parent().parent().find('.input-search').val();

            console.log('Searching for', search);
            client.emit('request-search', search);
        });

        $(document).on('click', '.btn-load-playlist', function (e) {
            var uri = $(this).attr('data-uri');
            console.log('Requesting to add playlist with uri: ' + uri);
            client.emit('request-load-playlist', uri);
        });

        // settings for the touch keyboard
        $.keyboard.keyaction.enter = function (base) {
            base.accept();      // accept the content
            $('.btn-search').click(); // submit form on enter
        };

        $('.input-search').keyboard();
        console.log($('.input-search'));

        handleAdminMode();
    });
}

function handleState(state) {
    currentState = state;
    if (currentState == 'playing') {
        $('.btn-play .glyphicon').removeClass('glyphicon-play').addClass('glyphicon-pause');
    } else if (currentState == 'paused' || currentState == 'stopped') {
        $('.btn-play .glyphicon').removeClass('glyphicon-pause').addClass('glyphicon-play');
    }
}

// Fired when search result is received
function handleSearchResult(result) {
    if (!$.isEmptyObject(result)) {
        $('.search-results tbody').empty();
        for (var i = 0; i < result.length; i++) {
            var artists = '';
            if (result[i].artists.length > 1) {
                for (var n = 0; n < result[i].artists.length; n++) {
                    artists += result[i].artists[n].name + ', ';
                }
                if (artists.substring(artists.length - 1) == ' ') {
                    artists = artists.substring(0, artists.length - 1);
                }
                if (artists.substring(artists.length - 1) == ',') {
                    artists = artists.substring(0, artists.length - 1);
                }
            } else {
                artists = result[i].artists[0].name;
            }

            $('.search-results tbody').append(
                '<tr data-uri="' + result[i].uri + '">' +
                    '<td>' + crop(artists) + '</td>' +
                    '<td>' + crop(result[i].name) + '</td>' +
                    '</tr>'
            );
        }
        $(document).off('click', '.table.search-results tbody tr');
        $(document).on('click', '.table.search-results tbody tr', function (e) {
            var uri = $(this).attr('data-uri');
            if (uri !== 'undefined') {
                console.log('Sending:', uri);
                client.emit('request-add-song', uri);

                console.log('Notification opened.');
                $.pnotify({
                    title: 'Song added!',
                    text: 'Success!',
                    delay: 1000,
                    animate_speed: 'fast'
                });
            }
        });
    }
}

function handleCurrentTime(time) {
    clearInterval(timer);
    currentTime = time;
    if (currentSong !== null) {
        currentPercentage = (currentTime / currentSong.track.length) * 100;
        $('.current-time').html(readableTime(currentTime));
        $('.progress-bar').attr('aria-valuenow', currentPercentage).css('width', currentPercentage + '%');
        if (currentState == 'playing') {
            timer = setInterval(function () {
                currentTime = currentTime + 100;
                currentPercentage = (currentTime / currentSong.track.length) * 100;
                $('.progress-bar').attr('aria-valuenow', currentPercentage).css('width', currentPercentage + '%');
                $('.current-time').html(readableTime(currentTime));
            }, 100);
        }
    } else {

    }
}

function handleVolume(val) {
    volume = val;
    slider.slider('setValue', volume);
}

function updateCurrent(e) {
    client.emit('request-current-time');
    currentSong = e;
    if (currentSong) {
        $('.song-artist').html(currentSong.track.artists[0].name);
        $('.song-title').html(currentSong.track.name);
        $('.currently-playing').html(
            '<span class="yellow">' +
                currentSong.track.artists[0].name +
                '</span> - <span class="yellow">' +
                currentSong.track.name +
                '</span>'
        );
        $('.total-time').html(readableTime(currentSong.track.length));
    } else {
        $('.song-artist').html('No song playing.');
        $('.song-title').html('');
    }
}

function updateTracklist(tracks) {
    tracklist = tracks;
    if (!$.isEmptyObject(tracklist)) {
        $('.tracklist-empty').hide();
        $('.table.tracklist').show();

        $('.table.tracklist tbody').empty();
        $(tracks).each(function (i, track) {
            $(track).each(function (i, item) {
                $('.table.tracklist tbody').append(
                    '<tr id="' + item.tlid + '">' +
                        '<td>' + crop(item.track.artists[0].name) + '</td>' +
                        '<td>' + crop(item.track.name) + '</td>' +
                        '<td>' + readableTime(item.track.length) + '</td>' +
                        '<td class="delete"><span id=' + i + ' class="btn btn-xs btn-danger btn-delete">Remove</span></td>' +
                        '</tr>'
                ).parent().show();
            });
        });

        $('.table.tracklist tr:first-child td.delete span').remove();

        // Drag & drop
        var indexes = [];
        $('.table.tracklist').sortable({
            containerSelector: 'table',
            itemPath: '> tbody',
            itemSelector: 'tr',
            placeholder: '<tr class="placeholder"/>',
            delay: 500,
            onMousedown: function (item, _super, event) {
                if (!event.target.nodeName.match(/^(input|select)$/i) && !$(item).is(':first-child')) {
                    event.preventDefault()
                    return true
                }
            },
            onDragStart: function (item, container, _super, event) {
                indexes[0] = $(item).closest('tr').prevAll().length;

                item.css({
                    height: item.height(),
                    width: item.width()
                })
                item.addClass("dragged")
                $("body").addClass("dragging")
            },
            onDrop: function (item) {
                item.removeClass("dragged").removeAttr("style");
                $("body").removeClass("dragging");
                indexes[1] = $(item).closest('tr').prevAll().length;
                console.log('drag:', indexes);

                client.emit('request-move', indexes);
            }
        });

        handleAdminMode();
    } else {
        $('.table.tracklist').hide();
        $('.tracklist-empty').show();
    }
}

function updatePlaylists(playlists) {
    if (playlists) {
        $('.playlists tbody').empty();
        $(playlists).each(function (i, playlist) {
            playlist.name = playlist.name.split('by')[0].trim();
            if (playlist.name !== 'Starred') {
                $('.playlists tbody').append(
                        '<tr><td class="btn-load-playlist" data-uri="' + playlist.uri + '">' + playlist.name + '</td></tr>'
                );
            }

        });
    }

    $(document).off('click', '.btn-load-playlist');
    $(document).on('click', '.btn-load-playlist', function () {
        var uri = $(this).attr('data-uri');
        client.emit('request-playlist', uri);
    });
}

function handlePlaylistResult(result) {
    if (!$.isEmptyObject(result)) {
        playlistDisplaying = true;
        var tracks = result.tracks;
        $('.search-results tbody').empty();
        for (var i = 0; i < tracks.length; i++) {
            var artists = '';
            if (tracks[i].artists.length > 1) {
                for (var n = 0; n < tracks[i].artists.length; n++) {
                    artists += tracks[i].artists[n].name + ', ';
                }
                if (artists.substring(artists.length - 1) == ' ') {
                    artists = artists.substring(0, artists.length - 1);
                }
                if (artists.substring(artists.length - 1) == ',') {
                    artists = artists.substring(0, artists.length - 1);
                }
            } else {
                artists = tracks[i].artists[0].name;
            }

            $('.search-results tbody').append(
                '<tr data-uri="' + tracks[i].uri + '">' +
                    '<td>' + crop(artists) + '</td>' +
                    '<td>' + crop(tracks[i].name) + '</td>' +
                    '</tr>'
            );
        }
        if (adminmode) {
            $('.btn-append-playlist').show();
            $(document).off('click', '.btn-append-playlist');
            $(document).on('click', '.btn-append-playlist', function() {
                console.log('Adding entire playlist...', result.uri);
                client.emit('request-add-playlist', result.uri);
            });
        } else {
            $('.btn-append-playlist').hide();
        }
        $(document).off('click', '.table.search-results tbody tr');
        $(document).on('click', '.table.search-results tbody tr', function () {
            var uri = $(this).attr('data-uri');
            if (uri !== 'undefined') {
                console.log('Sending:', uri);
                client.emit('request-add-song', uri);

                console.log('Notification opened.');
                $.pnotify({
                    title: 'Song added!',
                    text: 'Success!',
                    delay: 1000,
                    animate_speed: 'fast'
                });
            }
        });
    }
}

function logout() {
    $.cookie('adminmode', 'no');
    adminmode = false;
    handleAdminMode();
}

function login() {
    $.cookie('adminmode', 'yes');
    adminmode = true;
    handleAdminMode();
}

function handleAdminMode() {
    adminmode = $.cookie('adminmode') == 'yes';
    if (adminmode) {
        if (playlistDisplaying) $('.btn-append-playlist').show();
        $('.btn-clear').show();
        $('.btn-delete').show();
        $('.btn-shuffle').show();
        $('.btn-admin > a').html('Admin mode: ON');
        $('.btn-admin').off('click');
        $('.btn-admin').on('click', function() {
            console.log('logging out..');
            client.emit('request-admin', 'asd');
        });

    } else {
        $('.btn-append-playlist').hide();
        $('.btn-clear').hide();
        $('.btn-delete').hide();
        $('.btn-shuffle').hide();
        $('.btn-admin > a').html('Admin mode: OFF');
        $('.admin-password').val('');
        $('.btn-admin').off('click');
        $('.btn-admin').on('click', function() {
            $('#loginModal').modal('show');
        });
    }
}

function readableTime(ms) {
    var date = new Date(ms);
    var m = date.getMinutes();
    var s = date.getSeconds();
    if (s < 10) {
        return m + ":0" + s;
    } else {
        return m + ":" + s;
    }
}

function getTrackByID(id) {
    for (var i = 0; i < tracklist.length; i++) {
        if (tracklist[i].tlid == id)
            return tracklist[i];
    }
}

function crop(s) {
    var max = 40;
    if (s.length > max)
        return s.substring(0, max) + "...";
    else return s;
}

$.keyboard.defaultOptions.layout = 'custom';
$.keyboard.defaultOptions.customLayout = {
    'default' : [
        "1 2 3 4 5 6 7 8 9 0 + {b}",
        "q w e r t y u i o p \u00e5",
        "a s d f g h j k l \u00e6 \u00f8 ' {enter}",
        "{shift} < z x c v b n m , . - {shift}",
        "{space} {alt}"
    ],
    'shift' : [
        '! " # \u00a4 % & / ( ) = ? {b}',
        "Q W E R T Y U I O P \u00c5",
        "A S D F G H J K L \u00c6 \u00d8 * {enter}",
        "{shift} > Z X C V B N M ; : _ {shift}",
        "{space} {alt}"
    ],
    'alt' : [
        '1 @ \u00a3 $ 5 6 { [ ] } + | {b}',
        'q w € r t y u i o p \u00e5',
        "a s d f g h j k l \u00e6 \u00f8 ' {enter}",
        '{shift} \\ z x c v b n \u00b5 , . - {shift}',
        '{space} {alt}'
    ]
};

function setFullScreen(fullscreen) {
    if (fullscreen) {
        $.cookie('fullscreen', 'yes');
        if (document.documentElement.requestFullScreen) {
            document.documentElement.requestFullScreen();
        } else if (document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullScreen) {
            document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
        }
    } else {
        $.cookie('fullscreen', 'no');
        if (document.cancelFullScreen) {
            document.cancelFullScreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitCancelFullScreen) {
            document.webkitCancelFullScreen();
        }
    }
}

function getFullscreen() {
    return (document.fullScreenElement && document.fullScreenElement !== null) ||
        (!document.mozFullScreen && !document.webkitIsFullScreen);
}


setFullScreen($.cookie('fullscreen') == 'yes');
