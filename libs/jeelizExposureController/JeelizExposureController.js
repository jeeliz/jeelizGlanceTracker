 /**
 * JeelizExposureController - https://github.com/jeeliz/jeelizExposureController
 *
 * MIT License
 *
 * Copyright 2018 Jeeliz ( https://jeeliz.com )
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
*/


"use strict";

const JeelizExposureController=(function(){

	//internal states:
	const _states={
		error: -2,
		notLoaded: -1,
		loading: 0,
		idle: 1,
		busy: 2
	};

	let _gl, _glVideoCropTexture, _glCropShp, _glCropShpUniformCropArea, _glCopyShp;
	let _subsampleSize=16;
	let _state=_states.notLoaded;
	let _imageCapture, _video, _cameraCapabilities, _cameraSettings;
	let _cameraExposureNormalized;

	const _readBufferPixel=new Uint8Array(4);
	const _fullArea={
		x:0,y:0,w:1,h:1
	};


	//private functions
	//BEGIN WEBGL HELPERS

	function create_glTexture(){
		_glVideoCropTexture=_gl.createTexture();
		_gl.bindTexture(_gl.TEXTURE_2D, _glVideoCropTexture);
		_gl.texImage2D(_gl.TEXTURE_2D, 0, _gl.RGBA, _subsampleSize,_subsampleSize, 0, _gl.RGBA, _gl.UNSIGNED_BYTE, null);
      	_gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR);
      	_gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.NEAREST_MIPMAP_LINEAR);	
	}

	function build_shp(vertexSource, fragmentSource){
		const GLSLprefix="precision lowp float;\n";

		//compile vertex shader:
		const glVertexShader=_gl.createShader(_gl.VERTEX_SHADER);
		_gl.shaderSource(glVertexShader, GLSLprefix+vertexSource);
		_gl.compileShader(glVertexShader);

		//compile fragment shader:
		const glFragmentShader=_gl.createShader(_gl.FRAGMENT_SHADER);
		_gl.shaderSource(glFragmentShader, GLSLprefix+fragmentSource);
		_gl.compileShader(glFragmentShader);
	    
		//build shader program:
		const glShp=_gl.createProgram();
		_gl.attachShader(glShp, glVertexShader);
 		_gl.attachShader(glShp, glFragmentShader);
 		_gl.linkProgram(glShp);

 		const glAttPosition=_gl.getAttribLocation(glShp, "aat_position");
 		_gl.enableVertexAttribArray(glAttPosition);
 		return glShp;
	}

	function set_shpUniformSource(glShp){
		const glUniformSource=_gl.getUniformLocation(glShp, "uun_source");
		_gl.useProgram(glShp);
		_gl.uniform1i(glUniformSource, 0);
	}

	function create_glShps(){
		const CopyFragmentSource="varying vec2 vUV;\n\
			uniform sampler2D uun_source;\n\
			void main(void){\n\
				gl_FragColor=texture2D(uun_source, vUV);\n\
			}";

		//image crop Shp:
		_glCropShp=build_shp(
			"attribute vec2  aat_position;\n\
			uniform vec4 uun_cropArea;\n\
			varying vec2 vUV;\n\
			void main(void){\n\
				gl_Position=vec4(aat_position,0.,1.);\n\
				vUV=vec2(0.5,0.5)+0.5*(uun_cropArea.xy+aat_position*uun_cropArea.zw);\n\
			}",
			CopyFragmentSource
		);

		//link variables:
		_glCropShpUniformCropArea=_gl.getUniformLocation(_glCropShp, "uun_cropArea");
		set_shpUniformSource(_glCropShp);
	
		//image copy shp:
		_glCopyShp=build_shp("attribute vec2  aat_position;\n\
			varying vec2 vUV;\n\
			void main(void){\n\
				gl_Position=vec4(aat_position,0.,1.);\n\
				vUV=vec2(0.5,0.5)+0.5*aat_position;\n\
			}",
			CopyFragmentSource
		);
		set_shpUniformSource(_glCopyShp);
	} //end create_glShps()
	//END WEBGL HELPERS

	//BEGIN IMAGECAPTUREAPI HELPERS
	function update_cameraSettings(){
		_cameraSettings=_imageCapture['track']['getSettings']();
	}

	function get_cameraExposureRange(){
		const mn=_cameraCapabilities['exposureCompensation']['min'];
		const mx=_cameraCapabilities['exposureCompensation']['max'];
		return [mn, mx];
	}

	function update_cameraExposureNormalized(){
		if (!is_cameraExposureModeManual()){
			_cameraExposureNormalized=0.2;
			return;
		}
		const mnMx=get_cameraExposureRange(); //[min, max]
		const exposure=_cameraSettings['exposureCompensation'];
		_cameraExposureNormalized=(exposure-mnMx[0])/(mnMx[1]-mnMx[0]);
	}

	function set_cameraSetting(setting, value, callback){
		if (_cameraSettings[setting]===value){ //no need to change camera settings :)
			callback(true);
			return;
		}

		const appliedSetting={};
		appliedSetting[setting]=value;

		_imageCapture['track']['applyConstraints'](
			{
				'advanced': [appliedSetting]
			}).then(function(){
				update_cameraSettings();
				callback( _cameraSettings[setting]===value ); //check that the value has really changed
			}).catch(function(error){
				console.log('ERROR in JeelizExposureController - cannot apply', setting, '=', value, ': ', error);
				update_cameraSettings();
				callback(false);
			});
	}

	function set_cameraExposureMode(mode, callback){ //mode = AUTO or MANUAL
		if (mode==='AUTO' && _cameraCapabilities['exposureMode'].indexOf('continuous')===-1){
			callback(false);
			return;
		}

		const modeCap=(mode==='AUTO')?'continuous':'manual';
		if (mode==='AUTO'){
			_cameraExposureNormalized=0.2;
		}
		set_cameraSetting('exposureMode', modeCap, callback);
	}

	function set_cameraExposure(exposureNormalized, callback){ //exposureNormalized is between 0 (exposure min) and 1 (exposure max)
		if (_cameraSettings['exposureMode']!=='manual'){
			console.log('WARNING in JeelizExposureController - set_cameraExposure(): cannot set exposure in continuous mode');
			callback(false);
			return;
		}

		const mnMx=get_cameraExposureRange(); //[min, max]
		const step=_cameraCapabilities['exposureCompensation']['step'];

		//scale:
		let exposure=mnMx[0]+exposureNormalized*(mnMx[1]-mnMx[0]);
		//round to step:
		exposure=step*Math.round(exposure/step);

		set_cameraSetting('exposureCompensation', exposure, callback);
	}

	function is_cameraExposureModeManual(){
		return _cameraSettings['exposureMode']==='manual';
	}

	//END IMAGECAPTUREAPI HELPERS


	//public methods
	const that={
		/*
		<dict> spec with properties:
		  * <WebGLRenderingContext> GL
		  * <int> subsampleSize: size of the subsample area. should be PoT. default: 32
		  * <videoElement> video
		  * <function> callbackReady: function to launch when the library is ready.
		           The callback function is launched with an argument, the error code.
		*/
		'init': function(spec){
			//check we can start:
			if (!that['test_compatibility']()){
				spec['callbackReady']('IMAGECAPTUREAPI_NOTFOUND');
				return false;
			}
			if (_state!==_states.notLoaded){
				spec['callbackReady']('ALREADY_INITIALIZED');
				return false;
			}
			if (typeof(spec['subsampleSize'])!=='undefined'){
				_subsampleSize=spec['subsampleSize'];
			}
			_state=_states.loading;
			_video=spec['videoElement'];
			_gl=spec['GL'];
			

			//get the video track and init imageCapture:
			let track;
			try{
				const mediaStream=_video['srcObject'];
				track = mediaStream.getVideoTracks()[0];
			} catch(e){
				spec['callbackReady']('NO_VIDEOTRACK');
				return false;
			}
			try {
				_imageCapture = new ImageCapture(track);
			} catch(e){
				spec['callbackReady']('INVALID_VIDEOTRACK');
				return false;
			}

			try {
				_cameraCapabilities = _imageCapture['track']['getCapabilities']();
			} catch(e){
				spec['callbackReady']('NO_CAMERACAPABILITIES');
				return false;
			}

			if (!_cameraCapabilities['exposureMode'] || ! _cameraCapabilities['exposureCompensation']
				|| _cameraCapabilities['exposureMode'].indexOf('manual')===-1){
				spec['callbackReady']('INVALID_CAMERACAPABILITIES');
				return false;
			}

			try {
				_cameraSettings = _imageCapture['track']['getSettings']();
			} catch(e){
				spec['callbackReady']('NO_CAMERASETTINGS');
				return false;
			}

			if (!_cameraSettings['exposureMode'] || ! _cameraSettings['exposureCompensation']){
				spec['callbackReady']('INVALID_CAMERASETTINGS');
				return false;
			}

			//create WebGL objects
			create_glTexture();
			create_glShps();

			update_cameraExposureNormalized();

			//for debug:
			//window.debugIc=_imageCapture, window.debugCap=_cameraCapabilities, window.debugSet=_cameraSettings;

			_state=_states.idle;
			spec['callbackReady'](false);
			return true;
		},

		/*
		<WebGLTexture> glTexture: texture with the video
		<dict> area with properties:
		  * <float> x: hzt position of the center of the area, in [-1,1] from left to right
		  * <float> y: vt position of the center of the area, in [-1,1] from bottom to top
		  * <float> w: width of the area, in [0,1] (1-> full width)
		  * <float> h: height of the area, in [0,1] (1-> full height)
		<float> adjustedLightness: target lightness in [0,1]. Advised: 0.5
		<float> epsilon: target precision. Advised: 0.05
		<float> relaxationFactor: factor of relaxation, in [0,1]. Advised: 0.1
		<function> callback: function to launch as soon as the lightness is adjusted
		*/
		'adjust': function(glTexture, area, adjustedLightness, epsilon, relaxationFactor, callback){
			if (_state!==_states.idle){
				callback(false);
				return;
			}
			
			_state=_states.busy;

			//render cropped glTexture on _glVideoCropTexture:
			_gl.useProgram(_glCropShp);
			_gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, _glVideoCropTexture, 0);
			_gl.activeTexture(_gl.TEXTURE0);
			_gl.bindTexture(_gl.TEXTURE_2D, glTexture);
			_gl.viewport(0,0,_subsampleSize,_subsampleSize);
			_gl.uniform4f(_glCropShpUniformCropArea, area.x, area.y, area.w, area.h);
			_gl.drawElements(_gl.TRIANGLES, 3, _gl.UNSIGNED_SHORT, 0); //fill viewport
			
			//display _glVideoCropTexture on a 1x1 pixels viewport and read the result
			_gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
			_gl.useProgram(_glCopyShp);
			_gl.bindTexture(_gl.TEXTURE_2D, _glVideoCropTexture);
			_gl.generateMipmap(_gl.TEXTURE_2D);
			_gl.viewport(0,0,1,1);
			_gl.drawElements(_gl.TRIANGLES, 3, _gl.UNSIGNED_SHORT, 0);
    		
    		//read rendering
    		_gl.readPixels(0,0, 1,1, _gl.RGBA, _gl.UNSIGNED_BYTE, _readBufferPixel);
    		const lightness=(_readBufferPixel[0]+_readBufferPixel[1]+_readBufferPixel[2])/(255*3.0);
    		//console.log(lightness);
    		const dLightness=lightness-adjustedLightness; //error
    		if (Math.abs(dLightness)<epsilon){
    			_state=_states.idle;
    			callback(true);
    			//setTimeout(callback.bind(null, true), 1000);
    			return;
    		}

    		
    		//if dLightness>0, we should lower the exposure //and conversely
    		_cameraExposureNormalized-=dLightness*relaxationFactor;

    		//clamp the _cameraExposureNormalized
    		_cameraExposureNormalized=Math.max(_cameraExposureNormalized, 0.01);
			_cameraExposureNormalized=Math.min(_cameraExposureNormalized, 1.0);

			//console.log(_cameraExposureNormalized, lightness);

			that['set_manualExposure'](_cameraExposureNormalized, function(isSuccess){
				_state=_states.idle;
				callback(false);
				//setTimeout(callback.bind(null, false), 1000);
    			
			});

			//for debug: draw input texture in fullscreen:
			//_gl.viewport(0,0,_gl['canvas']['width'],_gl['canvas']['height']);
			//_gl.drawElements(_gl.TRIANGLES, 3, _gl.UNSIGNED_SHORT, 0);	
		},

		//same than 'adjust' except that the adjustment area is the whole glTexture.
		//the glTexture needs to be in GL.NEAREST_MIPMAP_LINEAR for GL.MIN_FILTER
		'adjust_full': function(glTexture, adjustedLightness, epsilon, relaxationFactor, callback){
			that['adjust'](glTexture, _fullArea, adjustedLightness, epsilon, relaxationFactor, callback);
		},

		'toggle_auto': function(callback){
			set_cameraExposureMode('AUTO', callback);
		},

		'set_manualExposure': function(exposure, callback){
			if (is_cameraExposureModeManual()){
				set_cameraExposure(exposure, callback);
				return;
			}
			set_cameraExposureMode('MANUAL', function(isSuccess){
				if (!isSuccess){
					callback(false);
					return;
				}
				set_cameraExposure(exposure, callback);
			})
		},

		'test_compatibility': function(){
			return (window['ImageCapture'])?true:false;
		}

	}; //end that
	return that;
})();
