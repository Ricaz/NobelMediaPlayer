var host = 'http://localhost:8080/';
var client = io.connect(host);

var currentState;
var currentSong;
var currentTime;
var currentPercentage;
var tracklist;
var timer;

client.on('connect', function() {
    console.log('Connected to WS host: ', host);
    client.emit('request-current');
    client.emit('request-state');
    // Currently playing song is received
    client.on('current', function(data) {
        console.log('Received current: ', data);
        updateCurrent(data);
    });

    // Time on playing song is received
    client.on('current-time', function(data) {
        console.log('Received current time: ', data);
        handleCurrentTime(data);
    });

    client.on('state', function (data) {
        console.log('Received state: ', data);
        handleState(data);
    });

    // Current song is paused
    client.on('song-pause', function() {
        console.log('Received pause');
        clearInterval(timer);
        handleState('paused');
    });

    // Current song is resumed
    client.on('song-resume', function() {
        console.log('Received resume');
        handleState('playing');
        client.emit('request-current-time');
    });

    // Song is played (???)
    client.on('song-play', function() {
        console.log('Received play');
        handleState('playing');
    });

    client.on('disconnect', function () {
        console.log('Disconnected from WS host: ', host);
        $('.connection-status').html('Disconnected');
        setTimeout(function () {
            location.reload();
        }, 2000);
    });
});


function handleState(state) {
    console.log('set current state:', state);
    currentState = state;
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

function readableTime (milliseconds) {
    var date = new Date(milliseconds);
    var m = date.getMinutes();
    var s = date.getSeconds();
    if (s < 10) {
        return m + ":0" + s;
    } else {
        return m + ":" + s;
    }
}

function crop(s) {
    var max = 40;
    if (s.length > 40)
        return s.substring(0,40) + "...";
    else return s;
}

$('.btn-submit-playlist').click(function() {
    var uri = $('.uri').val();
    client.emit('request-add-playlist-to-account', uri)
});