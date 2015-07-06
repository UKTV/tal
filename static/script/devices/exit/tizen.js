/*
 * TAL modifier for exiting a Tizen web app.
 *
 * TAL Docs: http://fmtvp.github.io/tal/overview/device-configuration.html
 */
require.def(
    'antie/devices/exit/tizen', [
        'antie/devices/device'
    ],
    function(Device) {
        'use strict';

        /**
         * Exits the application by invoking the navigator.app.exitApp method,
         * which is a cordova bridge method for telling the native code to exit
         */
        Device.prototype.exit = function() {
            try {
                tizen.application.getCurrentApplication().exit();
            } catch (error) {
                this.getLogger().error("getCurrentApplication(): " + error.message);
            }
        };

    }
);
