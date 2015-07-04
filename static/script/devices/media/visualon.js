require.def(
    'antie/devices/media/visualon', [
        'antie/runtimecontext',
        'antie/devices/device',
        'antie/devices/media/mediainterface',
        'antie/events/mediaevent',
        'antie/events/mediaerrorevent',
        'uktvplay/appui/datasources/freewheelrequest',
        "uktvplay/appui/datasources/uktvschedules",
        "uktvplay/appui/shared/globals"
    ],
    function(
        RuntimeContext,
        Device,
        MediaInterface,
        MediaEvent,
        MediaErrorEvent,
        FreewheelRequest,
        UKTVSchedules,
        Globals) {

        /**
         * Copy of Java class com.uktv.play.visualon.VisualOnPlayer$State
         */
        var State = {
            INIT: 0,
            LOADING: 1,
            READY: 2,
            PLAYING: 3,
            BUFFERING: 4,
            PAUSED: 5,
            SUSPENDED: 6,
            ABORTED: 7,
            COMPLETED: 8,
            FINALIZED: 9,
            ERROR: 10,
            FF: 11,
            RW: 12
        };

        /**
         * Define media interface for Cordova plugin.
         */
        var VisualOnMediaInterface = MediaInterface.extend({

            /*___________________________________________________________________________________________________________*/
            //



            /**
             * Reference to device's logger.
             */
            logger: null,

            /**
             * Reference to cordova.exec
             */
            exec: null,

            /**
             * Property required by mediainterface.
             * A function that takes an instance of Event to trigger.
             */
            eventCallback: null,

            /**
             * The main feature content's ID within Brightcove.
             * The plugin is designed to be configured with a single content URL
             * and separate ad configuration with multiple assets.
             */
            brightcoveVideoID: null,

            /**
             * The Brightcove data associated with the video's Brightcove ID, retrived
             * from the Brightcove Media API
             */
            brighcoveData: null,

            /**
             * The ad data associated with brightcoveVideoID.
             * @see uktvplay/appui/datasources/freewheelrequest:AdData
             */
            adData: null,

            /**
             * The playhead position last reported by the plugin,
             * regardless of asset type.
             */
            _currentTime: 0,

            /**
             * The asset duration last reported by the plugin,
             * regardless of asset type.
             */
            _currentDuration: 0,

            /**
             * The ID of the asset which was last reported by the plugin,
             * regardless of asset type.
             */
            _currentAssetId: null,

            /**
             * The type of the asset which was last reported by the plugin,
             * regardless of asset type.
             * Either ASSET_TYPE_AD or ASSET_TYPE_CONTENT
             */
            _currentAssetType: null,

            /**
             * Simple flag defining whether a seek operation is in progress.
             */
            _isSeeking: false,

            /**
             * Simple flag defining whether playback has actually been launched in
             * the native layer. Bit of a hack; used primarily to decide how to handle
             * calls to setCurrentTime, which - in this implementation - can only be used
             * to set the initial time prior to playback, not change the actual time while
             * playback is ongoing.
             */
            _isPlaybackInit: false,

            /**
             * Any error reported by the plugin
             * that should be returned by getError()
             */
            _error: null,

            /**
             * The playback result sent by the plugin, e.g.
             * whether playback completed, was aborted or exited
             * with an error.
             */
            _result: null,

            /**
             * This value is supplied in the 'tags' hash argument of setSources.
             * It is used to create the Freewheel site section ID property.
             */
            _channelId: null,

            /**
             * This value is supplied in the 'tags' hash argument of setSources.
             * It is used to create the Freewheel site section ID property.
             */
            _houseNumber: null,



            /*___________________________________________________________________________________________________________*/
            // TAL MediaInterface Overrides.

            /**
             * 
             */
            init: function(id, eventCallback) {

                // The supplied ID is exepcted to be a Brightcove video ID.
                this.id = id;

                this.logger = RuntimeContext.getDevice().getLogger();
                this.logger.info('Init VisualOn Media Interface ' + this.id);

                // eventCallback is a property defined in TAL's media class.
                // It is a function that takes an event as its argument, allowing
                // this interface, which is NOT a widget, to feed events into
                // the widget hierarchy.
                this.eventCallback = eventCallback;
                
                if (window.cordova) {
                    this.exec = window.cordova.require('cordova/exec');
                } else {
                    this.logger.error('No reference to Cordova object - playback will fail when attempted');
                }

                if (this.exec) {
                    this._setListener();
                } else {
                    this.logger.error('exec is undefined - playback will fail when attempted');
                }

            },

            /**
             * TODO tear down
             */
            destroy: function() {
                this._isPlaybackInit = false;
                this.eventCallback = null;
                this.brightcoveData = null;
                this.brightcoveVideoID = null;
                this._channelId = null;
                this._houseNumber = null;
                this.exec = null;
                this._error = null;
                this.logger = null;
                this.adData = null;

            },

            /**
             * 
             */
            render: function(device) {
                // return an empty widget - there is no need for this except that
                // TAL does not check for the returned value being null and simply attempts to add
                // it to the display list.
                return device.createContainer("emptycontainer", "");
            },

            /**
             * TODO Currently has hard-coded content URL - switch to MPD returned by Brightcove.
             */
            play: function() {
                var self = this;

                /**
                 * This check could equally be run in init().
                 * However the aim is to trigger an error event. Which object creates this
                 * instance and subscribes to its events will not have bound event listeners
                 * when init runs, but MUST have by the time it calls play().
                 * For that reason, check for Cordova/exec here and set error state accordingly.
                 */
                if (!window.cordova || !this.exec) {
                    this._setError(VisualOnMediaInterface.ERROR_CODE_CORDOVA_LIBRARY_NOT_FOUND);
                    return;
                }

                /**
                 * If we're here, Cordova and its exec method must look valid.
                 */
                this.exec(
                    function() {
                        self._callbackSuccess.call(self, Array.prototype.slice.call(arguments));
                    },
                    function() {
                        self._callbackError.call(self, Array.prototype.slice.call(arguments));
                    },
                    'VisualOnPlayerPlugin',
                    'launch', [{
                        contentUrl: 'http://rathermarvellous.com/big_buck_bunny_480p_h264.mov', //this.brightcoveData.dashManifestUrl || this.brightcoveData.FLVURL,
                        adData: this.adData,
                        position: this._currentTime
                    }]
                );
                this._isPlaybackInit = true;
            },

            /**
             * Overrides method in antie/devies/media/mediainterface.
             * The definition in their API is changed here as ad data
             * is passed to this implementation.
             * This is specific to the VisualOn plugin.
             * TODO confirm this override is not problematic. It certainly works
             * within itself, but alters the TAL-defined API.
             */
            setSources: function(brightcoveVideoID, tags) {
                this.logger.debug('Setting sources: brightcoveVideoID=' + brightcoveVideoID + ' tags=' + JSON.stringify(tags));
                this.brightcoveVideoID = brightcoveVideoID;
                this._channelId = tags.channelId;
                this._houseNumber = tags.houseNumber;
                this._getBrighcoveVideoData();

            },


            /**
             * Returns the currently held playhead position.
             */
            getCurrentTime: function() {
                return this._currentTime;
            },

            /**
             * In this implementation this method can only
             * be used to set the initial time, i.e. a resume point.
             * After play() has been called, further calls to this method
             * will cause a runtime error to be thrown.
             */
            setCurrentTime: function (currentTime) {
                if ( this._isPlaybackInit ) {
                    throw new Error('Seek operations during playback cannot be initiated from TAL layer.');
                }
                this._currentTime = currentTime;

            },


            /**
             * Returns the currently held asset duration.
             */
            getDuration: function() {
                return this._currentDuration;
            },



            /**
             * Returns the Brightcove video ID that was supplied in setSources
             */
            getCurrentSource: function() {
                return this.brightcoveVideoID;
            },

            /**
             * Returns a derived flag defining whether playback has completed.
             * This will be false either if playback is ongoing or was stopped
             * either though an error or the user aborting.
             */
            getEnded: function() {
                return this._result && this._result === VisualOnMediaInterface.RESULT_COMPLETED;
            },

            /**
             * Returns whichever error code has been derived by,
             * or supplied to, this instance.
             */
            getError: function() {
                return this._error;
            },

            /**
             * Returns true if
             */
            getSeeking: function() {
                return this._isSeeking;
            },


            /*___________________________________________________________________________________________________________*/
            //  Custom or Extra Methods

            /**
             * Assigns an anonymous closure that is retained by the plugin
             * and acts as the single point of contact between the native
             * plugin and this class.
             * The anonymous closure simply calls _pluginCallback with the
             * correct scope, passing any arguments along.
             */
            _setListener: function() {
                var self = this;
                this.exec(function() {
                    self._pluginCallback.apply(self, Array.prototype.slice.call(arguments));
                }, null, 'VisualOnPlayerPlugin', 'setListener', []);

            },

            /*
             *  Get the Brightcove video data from the Brightcove Media API,
             *  fire _videoDataLoaded when finished
             *  TODO: Pass in self.id as video_id, using static ID for now
             */
            _getBrighcoveVideoData: function() {
                var self = this;
                this.logger.debug('_getBrighcoveVideoData');

                new UKTVSchedules().loadData(
                    {
                        onSuccess: function(responseData) {
                            self.brightcoveData = responseData[0];
                            // self._videoDataLoaded('brightcove');
                            self._getFreeWheelAdData();
                        },
                        onError: function () {
                            self._setError(VisualOnMediaInterface.ERROR_CODE_LAUNCH_FAILED);
                        }
                    },
                    {
                        baseURL: Globals.brightcoveMediaApiURL,
                        resourceName: 'brightcovevideodetails',
                        params: {
                            command: 'find_video_by_id',
                            //video_id: self.id,
                            video_id: 3813416170001,
                            video_fields: 'name,length,FLVURL,renditions,cuepoints,dashRenditions,dashManifestUrl,smoothRenditions,smoothManifestUrl'
                        }
                    }
                );

            },

            /**
             * Utility method to translate cue point object from
             * Brightcove response to Freewheel slot requests.
             */
            _cuePointsToSlotRequests: function(cuePoints) {

                var slotRequests = [],
                    i = 0,
                    l = cuePoints.length,
                    cuePoint;

                function getTimePositionClass(cuePoint) {
                    var name = cuePoint.name.toLowerCase();

                    if (name.indexOf('pre') === 0) {
                        return 'preroll';
                    }
                    if (name.indexOf('post') === 0) {
                        return 'postroll';
                    }
                    return 'midroll';

                }
                while (i < l) {
                    cuePoint = cuePoints[i];
                    slotRequests.push({
                        id: cuePoint.id,
                        positionClass: getTimePositionClass(cuePoint),
                        type: "a",
                        timePosition: cuePoint.time,
                        maxDuration: 300,
                    });

                    // if ( slotRequests[i].timePosition > 0 )
                    //     slotRequests[i].timePosition = 300;
                    i++;
                }

                return slotRequests;
            },




            /**
             *  
             */
            _getFreeWheelAdData: function() {
                this.logger.info('_getFreeWheelAdData ' + this.brightcoveData.cuePoints);
                var freewheelRequest = new FreewheelRequest(),
                    self = this,
                    config = {
                        // static account setup.
                        serverBase: Globals.fwServerBase,
                        networkId: Globals.fwNetworkId,
                        profile: Globals.fwProfile,
                        siteSectionId: Globals.fwSiteSectionId.replace('%channelId%', this._channelId),
                        flags: Globals.fwFlags,
                        metr: Globals.fwMetr,
                        // per-request dynamic stuff..
                        contentId: this._houseNumber,
                        slotRequests: this._cuePointsToSlotRequests(this.brightcoveData.cuePoints)
                    };
                freewheelRequest.loadData({
                    success: function(adData) {
                        self.adData = adData;
                        self.logger.info('loaded ad data: ' + adData.adSlots.length + ' ad slots');
                        self._videoDataLoaded();
                    },
                    error: function(errorMessage, emptyAdData) {
                        self.logger.error('Freewheel data error: ' + errorMessage);
                        // TODO trigger event to track FW fail?
                        self.adData = emptyAdData;
                        self._videoDataLoaded();
                    }
                }, config);
            },



            /**
             *  Called when all external data has loaded and video is ready to launch.
             * This comprises:
             * - Brightcove data
             * - Freewheel ad data.
             */
            _videoDataLoaded: function() {
                this.logger.info('_videoDataLoaded');
                this.eventCallback(new MediaEvent('canplay', this));
            },



            /**
             * Handler for all notifications from the native plugin.
             * See inline comments for specific cases.
             */
            _pluginCallback: function(event) {
                // this.logger.info('VisualOn._pluginCallback event.type=' + event.type + ', asset type=' + event.assetType);
                this._currentAssetId = event.assetId || this._currentAssetId;
                this._currentAssetType = event.assetType || this._currentAssetType;
                if(typeof event.position !== 'undefined')
                    this._currentTime = event.position;
                if (typeof event.duration !== 'undefined')
                    this._currentDuration = event.duration;
                switch (event.type) {

                    /**
                     * TODO comment
                     */
                    case 'stateChanged':
                        // this.logger.info('state changed: ' + event.assetId + '[' + event.assetType + '] ' + event.oldState + "->" + event.newState);
                        this._handleStateChange(event.oldState, event.newState);
                        break;


                    /**
                     * Bespoke Freewheel tracking is handled within the plugin.
                     * The wider app is assumed to only be interested in playhead progress
                     * for feature content, so we only trigger an event for that.
                     */
                    case 'positionUpdated':
                        if (event.assetType === VisualOnMediaInterface.ASSET_TYPE_AD) {
                            this._updateAdTracking();
                        } else {
                            this.eventCallback(new MediaEvent('timeupdate', this));
                        }
                        break;


                    case 'playbackEnded':
                        this._result = event.endedReason;
                        this.eventCallback(new MediaEvent('ended', this));
                        break;

                    default:
                        console.log('Unknown event type: ' + event.type);
                }

            },

            /**
             * Wrapper for both storing the error code
             * and triggering a media error event.
             */
            _setError: function(errorCode) {
                this._error = errorCode;
                this.eventCallback(new MediaErrorEvent(this, this._error));
            },

            

            /**
             * Callback for handling messages from native
             * layer relating to playback state changes.
             * Broadly, it's about translating state changes to
             * relevant media events and triggering them.
             * Other menial stuff as req.
             */
            _handleStateChange: function(oldState, newState) {
                switch (newState) {
                    case State.PLAYING:
                        this._clearIsSeeking();
                        this.eventCallback(new MediaEvent('play', this));
                        break;

                    case State.PAUSED:
                        this._clearIsSeeking();
                        this.eventCallback(new MediaEvent('pause', this));
                        break;

                    case State.BUFFERING:
                        this.eventCallback(new MediaEvent('waiting', this));
                        break;

                    case State.ERROR:
                        this._setError(VisualOnMediaInterface.ERROR_CODE_PLAYBACK_ERROR);
                        break;

                    case State.FF:
                    case State.RW:
                        this._isSeeking = true;
                        this.eventCallback(new MediaEvent("seeking", this));
                        break;

                    default:
                        this.logger.debug('Unhandled state change ' + oldState + '->' + newState);
                }
            },

            /**
             * Checks isSeeking flag, if true, sets to false
             * and triggers a 'seeked' event.
             */
            _clearIsSeeking: function() {
                if (this._isSeeking) {
                    this._isSeeking = false;
                    this.eventCallback(new MediaEvent('seeked', this));
                }
            },



            /**
             * Translates playback position to a percentage and, if a valid number,
             * passes to AdData instance where actual tracking calls are
             * assessed and made.
             */
            _updateAdTracking: function() {
                var r = this._currentTime / this._currentDuration;
                if (isNaN(r))
                {
                    return;
                }
                p = Math.floor(r * 100);
                this.adData.track(this._currentAssetId, p, RuntimeContext.getDevice());
            },



            /**
             * Required callback for any call to cordova.exec.
             * Nothing to do...
             */
            _callbackSuccess: function() {
                this.logger.debug('Success: ' + Array.prototype.join.call(arguments));
            },


            /**
             * Required callback for any call to cordova.exec
             * TODO implement some sort of handling here -
             * this method being invoked means a method has
             * not been successfully called on the native plugin.
             */
            _callbackError: function(errorCode) {
                this.logger.warn('Error: ' + errorCode);
                this._setError(errorCode);
            },


        });


        /**
         * Error code returned to JS layer when addListener call fails.
         */
        VisualOnMediaInterface.ERROR_CODE_ADD_LISTENER_FAILED = 201;

        /**
         * Error code returned to JS layer when launchPlayback call fails.
         */
        VisualOnMediaInterface.ERROR_CODE_LAUNCH_FAILED = 202;

        /**
         * Error code returned to JS layer when ongoing playback fails.
         */
        VisualOnMediaInterface.ERROR_CODE_PLAYBACK_ERROR = 203;

        /**
         * Error code returned to JS layer when ongoing playback fails.
         */
        VisualOnMediaInterface.ERROR_CODE_CORDOVA_LIBRARY_NOT_FOUND = 204;

        /**
         * Result code sent by plugin when user has aborted playback.
         */
        VisualOnMediaInterface.RESULT_STOPPED = 0xf0;

        /**
         * Result code sent by plugin when playback has completed.
         */
        VisualOnMediaInterface.RESULT_COMPLETED = 0xf1;

        /**
         * Result code sent by plugin when playback has failed.
         */
        VisualOnMediaInterface.RESULT_FAILED = 0xf2;



        /*___________________________________________________________________________________________________________*/
        // Device.prototype Overrides


        /**
         * Override methods in Device.prototype to return instance of this interface
         */
        Device.prototype.createMediaInterface = function(id, mediaType, eventCallback) {
            this.getLogger().info('Create Media Interface id=' + id + ', mediaType=' + mediaType + ', eventCallback=' + eventCallback);
            return new VisualOnMediaInterface(id, eventCallback);
        };



        Device.prototype.getPlayerEmbedMode = function(mediaType) {
            return MediaInterface.EMBED_MODE_EXTERNAL;
        };


        /**
         * Check to see if volume control is supported on this device.
         * @returns Boolean true if volume control is supported.
         */
        Device.prototype.isVolumeControlSupported = function() {
            return false;
        };

        /**
         * Constant value for assetType.
         */
        VisualOnMediaInterface.ASSET_TYPE_AD = "ASSET_TYPE_AD";

        /**
         * Constant value for assetType.
         */
        VisualOnMediaInterface.ASSET_TYPE_CONTENT = "ASSET_TYPE_CONTENT";

        return VisualOnMediaInterface;
    });
