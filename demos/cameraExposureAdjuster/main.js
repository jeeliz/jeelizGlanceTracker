"use strict"

const _states={
    error: -2,
    notLoaded: -1,
    loading: 0,
    idle: 1
};
let _state=_states.notLoaded;
let _isFaceDetected=false;
let _glVideoTextureCut, _glVideoTexture, _gl, _glFBO, _glDrawTarget;
//let _faceDetectedOrLostCallback=false;
let _adjustTimer=false;
let _relaxationFactor=0.05;
let _last_t=Date.now();


//entry point:
function main(){
    if (_state!==_states.notLoaded){
        return;
    }
    _state=_states.loading;
    init_glanceTracking()
}

function on_error(errCode){
    if (_state===_states.error){
        return;
    }
    alert('ERROR: '+errCode);
    _state=_states.error;
}

function init_glanceTracking(){
    _state=_states.loading;
    GLANCETRACKERAPI.init({
        callbackTrack: function(isDetected){
            console.log('DETECTION changed ! isDetected = ', isDetected);
            _isFaceDetected=isDetected;
            /*if (_faceDetectedOrLostCallback){
                _faceDetectedOrLostCallback();
            }*/
        },

        callbackReady: function(errCode, specInit){

            if (errCode){
                on_error('GLANCETRACKER - '+errCode)
                return;
            }
            
            console.log('GLANCETRACKERAPI is READY YEAH !');
            init_exposureController(specInit);
            GLANCETRACKERAPI.toggle_pause(true);

            //setTimeout(GLANCETRACKERAPI.toggle_pause.bind(null, true), 1);
        },

        sensibility: 0.3,
        isDisplayVideo: true,
        canvasId: 'glanceTrackerCanvas',
        NNCpath: '../../dist/' //where is NNC.json ?
    }); //end GLANCETRACKERAPI.init call
}; //end init()

function init_exposureController(spec){
    //enable mipmapping of glVideoTextureCut (required by the exposure controller)!
    _gl=spec.GL;
    const isWebGL2=_gl instanceof(WebGL2RenderingContext);
    _glVideoTextureCut=spec.videoTextureCut;
    _glVideoTexture=spec.videoTexture;
    
    _glFBO=_gl.createFramebuffer();
    _glDrawTarget=(isWebGL2 && _gl['DRAW_FRAMEBUFFER'])?_gl['DRAW_FRAMEBUFFER']:_gl.FRAMEBUFFER;
  
    //init exposure controller:
    JeelizExposureController.init({
        GL: spec.GL,
        videoElement: spec.video,
        subsampleSize: 16,
        callbackReady: function(errCode){
            if (errCode){
                on_error('JeelizExposureController - '+errCode);
                return;
            }
            _state=_states.idle;
            JeelizExposureController.set_manualExposure(0.5, function(){
                setTimeout(start_adjusting, 200);
            });
            /*console.log('TOGGLE TO AUTO EXPOSURE MODE');
            JeelizExposureController.toggle_auto(function(){
                setTimeout(start_adjusting, 200);
            });*/
        }
    })
}


function start_adjusting(){
    console.log('START ADJUSTING...');
    GLANCETRACKERAPI.toggle_pause(false);
    //ok, now as soon as we detect the face
    //we toggle to camera exposure manual mode
    //and we start exposure adjustment

    /*_faceDetectedOrLostCallback=function(){
        if (_isFaceDetected){
            adjust();
        } else { //face is lost
            GLANCETRACKERAPI.toggle_pause(true);
            if (_adjustTimer){
                clearTimeout(_adjustTimer);
                _adjustTimer=false;
            }
            JeelizExposureController.toggle_auto(function(){
                GLANCETRACKERAPI.toggle_pause(false);
            });
        }   
    }*/
    adjust();
}

function tick_adjust(isAdjusted){
    if (_adjustTimer){
        clearTimeout(_adjustTimer);
    }
    if (isAdjusted){
        console.log('INFO in tick_adjust(): lightness well adjusted');
    }
    _relaxationFactor=(isAdjusted)?0.02:0.05;
    _adjustTimer=setTimeout(adjust, (isAdjusted)?1000:50);
}

function adjust(){
    if (_isFaceDetected){
        _gl.bindFramebuffer(_glDrawTarget, _glFBO);
        JeelizExposureController.adjust_full(_glVideoTextureCut, 0.5, 0.02, _relaxationFactor, tick_adjust);
    } else {
        const expoNormalized=0.5+0.5*Math.sin(0.005*(Date.now()-_last_t));
        const expo=0.05+expoNormalized*0.3;
        _last_t=Date.now();
        console.log(expo);
        JeelizExposureController.set_manualExposure(expo, tick_adjust.bind(null, false));
    }
}