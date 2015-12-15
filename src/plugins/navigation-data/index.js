(function() {
  function Laser(name, deps) {
    console.log('Navigation Data plugin loaded');

	var navdata = {
	  roll: 0,
	  pitch: 0,
	  yaw: 0,
	  thrust: 0,
	  depth: 0,
	  heading: 0
	};
	var	RTMATH_PI =	3.1415926535;
	var RTMATH_RAD_TO_DEGREE = (180.0 / RTMATH_PI);

	var util = require('util')
	var nodeimu  = require('nodeimu');
	//var nodeimu  = require('/home/pi/Src/nodeimu/index.js');
	var IMU = new nodeimu.IMU();
	
	var num = 0;
	var numStop = 10000000000;

	console.time("async");
	var tic = new Date();

	var callback = function (e, data) {
	  var toc = new Date();

	  if (e) {
		console.log(e);
		return;
	  }

	  if ((data.fusionPose.x != 0) && (data.fusionPose.y != 0) && (data.fusionPose.z != 0)) {
		navdata.roll = - data.fusionPose.y * RTMATH_RAD_TO_DEGREE;
		navdata.pitch = data.fusionPose.x * RTMATH_RAD_TO_DEGREE;
		navdata.yaw = data.fusionPose.z * RTMATH_RAD_TO_DEGREE;
		heading = data.tiltHeading  * RTMATH_RAD_TO_DEGREE;
		navdata.heading = heading + 90;		
		//console.log(data);
	  }

	  num++;
	  if (num == numStop) {
		console.timeEnd("async");
	  } else {
		setTimeout(function() { tic = new Date(); IMU.getValue(callback); } , 15 - (toc - tic));
	  }
}

	IMU.getValue(callback);

    // Arduino
    // deps.rov.on('status', function (status) {
      // if ('deep' in status) {
        // navdata.depth = status.deep;
      // }
      // if ('fthr' in status) {
        // navdata.thrust = status.fthr;
      // }
    // });

    deps.cockpit.on('plugin.navigationData.zeroDepth', function () {
      deps.rov.send('dzer()');
    });
    deps.cockpit.on('plugin.navigationData.calibrateCompass', function () {
      deps.rov.send('ccal()');
    });

    setInterval(function () {
      deps.cockpit.emit('plugin.navigationData.data', navdata);
    }, 100);

  }
  module.exports = Laser;
})();
