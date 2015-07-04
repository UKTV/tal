/*
 * TAL modifier for exiting the app specific to Amazon Fire TV,
 * which uses Cordova. Therefore must call the cordova method
 * for closing the application
 *
 * TAL Docs: http://fmtvp.github.io/tal/overview/device-configuration.html
 */
require.def(
    'antie/devices/exit/cordova',
    ['antie/devices/browserdevice'],
    function(Device) {
        'use strict';

        /**
         * Exits the application by invoking the navigator.app.exitApp method,
         * which is a cordova bridge method for telling the native code to exit
        */
        Device.prototype.exit = function() {
            navigator.app.exitApp();
        };

    }
);