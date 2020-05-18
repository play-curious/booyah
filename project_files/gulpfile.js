const gulp = require("gulp");
const htmlreplace = require("gulp-html-replace");
const rollup = require("rollup");
const resolve = require("rollup-plugin-node-resolve");
const commonjs = require("rollup-plugin-commonjs");
const babel = require("rollup-plugin-babel");
const del = require("del");
const uglify = require("gulp-uglify");
const pump = require("pump");
const transform = require("gulp-transform");
const csvparse = require("csv-parse/lib/sync");
const rename = require("gulp-rename");
const useref = require("gulp-useref");
const exec = require("child_process").exec;
const fs = require("fs");
const download = require("gulp-download-stream");
const template = require("gulp-template");
const git = require("git-rev-sync");

// Read the name of the game from the package.json file
const PACKAGE = require("./package.json");
const SITE_DIR =
  process.env.SITE_DIR ||
  `${process.env.HOME}/projects/play-curious/play-curious-site`;
const DEPLOY_DIR = `${SITE_DIR}/games/${PACKAGE.name}/`;

function clean() {
  return del(["build", "dist"]);
}
exports.clean = clean;

async function bundle() {
  const bundle = await rollup.rollup({
    input: "src/game.js",
    plugins: [
      resolve(),
      commonjs(),
      babel({
        exclude: ["node_modules/**", "booyah/project_files/**"]
      })
    ]
  });

  await bundle.write({
    file: "build/bundle.js",
    format: "umd",
    name: "bundle"
  });
}
exports.bundle = bundle;

// Neither useref nor htmlreplace does the complete job, so combine them
// First use html-replace to rename the bundle file, then have useref concat the dependencies
function writeHtml() {
  return gulp
    .src("index.html")
    .pipe(
      template({ date: new Date(), commit: git.short(), branch: git.branch() })
    )
    .pipe(
      htmlreplace({
        "js-bundle": "bundle.js"
      })
    )
    .pipe(useref())
    .pipe(gulp.dest("build/"));
}
exports.writeHtml = writeHtml;

function copyBuildAssets() {
  return gulp
    .src(
      [
        "./game.css",
        "./audio/**",
        "./fonts/**/*.{css,woff,woff2}",
        "./images/**",
        "./text/**",
        "./video/**",
        "./booyah/fonts/**/*.{css,woff,woff2}",
        "./booyah/images/**"
      ],
      { base: "." }
    )
    .pipe(gulp.dest("build/"));
}
exports.copyBuildAssets = copyBuildAssets;

function compress(cb) {
  pump([gulp.src("build/**/*.js"), uglify(), gulp.dest("dist")], cb);
}
exports.compress = compress;

function copyDistAssets() {
  return gulp
    .src(
      [
        "./build/index.html",
        "./build/game.css",
        "./build/audio/**",
        "./build/fonts/**",
        "./build/images/**",
        "./build/text/**",
        "./build/video/**",
        "./build/booyah/**"
      ],
      { base: "./build" }
    )
    .pipe(gulp.dest("dist/"));
}
exports.copyDistAssets = copyDistAssets;

async function deployInfo() {
  console.log(`Set to deploy to ${DEPLOY_DIR}`);
}
exports.deployInfo = deployInfo;

exports.cleanSite = function cleanSite() {
  return del(DEPLOY_DIR, { force: true });
};

function copyToSite() {
  return gulp.src("dist/**").pipe(gulp.dest(DEPLOY_DIR));
}
exports.copyToSite = copyToSite;

function deploySite(cb) {
  const command = `git add games/${
    PACKAGE.name
  } && git commit -m "Updated game ${
    PACKAGE.name
  }" && git push && ./build-and-deploy.sh`;
  exec(command, { cwd: SITE_DIR }, (err, stdout, stderr) => {
    console.log(stdout);
    console.error(stderr);

    cb(err);
  });
}
exports.deploySite = deploySite;

function watchFiles() {
  gulp.watch("src/*", bundle);
  gulp.watch("index.html", writeHtml);
  gulp.watch(["images/*", "deps/*", "*.css"], copyBuildAssets);
}
exports.watchFiles = watchFiles;

function convertTsvToJson(csvText) {
  const lines = csvparse(csvText, {
    columns: true,
    delimiter: "\t"
  });

  const output = {};
  for (const line of lines) {
    if (line.ID === "") continue;

    const obj = {};
    for (const key in line) {
      obj[key.toLowerCase()] = line[key];
    }
    output[line.ID] = obj;
  }

  return JSON.stringify(output, null, 2);
}

function convertTextToJson() {
  return gulp
    .src(["text_src/*.tsv"])
    .pipe(transform("utf8", convertTsvToJson))
    .pipe(rename({ extname: ".json" }))
    .pipe(gulp.dest("text/"));
}
exports.convertTextToJson = convertTextToJson;

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

const build = gulp.series(
  clean,
  gulp.parallel([bundle, writeHtml, copyBuildAssets])
);
exports.build = build;

const dist = gulp.series(build, gulp.parallel([compress, copyDistAssets]));
exports.dist = dist;

const deploy = gulp.series(deployInfo, dist, copyToSite, deploySite);
exports.deploy = deploy;

const watch = gulp.series(build, watchFiles);
exports.watch = watch;

const downloadAndConvertText = gulp.series(downloadText, convertTextToJson);
exports.downloadAndConvertText = downloadAndConvertText;

exports.default = build;
