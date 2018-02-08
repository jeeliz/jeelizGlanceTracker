#!/bin/sh
echo 'Deploying integration demos'
scp -r ../integrationDemo ../integrationDemo2 ../integrationDemoYoutube jeeliz@spacegoo.com:/home/jeeliz/www/demos/glanceTracker/
echo 'Demos deployed!'