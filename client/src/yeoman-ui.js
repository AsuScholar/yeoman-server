"use strict";

var angular = require("angular");
var angularSanitize = require("angular-sanitize");
var jQuery = require("jquery");
window.$ = window.jQuery = jQuery;
require("bootstrap/dist/js/bootstrap.js");
require("bootstrap/dist/css/bootstrap.css");
require("./yeoman-ui.css");

var io = window.io;

angular
  .module('app', [
    'ngSanitize',
    'yoUI'
  ]);

angular
  .module('yoUI', ['ngSanitize'])
  .factory('socket', function () {
    return io();
  })
  .directive('yoAutofocus', yoAutofocus)
  .controller('YoController', YoController);


function yoAutofocus() {
  return {
    restrict: 'A',
    link: function ($scope, $element) {
      setTimeout(function () {
        $element[0].focus();
      }, 0);
    }
  };
}

function yoNormalizePrompt(prompt) {
  // Default type is input
  if (!prompt.type) {
    prompt.type = 'input';
  }

  // Confirm prompt could be dropdown ?
  if (prompt.type === 'confirm') {
    prompt.choices = [{
      value: true,
      name: 'Yes'
    }, {
      value: false,
      name: 'No'
    }];
  }

  // Index is useful
  if (prompt.choices && prompt.choices.length) {
    if (typeof prompt.choices[0] === 'string') {
      prompt.choices = prompt.choices.map(function (choice, index) {
        return {
          key: choice.substr(0, 1),
          value: prompt.type === 'list' ? choice : index,
          name: choice
        };
      });
    }

    prompt.choices.forEach(function (choice, index) {
      choice.index = index;
    });
  }

  if (!prompt.default && prompt.type === 'expand') {
    prompt.default = 0;
  }

  prompt.value = prompt.default;

  return prompt;
}

function yoNormalizeAnswer(prompt) {
  if (prompt.type === 'checkbox') {
    prompt.value = [];
    prompt.choices.forEach(function (choice) {
      if (choice.checked) {
        prompt.value.push(choice.value);
      }
    });
  } else if (prompt.type === 'password') {
    var encodedPassword = "";
    for (var i = 0; i < prompt.value.length; i++) {
      encodedPassword += "*";
    }
    return encodedPassword;
  }

  // console.log('prompt.value: ', prompt.value);

  return prompt.value;
}

function YoController($scope, $sce, socket) {
  var self = this;

  self.generator = null;
  self.subgenerator = null;
  self.updateGenerator = _updateGenerator;
  self.run = _run;
  self.submit = _submit;
  self.reset = _reset;
  self.scopeApply = _scopeApply;
  self.isWaiting = _isWaiting;

  self.reset();

  socket.on('yo:list', function (generators) {
    self.generators = generators;
    self.scopeApply();
  });

  socket.emit('yo:list');

  socket.on('yo:prompt', function (prompt) {
    self.prompts.filter(function (prompt) {
      prompt.isDisabled = true;
    });
    prompt.isDisabled = false;
    self.activePromptIndex = self.prompts.length;
    self.prompts.push(yoNormalizePrompt(prompt));

    self.scopeApply();
    appendLog("\n<span style='color: #5bc0de'>?</span> " + prompt.message);
  });

  socket.on('yo:diff', function (diffs) {
    self.diffs = diffs;
    self.scopeApply();
  });

  socket.on('yo:log', appendLog);
  function appendLog(logs) {
    var element = document.getElementById("logs");
    var oldLog = element.innerHTML;
    element.innerHTML = (oldLog ? oldLog : "") + "\n" + logs;
    element.scrollTop = element.scrollHeight;
    self.logs = $sce.trustAsHtml(logs);
    self.scopeApply("\n> " + prompt.message);
  }

  socket.on('yo:prompt:error', function (msg) {
    alert(msg);
    self.scopeApply();
  });

  socket.on('yo:end', function (data) {
    if (data.distId && data.distName) {
      window.location.href = '/dist/' + data.distId + '/' + data.distName;
    } else {
      alert('Sorry, an error has occured :(');
    }

    self.generator = null;
    self.subgenerator = null;
    self.reset();
    self.scopeApply();
  });

  function _updateGenerator() {
    self.reset();

    if (self.subgenerator && self.generator.subgenerators.indexOf(self.subgenerator) < 0) {
      self.subgenerator = null;
    }

    if (self.subgenerator) {
      return self.run(self.subgenerator.namespace);
    }

    if (self.generator && self.generator.subgenerators.length <= 1) {
      return self.run(self.generator.namespace);
    }
  }

  function _run(namespace) {
    socket.emit('yo:run', {
      namespace: namespace
    });
  }

  function _submit() {
    self.prompts[self.activePromptIndex].isDisabled = true;
    var answer = yoNormalizeAnswer(self.prompts[self.activePromptIndex]);
    socket.emit('yo:prompt', {
      question: self.prompts[self.activePromptIndex],
      answer: answer
    });

    if (answer && typeof answer === "object" && answer.length) {
      for (var i = 0; i < answer.length; i++) {
        appendLog("    <span style='color: #00b3ee'>" + answer[i] + "</span>");
      }
    } else {
      appendLog("    <span style='color: #00b3ee'>" + answer + "</span>");
    }
  }

  function _reset() {
    self.prompts = [];
    self.activePromptIndex = -1;
    self.diffs = [];
    self.logs = [];
  }

  function _scopeApply() {
    if (!$scope.$$phase) {
      $scope.$apply();
    }
  }

  function _isWaiting() {
    return self.prompts.filter(function (p1) {
        return !p1.isDisabled;
      }).length <= 0;
  }
}
