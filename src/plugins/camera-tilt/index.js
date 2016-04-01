(function() {
  function CameraTilt(name, deps) {
    var ArduinoHelper = require('../../lib/ArduinoHelper')();
    console.log('Camera tilt plugin loaded');
    var tilt = 0;
    var pan = 0;
    var physics = ArduinoHelper.physics;

    // Cockpit
    deps.cockpit.on('plugin.cameraTilt.set', function (angle) {
      setCameraTilt(angle);
    });

    deps.cockpit.on('plugin.cameraTilt.adjust', function (value) {
      adjustCameraTilt(value);
    });

        deps.cockpit.on('plugin.cameraPan.set', function (angle) {
      setCameraPan(angle);
    });

    deps.cockpit.on('plugin.cameraPan.adjust', function (value) {
      adjustCameraPan(value);
    });

    // Arduino
    deps.rov.on('status', function (data) {
      if ('servo' in data) {
        var angle = 90 / 500 * data.servo * -1 - 90;
        deps.cockpit.emit('plugin.cameraTilt.angle', angle);
      }
    });

    var setCameraTilt = function(value) {
      tilt = value;
      if (tilt > 1)
        tilt = 1;
      if (tilt < -1)
        tilt = -1;

      var servoTilt = physics.mapServo(tilt);
      var command = 'tilt(' + servoTilt + ')';

      deps.rov.send(command);
    };

    var adjustCameraTilt = function(value) {
      tilt += value;
      setCameraTilt(tilt);
    };
    
    var setCameraPan = function(value) {
      pan = value;
      if (pan > 1)
        pan = 1;
      if (pan < -1)
        pan = -1;

      var servoPan = physics.mapServo(pan);
      var command = 'pan(' + servoPan + ')';

      deps.rov.send(command);
    };

    var adjustCameraPan = function(value) {
      pan += value;
      setCameraPan(pan);
    };
  }
  module.exports = CameraTilt;
})();