var KeyboardInputController = function KeyboardInputController(cockpit) {
  var self = this;

  self.register = function(control) {
    if (control.defaults.keyboard !== undefined) {
      var key = control.defaults.keyboard;
      if (control.down != undefined) Mousetrap.bind(key, control.down, 'keydown');
      if (control.up !== undefined) Mousetrap.bind(key, control.up, 'keyup');
      if (control.secondary !== undefined) {
        control.secondary.forEach(function (secondary) {
          if (secondary.down !== undefined) Mousetrap.bind(key + '+' + secondary.defaults.keyboard, secondary.down, 'keydown');
          if (secondary.up !== undefined)  Mousetrap.bind(key + '+' + secondary.defaults.keyboard, secondary.up, 'keyup');
        });
      }
    }
  }

  return self;
};
