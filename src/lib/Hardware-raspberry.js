var EventEmitter = require('events').EventEmitter, StatusReader = require('./StatusReader'), CONFIG = require('./config'), fs = require('fs'), Tty = require('tty'), logger = require('./logger').create(CONFIG), util = require('util'), nodeimu  = require('nodeimu');
;
function Hardware() {
  var DISABLED = 'DISABLED';
  var hardware = new EventEmitter();
  var reader = new StatusReader();
  var emitRawSerial = false;
  var servoBlaster = new Tty.WriteStream(fs.openSync('/dev/servoblaster', 'w') );
  hardware.depthHoldEnabled = false;
  hardware.targetHoldEnabled = false;
  hardware.laserEnabled = false;

  //### Initializing the GrovePi Board and connect callback for data reading ###//
  var _voltageValue = 0;
  var _temperatureValue = 0;

  var GrovePi = require('node-grovepi').GrovePi
  var Commands = GrovePi.commands
  var Board = GrovePi.board
  var AnalogSensor = GrovePi.sensors.base.Analog

  var KalmanFilter = require('kalmanjs').default;

  var kfVolt = new KalmanFilter({R: 0.01, Q: 3});
  var board = new Board({
    debug: true,
    onError: function(err) {
      logger.log('GrovePi board initialization error:')
      logger.log(err)
    },
    onInit: function(res) {
      if (res) {
      logger.log('GrovePi Version: ' + board.version())

      var phidgetVoltageSensor = new AnalogSensor(0)
      logger.log('Analog Sensor (start reading)')
      phidgetVoltageSensor.stream(250, function(value) {
        if (value != false) {
          _voltageValue = Math.round(kfVolt.filter((value - 554) / 11.5384) * 10) / 10;
          //console.log('Value: ' + value + ' Voltage Value: ' + _voltageValue);
        }
      })
      }
    }
  })
  
  //### Read temperature data from sysfs ###//
  var kfTemp = new KalmanFilter({R: 0.01, Q: 3});
  var readTemperature = function() {
    fs.readFile('/sys/devices/virtual/thermal/thermal_zone0/temp', function (err, data) {
      if (err != null) {
        logger.log('Error accessing sysfs temperature data: ' + err);
      } else {
        _temperatureValue = Math.round(kfTemp.filter(parseInt(data.toString()) / 100)) / 10;
        //console.log('Temperature=' + _temperatureValue);
      }
    });
  }

  //### Read and send data from IMU ###//
  var navdata = {
    roll: 0,
    pitch: 0,
    yaw: 0,
    thrust: 0,
    depth: 0,
    heading: 0
  };

  var RTMATH_PI =  3.1415926535;
  var RTMATH_RAD_TO_DEGREE = (180.0 / RTMATH_PI);

  var IMU = new nodeimu.IMU();

  var num = 0;
  var numStop = 10000000000;

  console.time("async");
  var tic = new Date();

  var callback = function (e, data) {
    var toc = new Date();

    if (e) {
      logger.log(e);
      return;
    }

    if ((data.fusionPose.x != 0) && (data.fusionPose.y != 0) && (data.fusionPose.z != 0)) {
      navdata.roll = - data.fusionPose.y * RTMATH_RAD_TO_DEGREE;
      navdata.pitch = data.fusionPose.x * RTMATH_RAD_TO_DEGREE;
      navdata.yaw = data.fusionPose.z * RTMATH_RAD_TO_DEGREE;
      navdata.heading = data.tiltHeading  * RTMATH_RAD_TO_DEGREE + 90;

	  emitData = 'hdgd:' + navdata.heading + ';roll:' + navdata.roll + ';pitc:' + navdata.pitch + ';yaw:' + navdata.yaw + ';'
      hardware.emit('status', reader.parseStatus(emitData));
      //console.log(emitData);
    }

    num++;
    if (num == numStop) {
      console.timeEnd("async");
    } else {
      setTimeout(function() { tic = new Date(); IMU.getValue(callback); } , 15 - (toc - tic));
    }
  }
  //##########//

  reader.on('Arduino-settings-reported', function (settings) {
    hardware.emit('Arduino-settings-reported', settings);
  });
  hardware.connect = function () {
//    console.log('!Serial port opened');
    board.init();
    IMU.getValue(callback);
    setInterval(readTemperature, 1000);
  };
  hardware.toggleRawSerialData = function toggleRawSerialData() {
    emitRawSerial = !emitRawSerial;
  };

  hardware.write = function (command) {
    console.log('HARDWARE-RASP:' + command);
    var commandParts = command.split(/\(|\)/);
    var commandText = commandParts[0];
    if (commandText === 'rcap') {
      hardware.emitStatus('CAPA:255');
    }
    if (commandText === 'ligt') {
      hardware.emitStatus('LIGP:' + commandParts[1] / 255);
      console.log('HARDWARE-RASP return light status');
    }
    if (commandText === 'tilt') {
      hardware.emitStatus('servo:' + commandParts[1]);
      servoBlaster.write("3="  + commandParts[1] + "\n\r");
      console.log('HARDWARE-RASP return servo status');
    }
    if (commandText === 'pan') {
      //hardware.emitStatus('servo:' + commandParts[1]);
      servoBlaster.write("4="  + commandParts[1] + "\n\r");
      console.log('HARDWARE-RASP return servo status');
    }
    if (commandText === 'claser') {
        if (hardware.laserEnabled) {
          hardware.laserEnabled = false;
          hardware.emitStatus('claser:0');
        }
        else {
          hardware.laserEnabled = true;
          hardware.emitStatus('claser:255');
        }
    }
    if (commandText === 'go') {
      hardware.emitStatus('go');
      var motorSpeed = commandParts[1].split(',');
      for (var i = 0; i < 3; i++) {
        servoBlaster.write(i + "=" + motorSpeed[i] + "\n\r");
      }
      console.log('HARDWARE-RASP return servo status');
    }

    // Depth hold
    if (commandText === 'holdDepth_toggle') {
        var targetDepth = 0;
        if (!hardware.depthHoldEnabled) {
            targetDepth = currentDepth;
            hardware.depthHoldEnabled = true;
            console.log('HARDWARE-RASP depth hold enabled');
        }
        else {
            targetDepth = -500;
            hardware.depthHoldEnabled = false;
            console.log('HARDWARE-RASP depth hold DISABLED');
        }
        hardware.emitStatus(
          'targetDepth:' +
          (hardware.depthHoldEnabled ? targetDepth.toString() : DISABLED)
        );
    }

    // Heading hold
    if (commandText === 'holdHeading_toggle') {
        var targetHeading = 0;
        if (!hardware.targetHoldEnabled) {
            targetHeading = currentHeading;
            hardware.targetHoldEnabled= true;
            console.log('HARDWARE-RASP heading hold enabled');
        }
        else {
            targetHeading = -500;
            hardware.targetHoldEnabled = false;
            console.log('HARDWARE-RASP heading hold DISABLED');
        }
        hardware.emitStatus(
          'targetHeading:' + (hardware.targetHoldEnabled ? targetHeading.toString() : DISABLED)
        );
    }

    // example tests for passthrough
    if (commandText === 'example_to_foo') {
      hardware.emitStatus('example_foo:' + commandParts[1]);
    }
    if (commandText === 'example_to_bar') {
      hardware.emitStatus('example_bar:' + commandParts[1]);
    }
    hardware.emitStatus('cmd:' + command);
  };
  hardware.emitStatus = function(status) {
    var txtStatus = reader.parseStatus(status);
    hardware.emit('status', txtStatus);
    if (emitRawSerial) {
      hardware.emit('serial-received', status);
    }

  };
  hardware.close = function () {
//    console.log('!Serial port closed');
    logger.log('GrovePi board closed');
  };
  var time = 1000;
  setInterval(function () {
    hardware.emit('status', reader.parseStatus('time:' + time));
    time += 1000;
  }, 1000);
  setInterval(sendEvent, 2000);
  function sendEvent() {
    //var data = 'vout:9.9;iout:0.2;BT.1.I:0.3;BT.2.I:0.5;BNO055.enabled:true;BNO055.test1.pid:passed;BNO055.test2.zzz:passed;';
    var data = 'brdt:' + _temperatureValue + ';vout:' + _voltageValue + ';iout:0.0;BT.1.I:0.0;BT.2.I:0.0;deep:0';
    hardware.emit('status', reader.parseStatus(data));
  }

//  var currentDepth = 0;
//  var interval = setInterval(function() {
//    currentDepth += 0.5;
//    hardware.emit('status', reader.parseStatus('deep:' + currentDepth));
//    if (currentDepth > 50) {
//      currentDepth = 0;
//    }
//  }, 2000);

  return hardware;
}
module.exports = Hardware;
