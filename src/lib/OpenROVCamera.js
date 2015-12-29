/*
 *
 * Description:
 * This script creates a directory and sends that as an argument to a spawned process (capture.cpp).
 * Then, it sends a request to capture a frame with file name of current time at a given interval.
 * Lastly, when (capture.cpp) responds with the file name (meaning save completed), it reads the file
 * and then emits the content to the Node.js server in base64 (string) format.
 *
 */
var spawn = require('child_process').spawn, util = require('util'), request = require('request'), EventEmitter = require('events').EventEmitter, fs = require('fs'), path = require('path'), CONFIG = require('./config'), logger = require('./logger').create(CONFIG), orutils = require('./orutils'), moment = require('moment'), Gpio = require('onoff').Gpio;
var OpenROVCamera = function (options) {
  var camera = new EventEmitter();
  var cameraLed = new Gpio(32, 'low');
  var capture_process;
  // Open mjpg_streamer app as a child process
  var cmd = 'mjpg_streamer';
  // rename to correspond with your C++ compilation
  var default_opts = {
      device: CONFIG.video_device,
      resolution: CONFIG.video_resolution, 
      resolution_x: CONFIG.video_resolution_x, 
      resolution_y: CONFIG.video_resolution_y, 
	  rotation: CONFIG.video_rotation, 
      framerate: CONFIG.video_frame_rate,
      port: CONFIG.video_port
    };
  options = orutils.mixin(options, default_opts);
  var _capturing = false;
  Object.defineProperty(camera, 'capturing', {
    get: function() {
        return _capturing;
    },
    set: function(value) {
        _capturing = value;
        if (value == true)
            cameraLed.writeSync(1);
        else
            cameraLed.writeSync(0);
    }
  });
  camera.IsCapturing = function () {
    return camera.capturing;
  };
  var args = [
      '-i',
      '/usr/local/lib/input_raspicam.so -x ' + options.resolution_x + ' -y ' + options.resolution_y + ' -fps ' + options.framerate + ' -rot ' + options.rotation,
      '-o',
      '/usr/local/lib/output_http.so -w /usr/local/www -p ' + options.port
    ];
  // End camera process gracefully
  camera.close = function () {
    if (!camera.capturing)
      return;
    logger.log('closing camera on', options.device);
    camera.capturing = false;
    logger.log('sending SIGHUP to capture process');
    process.kill(capture_process.pid, 'SIGHUP');
  };
  camera.snapshot = function (callback) {
    if (!camera.capturing)
      return;
    var filename = CONFIG.preferences.get('photoDirectory') + '/ROV' + moment().format('YYYYMMDDHHmmss') + '.jpg';
    request('http://localhost:' + options.port + '/?action=snapshot').pipe(fs.createWriteStream(filename));
    callback(filename);
  };
  var restartCount = 0;
  // Actual camera capture starting mjpg-stremer
  var capture;
  capture = function (callback) {
    logger.log('initiating camera on', options.device);
    logger.log('ensure cpu is at 100% for this camera');
    spawn('cpufreq-set', [
      '-g',
      'performance'
    ]);
    // if camera working, should be at options.device (most likely /dev/video0 or similar)
    fs.exists(options.device, function (exists) {
      // no camera?!
      if (!exists)
        return callback(new Error(options.device + ' does not exist'));
      // wooooo!  camera!
      logger.log(options.device, ' found');
      camera.capturing = true;
      // then remember that we're capturing
      logger.log('spawning capture process...');
      capture_process = spawn(cmd, args);
      camera.emit('started');
      capture_process.stdout.on('data', function (data) {
        logger.log('camera: ' + data);
      });
      capture_process.stderr.on('data', function (data) {
        logger.log('camera: ' + data);
      });
      console.log('camera started');
      capture_process.on('exit', function (code) {
        console.log('child process exited with code ' + code);
        camera.capturing = false;
        camera.emit('error.device', code);
        if ( restartCount < 10 ) {
          console.log('starting new camera process for the ' + restartCount + ' time');
          restartCount = restartCount + 1;
          capture(callback);
        }
        else { console.log('camera process crashed too many times. giving up'); }
      });
    });
  };
  camera.capture = capture;
  return camera;
};
module.exports = OpenROVCamera;
