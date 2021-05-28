import * as PIXI from "pixi.js";
import { Howl, Howler } from "howler";
import _ from "underscore";

import * as entity from "./entity";
import * as audio from "./audio";
import * as util from "./util";
import { collapseTextChangeRangesAcrossMultipleVersions } from "typescript";

const TIME_PER_WORD = 60000 / 200; // 200 words per minute

export type DialogLine = {
  speaker?: string;
  text: string;
  start?: number;
};

export class SubtitleNarratorTextStyle {
  fontFamily = "Teko";
  fontSize = 40;
  fill = "white";
  strokeThickness = 4;
  align = "center";
  wordWrapWidth: number;
}

export class SubtitleNarratorOptions {
  position: PIXI.IPointData;
  textStyle: Partial<SubtitleNarratorTextStyle> =
    new SubtitleNarratorTextStyle();
}

/**
 * Events:
 *  done - key (string)
 */
export class SubtitleNarrator extends entity.CompositeEntity {
  private subtitleTexts: { [k: string]: { [k: string]: any } };
  private container: PIXI.Container;
  private narratorSubtitle: PIXI.Text;
  private key: string | null;
  private timeSincePlay: number | null;
  private lines: DialogLine[] | null;
  private nextLineAt: number | null;
  private lineIndex: number | null;
  private _options: SubtitleNarratorOptions;

  constructor(options?: Partial<SubtitleNarratorOptions>) {
    super();

    this._options = util.fillInOptions(options, new SubtitleNarratorOptions());
    this._options.textStyle = util.fillInOptions(
      options.textStyle,
      new SubtitleNarratorTextStyle()
    );
  }

  _setup() {
    this.subtitleTexts = this._entityConfig.jsonAssets.subtitles;

    this.container = new PIXI.Container();
    this._entityConfig.container.addChild(this.container);

    const styleOptions = _.defaults(this._options.textStyle, {
      wordWrap: true,
      wordWrapWidth: this._entityConfig.app.screen.width - 150,
    });

    this.narratorSubtitle = new PIXI.Text("", styleOptions);
    this.narratorSubtitle.anchor.set(0.5, 0.5);

    if (this._options.position) {
      this.narratorSubtitle.position.copyFrom(this._options.position);
    } else {
      this.narratorSubtitle.position.set(
        this._entityConfig.app.screen.width / 2,
        this._entityConfig.app.screen.height - 75
      );
    }
    this.container.addChild(this.narratorSubtitle);

    this.key = null;
    this.timeSincePlay = null;
    this.lines = null;
    this.nextLineAt = null;

    this._on(
      this._entityConfig.playOptions,
      "showSubtitles",
      this._updateShowSubtitles
    );

    this._updateShowSubtitles();
  }

  _update() {
    if (!this.key || this._lastFrameInfo.gameState !== "playing") return;

    this.timeSincePlay += this._lastFrameInfo.timeSinceLastFrame;
    this._updateSubtitle();
  }

  _teardown() {
    this._entityConfig.container.removeChild(this.container);
  }

  changeKey(key: string) {
    if (!_.has(this.subtitleTexts, key)) {
      console.error("No key", key, "in narration table");
      return;
    }

    this._stopNarration();
    this._initNarration(key);
  }

  stopNarration() {
    this._stopNarration();
  }

  _onSignal(frameInfo: entity.FrameInfo, signal: string) {
    if (signal === "reset") this._stopNarration();
  }

  _initNarration(key: string) {
    this.key = key;
    this.timeSincePlay = 0;
    this.lines = breakDialogIntoLines(this.subtitleTexts[key].text);

    if (this.lines[0].start) {
      // Wait for first line
      this.lineIndex = -1;
    } else {
      // Start first line now
      this.lineIndex = 0;
      this.narratorSubtitle.text = this.lines[0].text;
    }
    this._updateNextLineAt();
  }

  _stopNarration() {
    if (!this.key) return;

    this.emit("done", this.key);

    this.key = null;
    this.timeSincePlay = null;
    this.lines = null;
    this.nextLineAt = null;

    this.narratorSubtitle.text = "";
  }

  // Must be called after his.lines, this.lineIndex, etc.. have been set
  _updateNextLineAt() {
    if (
      this.lineIndex < this.lines.length - 1 &&
      this.lines[this.lineIndex + 1].start
    ) {
      this.nextLineAt = this.lines[this.lineIndex + 1].start;
    } else {
      this.nextLineAt =
        this.timeSincePlay +
        estimateDuration(this.lines[this.lineIndex].text, TIME_PER_WORD);
    }
  }

  _updateSubtitle() {
    if (this.nextLineAt >= this.timeSincePlay) return;

    this.lineIndex++;
    if (this.lineIndex < this.lines.length) {
      this._updateNextLineAt();
      this.narratorSubtitle.text = this.lines[this.lineIndex].text;
    } else {
      this._stopNarration();
    }
  }

  _updateShowSubtitles() {
    const showSubtitles = this._entityConfig.playOptions.options.showSubtitles;
    this.container.visible = showSubtitles;
  }
}

export function makeInstallSubtitleNarrator(
  options?: Partial<SubtitleNarratorOptions>
) {
  function installSubtitleNarrator(
    rootConfig: entity.EntityConfig,
    rootEntity: entity.ParallelEntity
  ) {
    rootConfig.narrator = new SubtitleNarrator(options);
    rootEntity.addChildEntity(rootConfig.narrator);
  }

  return installSubtitleNarrator;
}

export class SpeakerDisplay extends entity.EntityBase {
  public container: PIXI.Container;
  public namesToSprites: { [name: string]: PIXI.Sprite };
  public currentSpeakerName: string;

  constructor(
    public namesToImages: { [name: string]: string },
    public position = new PIXI.Point(50, 540)
  ) {
    super();
  }

  _setup(frameInfo: entity.FrameInfo, entityConfig: entity.EntityConfig) {
    this.container = new PIXI.Container();
    this.container.position.copyFrom(this.position);

    // Make a hidden sprite for each texture, add it to the container
    this.namesToSprites = _.mapObject(this.namesToImages, (image) => {
      const sprite = new PIXI.Sprite(
        this._entityConfig.app.loader.resources[image].texture
      );
      sprite.anchor.set(0, 1); // lower-left
      sprite.visible = false;
      this.container.addChild(sprite);
      return sprite;
    });

    this.currentSpeakerName = null;

    this._on(
      this._entityConfig.narrator,
      "changeSpeaker",
      this._onChangeSpeaker
    );

    this._entityConfig.container.addChild(this.container);
  }

  _teardown() {
    this._entityConfig.container.removeChild(this.container);
  }

  _onChangeSpeaker(speaker?: any) {
    if (this.currentSpeakerName)
      this.namesToSprites[this.currentSpeakerName].visible = false;
    if (speaker) this.namesToSprites[speaker].visible = true;
    this.currentSpeakerName = speaker;
  }
}

export class SingleNarration extends entity.EntityBase {
  constructor(public narrationKey: string) {
    super();
  }

  _setup() {
    this._entityConfig.narrator.changeKey(this.narrationKey);
    this._on(this._entityConfig.narrator, "done", this._onNarrationDone);
  }

  _onNarrationDone(key?: string) {
    if (key === this.narrationKey) this._transition = entity.makeTransition();
  }

  _teardown() {
    this._entityConfig.narrator.stopNarration();
  }
}

export class RandomNarration extends entity.EntityBase {
  public narrationPlaylist: any[] = [];
  public currentKey: string = null;

  constructor(public narrationKeys: string[], public priority: number) {
    super();
  }

  _setup() {
    // If this is the first time or we have played everything, make a new playlist
    if (this.narrationPlaylist.length === 0) {
      this.narrationPlaylist = _.shuffle(this.narrationKeys);
    }

    // Pick the next key in the list
    this.currentKey = this.narrationPlaylist.shift();
    this._entityConfig.narrator.changeKey(this.currentKey, this.priority);
  }

  _update(frameInfo: entity.FrameInfo) {
    if (
      frameInfo.timeSinceStart >=
      this._entityConfig.narrator.narrationDuration(this.currentKey)
    ) {
      this._transition = entity.makeTransition();
    }
  }

  _teardown() {
    this.currentKey = null;
  }
}

export class VideoSceneOptions {
  video: string;
  videoOptions: Partial<entity.VideoEntityOptions>;
  narration: string;
  music: string;
  musicVolume: number;
  skipButtonOptions: Partial<entity.SkipButtonOptions>;
}

/** 
  Launches a complete video scene, complete with a video, narration, music, and skip button.
  Terminates when either the video completes, or the skip button is pressed. 
 */
export class VideoScene extends entity.CompositeEntity {
  public narration: SingleNarration;
  public video: entity.VideoEntity;
  public skipButton: entity.SkipButton;
  public previousMusic: string;

  private _options: VideoSceneOptions;

  constructor(options: Partial<VideoSceneOptions> = {}) {
    super();

    this._options = util.fillInOptions(options, new VideoSceneOptions());
  }

  _setup(frameInfo: entity.FrameInfo, entityConfig: entity.EntityConfig) {
    if (this._options.narration) {
      this.narration = new SingleNarration(this._options.narration);
      this._activateChildEntity(this.narration);
    }

    if (this._options.video) {
      this.video = new entity.VideoEntity(
        this._options.video,
        this._options.videoOptions
      );
      this._activateChildEntity(this.video);
    }

    if (this._options.music) {
      this.previousMusic = this._entityConfig.jukebox.musicName;
      this._entityConfig.jukebox.play(
        this._options.music,
        this._options.musicVolume
      );
    }

    this.skipButton = new entity.SkipButton(this._options.skipButtonOptions);
    this._activateChildEntity(this.skipButton);
  }

  _update(frameInfo: entity.FrameInfo) {
    if (
      (this._options.video && this.video.transition) ||
      this.skipButton.transition
    ) {
      this._transition = entity.makeTransition();
    }
  }

  _teardown() {
    if (this._options.music)
      this._entityConfig.jukebox.play(this.previousMusic);
  }
}

export function makeNarrationKeyList(prefix: number, count: number): number[] {
  const list = [];
  for (let i = 0; i < count; i++) list.push(prefix + i);
  return list;
}

/** Returns Map of file names to Howl objects, with sprite definintions */
export function loadNarrationAudio(
  narrationTable: { [k: string]: any },
  languageCode: string
) {
  // Prepare map of file names to sprite names
  const fileToSprites = new Map<string, any>();
  for (let key in narrationTable) {
    const value = narrationTable[key];
    if (value.skipFile) continue;

    const file = value.file || key; // File name defaults to the key name
    if (!fileToSprites.has(file)) fileToSprites.set(file, {}); // Insert empty sprite def if not present
    if ("start" in value) {
      fileToSprites.get(file)[key] = [value.start, value.end - value.start];
    }
  }

  // Create map of file names to Howl objects
  const fileToHowl = new Map<string, Howl>();
  for (let [file, sprites] of fileToSprites) {
    fileToHowl.set(
      file,
      new Howl({
        src: _.map(
          audio.AUDIO_FILE_FORMATS,
          (audioFormat) => `audio/voices/${languageCode}/${file}.${audioFormat}`
        ),
        sprite: sprites,
      })
    );
  }
  return fileToHowl;
}

export function loadScript(
  languageCode: string
): Promise<XMLHttpRequestResponseType> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", `scripts/script_${languageCode}.json`);
    request.responseType = "json";
    request.onload = () => resolve(request.response);
    request.onerror = reject;
    request.send();
  });
}

export function makeNarrationLoader(
  narrationTable: { [k: string]: any },
  languageCode: string
) {
  // Load audio
  const narrationAudio = loadNarrationAudio(narrationTable, languageCode);

  const narrationLoadPromises = Array.from(
    narrationAudio.values(),
    audio.makeHowlerLoadPromise
  );

  // TODO: report progress
  // _.each(narrationLoadPromises, p =>
  //   p.then(() => {
  //     variableAudioLoaderProgress += 1 / narrationLoadPromises.length;
  //     updateLoadingProgress();
  //   })
  // );

  return Promise.all(narrationLoadPromises).catch((err) => {
    console.error("Error loading narration", err);
  });
}

export function breakDialogIntoLines(text: string): DialogLine[] {
  // Regular expression to match dialog lines like "[Malo:481] Ahoy there, matey!"
  const r = /^(?:\[([^:]+)?(?:\:(\d+))?\])?(.*)/;
  const rNewLines = /__/g;

  const dialogLines = [];
  for (const textLine of text.split("--")) {
    // speaker and start can both be undefined, and will be stripped from the transition
    let [, speaker, start, dialog] = r.exec(textLine);
    //@ts-ignore
    let startAsNumber: number;
    if (start) startAsNumber = parseInt(start);
    dialog = dialog.trim();

    if (dialog.length > 0) {
      const textWithNewLines = dialog.replace(rNewLines, "\n");
      dialogLines.push({
        speaker,
        text: textWithNewLines,
        start: startAsNumber,
      });
    }
  }

  return dialogLines;
}

export function estimateDuration(
  text: string,
  timePerWord: number = TIME_PER_WORD
) {
  const wordCount = text.trim().split(/[\s\.\!\?]+/).length;
  return wordCount * timePerWord;
}
