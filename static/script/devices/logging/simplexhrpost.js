require.def('antie/devices/logging/simplexhrpost', [
    'module',
    'antie/runtimecontext',
    'antie/devices/device'
], function(Module, RuntimeContext, Device) {
    'use strict';

    console.log('BING!');
    var MessageQueue = function(endPoint) {

        var queue = [],
            isRunning = false,
            xhr = null;


        function _addToQueue(msg) {
            queue.push(msg);
            if (!isRunning) {
                _nextQueue();
            }
        }



        function _nextQueue() {
            isRunning = true;
            xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    _handleSendComplete();
                }
            }
            var msg = queue.shift();
            xhr.open('post', endPoint);
            xhr.send(encodeURIComponent(msg));
        }


        function _handleSendComplete() {
            if (queue.length > 0) {
                _nextQueue();
            } else {
                isRunning = false;
            }
        }


        return {
            queue: _addToQueue
        };
    };

    var SimpleLogger = function(host, port) {

        var messageQueue = new MessageQueue(getEndPoint(host, port));

        function _log(message) {
            messageQueue.queue(message);
        }


        return {
            log: _log
        }
    };

    function getEndPoint(host, port) {
        return 'http://' + host + ':' + port;
    }
    SimpleLogger.__instances = {};

    SimpleLogger.getLogger = function(host, port) {
        var ep = getEndPoint(host, port);
        if (!SimpleLogger.__instances[ep]) {
            SimpleLogger.__instances[ep] = new SimpleLogger(host, port);
        }
        return SimpleLogger.__instances[ep];
    };


    var simpleLogger = null;


    function sendLog(msg) {
        console.log('Sending message ' + msg);
        if (simpleLogger === null) {
            var config = RuntimeContext.getDevice().getConfig().logging;
            console.log('Creating logger ', config.host, config.port)
            simpleLogger = new SimpleLogger(config.host, config.port);
        }
        simpleLogger.log(msg);
    }


    var loggingMethods = {
        log: function() {
            sendLog("LOG " + Array.prototype.join.call(arguments));
        },
        debug: function() {
            sendLog("DEBUG " + Array.prototype.join.call(arguments));
        },
        info: function() {
            sendLog("INFO " + Array.prototype.join.call(arguments));
        },
        warn: function() {
            sendLog("WARN " + Array.prototype.join.call(arguments));
        },
        error: function() {
            sendLog("ERROR " + Array.prototype.join.call(arguments));
        }
    };

    Device.addLoggingStrategy(Module.id, loggingMethods);

    console.log('Applied Logging Strategy', Module.id);



});
