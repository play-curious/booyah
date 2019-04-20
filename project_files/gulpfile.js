const gulp = require('gulp');
const htmlreplace = require('gulp-html-replace');
const rollup = require('rollup');
const resolve = require('rollup-plugin-node-resolve');
const babel = require('rollup-plugin-babel');
const del = require('del');
const uglify = require('gulp-uglify');
const pump = require('pump');
const transform = require('gulp-transform');
const csvparse = require('csv-parse/lib/sync');
const rename = require('gulp-rename');
const useref = require('gulp-useref');
const exec = require('child_process').exec;
const fs = require('fs');

// Read the name of the game from the package.json file
const PACKAGE = JSON.parse(fs.readFileSync('./package.json'));
const SITE_DIR =  process.env.SITE_DIR || `${process.env.HOME}/projects/play-curious/play-curious-site/`;
const DEPLOY_DIR = `${SITE_DIR}/games/${PACKAGE.name}/`;
const TIME_PER_WORD = 60000 / 200; // 200 words per minute


function clean() {
  return del(['build', 'dist']);
}
exports.clean = clean;

async function bundle() {
  const bundle = await rollup.rollup({
    input: 'src/game.js',
    plugins: [
      resolve(),
      babel({
        exclude: [
          'node_modules/**',
          'booyah/project_files/**',
        ],
      })
    ]
  });

  await bundle.write({
    file: 'build/bundle.js',
    format: 'umd',
    name: 'bundle'
  });
};
exports.bundle = bundle;

// Neither useref nor htmlreplace does the complete job, so combine them
// First use html-replace to rename the bundle file, then have useref concat the dependencies
function writeHtml() {
  return gulp.src('index.html')
    .pipe(htmlreplace({
      'js-bundle': 'bundle.js'
    })).pipe(useref())
    .pipe(gulp.dest('build/'));
};
exports.writeHtml = writeHtml;

function copyBuildAssets() {
  return gulp.src([
    './game.css',
    './audio/**',
    './fonts/**/*.{css,woff,woff2}',
    './images/**',
    './scripts/**',
    './video/**',
    './booyah/fonts/**/*.{css,woff,woff2}',
    './booyah/images/**',
  ], { base: '.'})
  .pipe(gulp.dest('build/'));
};
exports.copyBuildAssets = copyBuildAssets;

function compress(cb) {
  pump([
    gulp.src('build/**/*.js'),
    uglify(),
    gulp.dest('dist')
    ], cb
  );
};
exports.compress = compress;

function copyDistAssets() {
  return gulp.src([
    './build/index.html',
    './build/game.css',
    './build/audio/**',
    './build/fonts/**',
    './build/images/**',
    './build/scripts/**',
    './build/video/**',
    './build/booyah/**',
  ], { base: './build'})
  .pipe(gulp.dest('dist/'));
};
exports.copyDistAssets = copyDistAssets;

exports.cleanSite = function cleanSite() {
  return del(DEPLOY_DIR, { force: true });
};

function copyToSite() {
  return gulp.src('dist/**')
    .pipe(gulp.dest(DEPLOY_DIR));
}
exports.copyToSite = copyToSite;

function deploySite(cb) {
  const command = `git add games/${PACKAGE.name} && git commit -m "Updated game ${PACKAGE.name}" && git push && ./build-and-deploy.sh`;
  exec(command, { cwd: SITE_DIR }, (err, stdout, stderr) => { 
    console.log(stdout);
    console.error(stderr);

    cb(err); 
  });
}
exports.deploySite = deploySite;

function watchFiles() {
  gulp.watch('src/*', bundle);
  gulp.watch('index.html', writeHtml);
  gulp.watch(['images/*', 'deps/*', '*.css'], copyBuildAssets);
};
exports.watchFiles = watchFiles;


function convertScriptToJson(csvText) {
  const csv = csvparse(csvText, { delimiter: '\t' });

  // Regular expression to match dialog lines like "[Malo:481] Ahoy there, matey!"
  const r = /^(?:\[([^:]+)?(?:\:(\d+))?\])?(.*)/;

  const json = {};

  // Skip first line
  for(var lineNumber = 1; lineNumber < csv.length; lineNumber++) {
    const [clip, skipFile, duration, text] = csv[lineNumber];
    // Skip empty lines
    if(!clip) continue;

    // TODO: handle case of compacting small files into bigger one 

    // Split text into lines, associate with speaker
    // Use double-dash to replace the newline character, which doesn't download in TSV format
    const dialogLines = [];
    for(const textLine of text.split("--")) {
      // speaker and start can both be undefined, and will be stripped from the JSON output
      let [, speaker, start, dialog] = r.exec(textLine);
      dialog = dialog.trim();
      if(dialog.length > 0) {
        dialogLines.push({ 
          speaker, 
          text: dialog,
          start
        });
      }
    }

    if(skipFile) {
      // Handle "skip file" mode

      // If the duration is not provided, estimate it
      let calculatedDuration;
      if(duration) calculatedDuration = parseInt(duration);
      else {
        const wordCount = text.trim().split(/[\s\.\!\?]+/).length;
        calculatedDuration = wordCount * TIME_PER_WORD;
      } 

      json[clip] = { 
        skipFile: true,
        start: 0,
        end: calculatedDuration,
        dialog: dialogLines
      };
    } else {
      // Use normal files
      json[clip] = { 
        dialog: dialogLines
      };
    }
  }

  return JSON.stringify(json, null, 2)
}

gulp.task('convertScripts', () => {
  return gulp.src(['script_src/*.tsv'])
    .pipe(transform('utf8', convertScriptToJson))
    .pipe(rename({ extname: '.json' }))
    .pipe(gulp.dest('scripts/'));
});

exports.convertVoices = function convertVoices(cb) {
  const command = `
    for wav in voices_src/fr/*.wav
    do
      output_filename=$(basename $wav .wav)
      ffmpeg -y -i $wav audio/voices/fr/$output_filename.mp3
    done`;
 exec(command, {}, (err, stdout, stderr) => { 
    console.log(stdout);
    console.error(stderr);

    cb(err); 
  });
};

// Meta-tasks

const build = gulp.series(clean, gulp.parallel([bundle, writeHtml, copyBuildAssets]));
exports.build = build;

const dist = gulp.series(build, gulp.parallel([compress, copyDistAssets]));
exports.dist = dist;

const deploy = gulp.series(dist, copyToSite, deploySite);
exports.deploy = deploy;

const watch = gulp.series(build, watchFiles);
exports.watch = watch;

exports.default = build;
