import * as entity from "./entity.js";
import * as audio from "./audio.js";
import _ from "underscore";
const TIME_PER_WORD = 60000 / 200; // 200 words per minute
/**
 * @deprecated May not be up to date with other changes in Booyah
 */
export class Narrator extends entity.Entity {
    // filesToHowl is a Map
    constructor(filesToHowl, narrationTable) {
        super();
        this.filesToHowl = filesToHowl;
        this.narrationTable = narrationTable;
        this.lineIndex = 0;
    }
    setup(config) {
        super.setup(config);
        this.container = new PIXI.Container();
        this.narratorSubtitle = new PIXI.Text("", {
            fontFamily: "Roboto Condensed",
            fontSize: 32,
            fill: "white",
            strokeThickness: 4,
            align: "center",
            wordWrap: true,
            wordWrapWidth: this.config.app.screen.width - 150,
        });
        this.narratorSubtitle.anchor.set(0.5, 0.5);
        this.narratorSubtitle.position.set(this.config.app.screen.width / 2, this.config.app.screen.height - 75);
        this.container.addChild(this.narratorSubtitle);
        this.characterSubtitle = new PIXI.Text("", {
            fontFamily: "Roboto Condensed",
            fontSize: 32,
            fill: "white",
            strokeThickness: 4,
            align: "left",
            wordWrap: true,
            wordWrapWidth: this.config.app.screen.width - 350,
        });
        this.characterSubtitle.anchor.set(0, 0.5);
        this.characterSubtitle.position.set(300, this.config.app.screen.height - 75);
        this.container.addChild(this.characterSubtitle);
        this.config.container.addChild(this.container);
        this.key = null;
        this.isPlaying = false;
        this.keyQueue = [];
        this.isPaused = false;
        this.currentHowl = null;
        this.currentSoundId = null;
        this._on(this.config.playOptions, "fxOn", () => this._updateMuted);
        this._on(this.config.playOptions, "showSubtitles", () => this._updateShowSubtitles);
        this._updateMuted();
        this._updateShowSubtitles();
    }
    update(options) {
        super.update(options);
        if (options.gameState == "paused") {
            if (!this.isPaused) {
                if (this.currentHowl)
                    this.currentHowl.pause(this.currentSoundId);
                this.isPaused = true;
            }
        }
        else if (this.isPaused && this.isPlaying) {
            if (this.currentHowl)
                this.currentHowl.play(this.currentSoundId);
            this.isPaused = false;
        }
        else if (!this.isPlaying) {
            if (this.keyQueue.length > 0) {
                this.key = this.keyQueue.shift();
                this._initNarration(options.playTime);
            }
        }
        else if (options.playTime - this.keyStartTime >= this.nextLineAt) {
            this.lineIndex++;
            if (this.lineIndex < this.lines.length) {
                this._updateNextLineAt();
                this._updateText(this.lines[this.lineIndex].text, this.lines[this.lineIndex].speaker);
            }
            else {
                this.isPlaying = false;
                this.currentSoundId = null;
                this.currentHowl = null;
                this._updateText();
            }
        }
    }
    teardown() {
        this.config.container.removeChild(this.container);
        super.teardown();
    }
    // @priority < 0 means to skip the narration if other narration is in progress
    changeKey(key, priority = 0) {
        if (!_.has(this.narrationTable, key)) {
            console.error("No key", key, "in narration table");
            return;
        }
        if (this.isPlaying && priority < 0) {
            console.log("Skipping narration", key, "of priority", priority);
            return;
        }
        // TODO sort keys by priority
        this.keyQueue.push(key);
    }
    // Stop currently playing and empty queue
    cancelAll() {
        this.keyQueue = [];
        if (this.isPlaying) {
            if (this.currentHowl)
                this.currentHowl.pause(this.currentSoundId);
            this.isPlaying = false;
            this.currentSoundId = null;
            this.currentHowl = null;
            this._updateText();
        }
    }
    narrationDuration(key) {
        const narrationInfo = this.narrationTable[key];
        // If start and end times are provided, use them
        // Else get the entire duration of the file
        if ("start" in narrationInfo) {
            return narrationInfo.end - narrationInfo.start;
        }
        else {
            const file = this.narrationTable[key].file || key;
            return this.filesToHowl.get(file).duration() * 1000;
        }
    }
    onSignal(signal, data) {
        super.onSignal(signal, data);
        if (signal === "reset")
            this.cancelAll();
    }
    _initNarration(playTime) {
        this.duration = this.narrationDuration(this.key);
        this.lines = this.narrationTable[this.key].dialog;
        this.lineIndex = 0;
        this.keyStartTime = playTime;
        this.isPlaying = true;
        this._updateNextLineAt();
        this._updateText(this.lines[0].text, this.lines[0].speaker);
        if (this.narrationTable[this.key].skipFile) {
            this.currentHowl = null;
        }
        else {
            const file = this.narrationTable[this.key].file || this.key;
            this.currentHowl = this.filesToHowl.get(file);
            // If the start time is provided, this is a sprite
            // Otherwise it's just a single file
            if ("start" in this.narrationTable[this.key]) {
                this.currentSoundId = this.currentHowl.play(this.key);
            }
            else {
                this.currentHowl.seek(0);
                this.currentSoundId = this.currentHowl.play();
            }
        }
    }
    _updateText(text = "", speaker = null) {
        if (text === "") {
            this.narratorSubtitle.text = "";
            this.characterSubtitle.text = "";
        }
        else if (speaker && !speaker.endsWith(".big")) {
            this.narratorSubtitle.text = "";
            this.characterSubtitle.text = text;
        }
        else {
            this.narratorSubtitle.text = text;
            this.characterSubtitle.text = "";
        }
        this.emit("changeSpeaker", speaker);
    }
    // Must be called after this.duration, this.lines, this.lineIndex, etc.. have been set
    _updateNextLineAt() {
        if (this.lineIndex === this.lines.length - 1) {
            this.nextLineAt = this.duration;
        }
        else if ("start" in this.lines[this.lineIndex + 1]) {
            this.nextLineAt = this.lines[this.lineIndex + 1].start;
        }
        else {
            this.nextLineAt =
                ((this.lineIndex + 1) * this.duration) / this.lines.length;
        }
    }
    _updateMuted() {
        const muted = !this.config.playOptions.options.fxOn;
        for (let howl of this.filesToHowl.values())
            howl.mute(muted);
    }
    _updateShowSubtitles() {
        this.container.visible = this.config.playOptions.options.showSubtitles;
    }
}
export class SpeakerDisplay extends entity.Entity {
    constructor(namesToImages, position = new PIXI.Point(50, 540)) {
        super();
        this.namesToImages = namesToImages;
        this.position = position;
    }
    setup(config) {
        super.setup(config);
        this.container = new PIXI.Container();
        this.container.position = this.position;
        // Make a hidden sprite for each texture, add it to the container
        this.namesToSprites = _.mapObject(this.namesToImages, (image) => {
            const sprite = new PIXI.Sprite(this.config.app.loader.resources[image].texture);
            sprite.anchor.set(0, 1); // lower-left
            sprite.visible = false;
            this.container.addChild(sprite);
            return sprite;
        });
        this.currentSpeakerName = null;
        this._on(this.config.narrator, "changeSpeaker", this._onChangeSpeaker);
        this.config.container.addChild(this.container);
    }
    teardown() {
        this.config.container.removeChild(this.container);
        super.teardown();
    }
    _onChangeSpeaker(speaker) {
        if (this.currentSpeakerName)
            this.namesToSprites[this.currentSpeakerName].visible = false;
        if (speaker)
            this.namesToSprites[speaker].visible = true;
        this.currentSpeakerName = speaker;
    }
}
export class SingleNarration extends entity.Entity {
    constructor(narrationKey, priority = 0) {
        super();
        this.narrationKey = narrationKey;
        this.priority = priority;
    }
    _setup() {
        this.config.narrator.changeKey(this.narrationKey, this.priority);
        this._on(this.config.narrator, "done", this._onNarrationDone);
    }
    _onNarrationDone(key) {
        if (key === this.narrationKey)
            this.requestedTransition = true;
    }
    _teardown() {
        /* TODO: make <Narrator>.stopNarration method
          this.config.narrator.stopNarration(this.narrationKey);
        */
    }
}
export class RandomNarration extends entity.Entity {
    constructor(narrationKeys, priority) {
        super();
        this.narrationKeys = narrationKeys;
        this.priority = priority;
        this.narrationPlaylist = [];
        this.currentKey = null;
    }
    setup(config) {
        super.setup(config);
        // If this is the first time or we have played everything, make a new playlist
        if (this.narrationPlaylist.length === 0) {
            this.narrationPlaylist = _.shuffle(this.narrationKeys);
        }
        // Pick the next key in the list
        this.currentKey = this.narrationPlaylist.shift();
        this.config.narrator.changeKey(this.currentKey, this.priority);
    }
    _update(options) {
        if (options.timeSinceStart >=
            this.config.narrator.narrationDuration(this.currentKey)) {
            this.requestedTransition = true;
        }
    }
    teardown() {
        this.currentKey = null;
        super.teardown();
    }
}
/**
  Launches a complete video scene, complete with a video, narration, music, and skip button.
  Terminates when either the video completes, or the skip button is pressed.
 */
export class VideoScene extends entity.ParallelEntity {
    constructor(options = {}) {
        super();
        this.options = _.defaults(options, {
            video: null,
            loopVideo: false,
            narration: null,
            music: null,
        });
    }
    _setup(config) {
        if (this.options.narration) {
            this.narration = new SingleNarration(this.options.narration);
            this.addEntity(this.narration);
        }
        if (this.options.video) {
            this.video = new entity.VideoEntity(this.options.video, {
                loop: this.options.loopVideo,
            });
            this.addEntity(this.video);
        }
        if (this.options.music) {
            this.previousMusic = this.config.jukebox.musicName;
            this.config.jukebox.changeMusic(this.options.music);
        }
        this.skipButton = new entity.SkipButton();
        this.addEntity(this.skipButton);
    }
    _update(options) {
        if ((this.options.video && this.video.requestedTransition) ||
            this.skipButton.requestedTransition) {
            this.requestedTransition = true;
        }
    }
    _teardown() {
        if (this.options.music)
            this.config.jukebox.changeMusic(this.previousMusic);
        this.removeAllEntities();
    }
}
export function makeNarrationKeyList(prefix, count) {
    const list = [];
    for (let i = 0; i < count; i++)
        list.push(prefix + i);
    return list;
}
/** Returns Map of file names to Howl objects, with sprite definintions */
export function loadNarrationAudio(narrationTable, languageCode) {
    // Prepare map of file names to sprite names
    const fileToSprites = new Map();
    for (let key in narrationTable) {
        const value = narrationTable[key];
        if (value.skipFile)
            continue;
        const file = value.file || key; // File name defaults to the key name
        if (!fileToSprites.has(file))
            fileToSprites.set(file, {}); // Insert empty sprite def if not present
        if ("start" in value) {
            fileToSprites.get(file)[key] = [value.start, value.end - value.start];
        }
    }
    // Create map of file names to Howl objects
    const fileToHowl = new Map();
    for (let [file, sprites] of fileToSprites) {
        fileToHowl.set(file, new Howl({
            src: _.map(audio.AUDIO_FILE_FORMATS, (audioFormat) => `audio/voices/${languageCode}/${file}.${audioFormat}`),
            sprite: sprites,
        }));
    }
    return fileToHowl;
}
export function loadScript(languageCode) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", `scripts/script_${languageCode}.json`);
        request.responseType = "json";
        request.onload = () => resolve(request.response);
        request.onerror = reject;
        request.send();
    });
}
export function makeNarrationLoader(narrationTable, languageCode) {
    // Load audio
    const narrationAudio = loadNarrationAudio(narrationTable, languageCode);
    const narrationLoadPromises = Array.from(narrationAudio.values(), audio.makeHowlerLoadPromise);
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
export function breakDialogIntoLines(text) {
    // Regular expression to match dialog lines like "[Malo:481] Ahoy there, matey!"
    const r = /^(?:\[([^:]+)?(?:\:(\d+))?\])?(.*)/;
    const rNewLines = /__/g;
    const dialogLines = [];
    for (const textLine of text.split("--")) {
        // speaker and start can both be undefined, and will be stripped from the output
        let [, speaker, start, dialog] = r.exec(textLine);
        //@ts-ignore
        if (start)
            start = parseInt(start);
        dialog = dialog.trim();
        if (dialog.length > 0) {
            const textWithNewLines = dialog.replace(rNewLines, "\n");
            dialogLines.push({
                speaker,
                text: textWithNewLines,
                start,
            });
        }
    }
    return dialogLines;
}
export function estimateDuration(text, timePerWord = TIME_PER_WORD) {
    const wordCount = text.trim().split(/[\s\.\!\?]+/).length;
    return wordCount * timePerWord;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFycmF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9uYXJyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLE1BQU0sTUFBTSxhQUFhLENBQUM7QUFDdEMsT0FBTyxLQUFLLEtBQUssTUFBTSxZQUFZLENBQUM7QUFDcEMsT0FBTyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBRTNCLE1BQU0sYUFBYSxHQUFHLEtBQUssR0FBRyxHQUFHLENBQUMsQ0FBQyx1QkFBdUI7QUFFMUQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sUUFBUyxTQUFRLE1BQU0sQ0FBQyxNQUFNO0lBZ0J6Qyx1QkFBdUI7SUFDdkIsWUFDUyxXQUE4QixFQUM5QixjQUFtQjtRQUUxQixLQUFLLEVBQUUsQ0FBQztRQUhELGdCQUFXLEdBQVgsV0FBVyxDQUFtQjtRQUM5QixtQkFBYyxHQUFkLGNBQWMsQ0FBSztRQVByQixjQUFTLEdBQUcsQ0FBQyxDQUFDO0lBVXJCLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBMkI7UUFDL0IsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVwQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRXRDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFO1lBQ3hDLFVBQVUsRUFBRSxrQkFBa0I7WUFDOUIsUUFBUSxFQUFFLEVBQUU7WUFDWixJQUFJLEVBQUUsT0FBTztZQUNiLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxRQUFRO1lBQ2YsUUFBUSxFQUFFLElBQUk7WUFDZCxhQUFhLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxHQUFHO1NBQ2xELENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFN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