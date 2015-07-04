require.def('uktvplay/appui/media/samsungtizen', [
    'antie/runtimecontext',
    'antie/devices/device',
    'antie/devices/media/mediainterface'
], function(RuntimeContext, Device, MediaInterface) {


	var SamsungTizen = MediaInterface.extend({

		init: function(id, eventCallback) {
			this.id = id;
			this.eventCallback = eventCallback;
		}

	});


	/*___________________________________________________________________________________________________________*/
	// Device prototype overrides.

	Device.prototype.createMediaInterface = function(id, mediaType, eventCallback) {
		return new SamsungTizen(id, eventCallback);
	};


    Device.prototype.getPlayerEmbedMode = function(mediaType) {
        return MediaInterface.EMBED_MODE_BACKGROUND;
    };

	return SamsungTizen;
});
