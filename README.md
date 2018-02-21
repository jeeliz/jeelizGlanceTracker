# jeelizGlanceTracker

This library detects if the user is looking at the screen or not. Great for play/pause videos !

You can test it with these demos (included in this repo) :
* [Simple integration demo](https://jeeliz.com/demos/glanceTracker/integrationDemo2)
* [Youtube integration demo](https://jeeliz.com/demos/glanceTracker/integrationDemoYoutube)
* [Old and ugly integration demo](https://jeeliz.com/demos/glanceTracker/integrationDemo)


## Integration
On your HTML page, you first need to include the main script between the tags `<head>` and `</head>` :
```
 <script type="text/javascript" src="dist/jeelizGlanceTracker.js"></script>
```
Then you should include a `CANVAS` HTML element in the DOM, between the tags `<body>` and `</body>` :
```
<canvas id='glanceTrackerCanvas'></canvas>
```
This canvas will be used by WebGL for the computation and the display of the video. It can be hidden.
When your page is loaded or when you want to enable the glance tracking feature you should launch this function :
```
GLANCETRACKERAPI.init({
    // MANDATORY :
    // callback launched when :
    //  * the user is watching (isWatching=true) 
    //  * or when he stops watching (isWatching=false)
    // it can be used to play/pause a video
    callbackTrack: function(isWatching){
        if (isWatching){
        	console.log('Hey, you are watching bro');
    	} else {
    		console.log('You are not watching anymore :(');
    	}
    },

    // FACULTATIVE (default: none) :
    // callback launched when then Jeeliz Glance Tracker is ready
    // or if there was an error
    callbackReady: function(error){
        if (error){
            console.log('EN ERROR happens', error);
            return;
        }
        console.log('All is well :)');
    },

    //FACULTATIVE (default: true) :
    //true if we display the video of the user
    //with the face detection area on the <canvas> element
    isDisplayVideo: true,

    // MANDATORY :
    // id of the <canvas> HTML element
    canvasId: 'glanceTrackerCanvas',

    // FACULTATIVE (default: internal)
    // sensibility to the head vertical axis rotation
    // float between 0 and 1 : 
    // * if 0, very sensitive, the user is considered as not watching
    //   if he slightly turns his head,
    // * if 1, not very sensitive : the user has to turn the head a lot
    //   to loose the detection. 
    sensibility: 0.5,

    // FACULTATIVE (default: current directory)
    // should be given without the NNC.json
    // and ending by /
    // for example ../../
    NNCpath: '/path/of/NNC.json'
}
```


## Integration sample
In the paths `/integrationDemo*`, you will find several integration samples. Just serve them through a HTTPS server.


## Other methods
After the initialization, these methods are available :

* `GLANCETRACKERAPI.set_sensibility(<float> sensibility)` : adjust the sensibility (between 0 and 1),

* `GLANCETRACKERAPI.toggle_pause(<boolean> isPause)` : pause/resume the face tracking,

* `GLANCETRACKERAPI.toggle_display(<boolean> isDisplay)` : toggle the display of the video with the face detection area on the HTML `<canvas>` element. It is better to disable the display if the canvas element is hidden (using CSS for example). It will save some GPU resources.


You should use them after initialization, ie :
* either after that `callbackReady` function provided as initialization argument is launched (better),
* or when the boolean property `GLANCETRACKERAPI.ready` switches to `true`.



## Hosting
### HTTPS only !
Because the tracker requires the user's webcam stream through `MediaStream API`, your application should be served through HTTPS (even with a self-signed certificate). It won't work at all with unsecure HTTP, even locally.

### The scripts
You can use our hosted and up to date version of the library, available here :
```
https://appstatic.jeeliz.com/glanceTracker/jeelizGlanceTracker.js
```
It is served through a content delivery network (CDN) using gzip compression.
If you host the scripts by yourself, be careful to enable gzip HTTP/HTTPS compression for .JSON and .JS files. Indeed, the neuron network JSON file, `dist/NNC.json` is quite heavy, but very well compressed with GZIP. You can check the gzip compression of your server [here](https://checkgzipcompression.com/).



## License
[Apache 2.0](http://www.apache.org/licenses/LICENSE-2.0.html). This application is free for both commercial and non-commercial use.

We appreciate attribution by including the Jeeliz logo and link to the [Jeeliz website](https://jeeliz.com) in your application.