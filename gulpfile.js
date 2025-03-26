'use strict';

/* eslint-env node */

const globalagent = require('global-agent');
const cssValidator = require('w3c-css-validator');
const htmlvalidate = require('gulp-html');
const bs = require('browser-sync');

const gulp = require('gulp');
const colors = require('ansi-colors');
const map = require('map-stream');
var through2 = require('through2');
var PluginError = require('plugin-error');
var extend = require('lodash.assign');
var Buffer = require('buffer').Buffer;

const cssSrcPath = '*.css';
const htmlSrcPath = '*.html';

// set HTTP_PROXY environment variables if not set (and http_proxy is..)
if( process.env.HTTP_PROXY == undefined && process.env.http_proxy != undefined)
    process.env.HTTP_PROXY = process.env.http_proxy
if( process.env.HTTPS_PROXY == undefined && process.env.http_proxy != undefined)
    process.env.HTTPS_PROXY = process.env.https_proxy

// configure global proxy for css-validator
globalagent.bootstrap({environmentVariableNamespace : ""});

const cssvalidate = function (params) {
    params = params || {};
    var sleep = params.sleep || 1500;
  
    var lastCall;
  
    return through2.obj( function(file, enc, cb) {
    if(file.isNull()) {
      return cb(null, file);
    }

    if(file.isStream()) {
      return cb(new PluginError('w3c-css-validator', 'Streaming not supported'));
    }

    var sleepValue = (lastCall ? ((Date.now() - lastCall) < sleep ? sleep : 0) : 0);

    var p = extend({ text: file.contents }, params);
    setTimeout(async function() {
        var result = { errors: [], warnings: []};
        try{
            result = await cssValidator.validateText(p.text.toString(),{
                warningLevel : 2
            });
            lastCall = Date.now();
        }
        catch(err) {
            cb(new PluginError('w3c-css-validator', err));
        }
        file.contents = (result.errors.length || result.warnings.length) ? Buffer.from(JSON.stringify(result)) : Buffer.alloc(0);
        cb(null, file);
        
    }, sleepValue);
  });
};

gulp.task('validatecss', function (done) {
    bs.reload();
    gulp.src(cssSrcPath)
        .pipe(cssvalidate())
        .pipe(map(function (file, done) {
            console.log('============== CSS ==================');
            if (file.contents.length === 0) {
                console.log('Success: ' + file.path);
                console.log(colors.green('No errors or warnings\n'));
            }
            else {
                const results = JSON.parse(file.contents.toString());
                results.errors.forEach(function (error) {
                    console.log('Error: ' + file.path + ': line ' + error.line);
                    console.log(colors.red(error.message) + '\n');
                });
                results.warnings.forEach(function (warning) {
                    console.log('Warning: ' + file.path + ': line ' + warning.line);
                    console.log(colors.yellow(warning.message) + '\n');
                });
                console.log(results.errors.length + ' error - ' + results.warnings.length + ' warnings\n');
            }
            done(null, file);
        }));
    done();
});

gulp.task('validatehtml', function (done) {
    let status = true;
    bs.reload();
    gulp.src(htmlSrcPath)
        .pipe(htmlvalidate({'Werror':true}))
        .on('error', function (error){
            status = false;
            console.log('============== HTML ==================');
            let nbErrors = 0;
            let nbWarnings = 0;
            let lines = error.message.split('\n');
            lines.forEach(function (line) {
                let parts=line.split(':');
                if( parts.length >= 4){
                    if( parts[3].trim() === 'error' ){
                        console.log(colors.red(line));
                        nbErrors++;
                    }
                    else if ( parts[3].trim() === 'info warning' )
                    {
                        console.log(colors.yellow(line));
                        nbWarnings++
                    }
                    else
                        console.log(line);
                }
            });
            console.log(nbErrors + ' error - ' + nbWarnings + ' warnings\n');
        })
        .on('end', function(message) {
            if (status === true) {
                console.log(colors.green('No errors or warnings\n'));
            }
        })
        .pipe(map(function (file, done) {
            console.log('============== HTML ==================');
            done(null, file);
        }));
    done();
});

gulp.task('browser-sync', function (done) {
    bs.init({
        server: {
            baseDir: './',
        },
    });
    done();
});

gulp.task('watch', function (done) {
    gulp.watch(htmlSrcPath).on('change', gulp.series('validatehtml'));
    gulp.watch(cssSrcPath).on('change', gulp.series('validatecss'));
    done();

});

gulp.task('validate', gulp.series('validatehtml', 'validatecss'));

// The default task (called when you run `gulp` from cli)
gulp.task('default', gulp.series('validate', 'watch', 'browser-sync'));

