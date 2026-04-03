const playbackStates = {
  INIT: "INIT",
  PLAYING: "PLAYING",
  STOPPED: "STOPPED",
  PAUSED: "PAUSED",
};

class PlaybackEngine {
  constructor(audioElement) {
    this.ac = new AudioContext();
    this.ac.suspend();
    this.defaultBpm = 100;

    this.audioElement = audioElement || null;
    this.animationFrameRequest = null;

    this.cursor = null;
    this.sheet = null;
    this.iterator = null;
    this.denominator = null;
    this.currentIndex = 0;

    this.scheduler = null;

    this.iterationSteps = 0;
    this.currentIterationStep = 0;
    this.stepTimestamps = [];

    this.timeoutHandles = [];
    this.animateTimeout = {};

    this.playbackSettings = {
      bpm: this.defaultBpm,
      instrument: null,
      volumes: {
        master: 1,
        instruments: [],
      },
    };

    this.state = playbackStates.INIT;
    this.scrollTop = 0;
    this.currentScrollTop = 0;
    this.instrumentMap = {};
    this.getScrollPosition = function () {
      return window.pageYOffset || document.documentElement.scrollTop;
    };
    this.scroll = function () {
      let top = osmd.cursor.cursorElement.offsetTop;
      let pos = top - 65;
      if (pos < 0) {
        pos = 0;
      }
      if (this.getScrollPosition() != pos) {
        this.scrollTop = pos;
        this.currentScrollTop = pos;
        document.querySelector("#osmdCanvas").scroll({ top: pos });
      }
    };

    this.getInstrumentMap = function (instruments) {
      let tracks = [];
      for (let instrument of instruments) {
        if (instrument) {
          for (let subinstrument of instrument.subInstruments) {
            let idString = subinstrument.idString;
            let voice = subinstrument;
            let map = {
              idString: idString,
              partId: instrument.idString,
              partAbbreviation: instrument.partAbbreviation,
              voice: voice,
              hasSibling: instrument.subInstruments.length > 1,
            };
            this.instrumentMap[idString] = map;
            tracks.push(map);
          }
        }
      }
      this.instrumentMap = tracks;
      return tracks;
    };
  }

  get wholeNoteLength() {
    return Math.round(
      (60 / this.playbackSettings.bpm) * this.denominator * 1000
    );
  }

  async loadInstrument(instrumentName) {
    this.playbackSettings.instrument = await Soundfont.instrument(
      this.ac,
      instrumentName
    );
  }

  loadScore(osmd) {
    this.sheet = osmd.sheet;
    this.cursor = osmd.cursor;
    this.denominator = this.sheet.playbackSettings.rhythm.denominator;
    if (this.sheet.HasBPMInfo) {
      this.setBpm(this.sheet.DefaultStartTempoInBpm);
    }

    let instruments = this.sheet.Instruments.map((i) => {
      return {
        name: i.Name,
        id: i.id,
        voices: i.Voices.map((v) => {
          return {
            name: "Voice " + v.VoiceId,
            id: v.VoiceId,
            volume: 1,
          };
        }),
      };
    });

    this.playbackSettings.volumes.instruments = instruments;

    this.scheduler = new PlaybackScheduler(
      this.denominator,
      this.wholeNoteLength,
      this.ac,
      (delay, notes) => this._notePlaybackCallback(delay, notes)
    );
    this._countAndSetIterationSteps();
    this._generateCursorTimestampMap();
    if (this.audioElement) {
      this._bindAudioEvents();
    }
  }

  async play() {
    if (this.audioElement) {
      try {
        await this.audioElement.play();
      } catch (error) {
        console.warn("PlaybackEngine: audio playback failed", error);
      }
      this._startAudioSync();
      this.cursor.show();
      this.state = playbackStates.PLAYING;
      return;
    }

    if (!this.playbackSettings.instrument) {
      await this.loadInstrument("acoustic_grand_piano");
    }
    await this.ac.resume();
    this.scroll();
    this.scheduler.start();
    this.cursor.show();
    this.state = playbackStates.PLAYING;
  }

  async stop() {
    this.state = playbackStates.STOPPED;
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this._stopAudioSync();
    }
    if (this.playbackSettings.instrument)
      this.playbackSettings.instrument.stop();
    this._clearTimeouts();
    if (this.scheduler) this.scheduler.reset();
    this.cursor.reset();
    this.currentIterationStep = 0;
    this.cursor.hide();
  }

  pause() {
    this.state = playbackStates.PAUSED;
    if (this.audioElement) {
      this.audioElement.pause();
      this._stopAudioSync();
      return;
    }
    this.ac.suspend();
    if (this.playbackSettings.instrument)
      this.playbackSettings.instrument.stop();
    if (this.scheduler) this.scheduler.setIterationStep(this.currentIterationStep);
    if (this.scheduler) this.scheduler.pause();
    this._clearTimeouts();
  }

  async resume() {
    this.state = playbackStates.PLAYING;
    if (this.audioElement) {
      try {
        await this.audioElement.play();
      } catch (error) {
        console.warn("PlaybackEngine: audio resume failed", error);
      }
      this._startAudioSync();
      return;
    }
    if (this.scheduler) this.scheduler.resume();
    await this.ac.resume();
  }

  jumpToStep(step) {
    this.pause();
    if (this.currentIterationStep > step) {
      this.cursor.hide();
      this.cursor.reset();
      this.currentIterationStep = 0;
    }
    while (this.currentIterationStep < step) {
      this.cursor.next();
      ++this.currentIterationStep;
    }
    if (this.scheduler) {
      let schedulerStep = this.currentIterationStep;
      if (
        this.currentIterationStep > 0 &&
        this.currentIterationStep < this.iterationSteps
      )
        ++schedulerStep;
      this.scheduler.setIterationStep(schedulerStep);
    }
    this.cursor.show();
  }

  animate(note, noteVolume, noteDuration) {
    //let parentId = note.voiceEntry.parentVoice.parent.idString;
    //let voiceId = note.voiceEntry.parentVoice.voiceId;
    //let halfTone = note.halfTone;
    for (let subInstrument of note.voiceEntry.parentVoice.parent
      .subInstruments) {
      /*
      console.log({
        subInstrumentId:subInstrument.idString, 
        midiInstrumentID:subInstrument.midiInstrumentID,
        parentId:parentId, 
        voiceId:voiceId,
        name:subInstrument.name,
        pan:subInstrument.subinstrument,
        volume:subInstrument.volume,
        halfTone:halfTone,
        noteVolume:noteVolume,
        noteDuration:noteDuration
      });
      */
      let cls2 = ".instr-" + subInstrument.idString;
      this.animateInstr(cls2, subInstrument.volume, noteDuration);

      for (
        let idx = 0;
        idx <
        osmd.cursor.iterator.currentMeasure.verticalMeasureList.length - 1;
        idx++
      ) {
        let top =
          osmd.cursor.iterator.currentMeasure.verticalMeasureList[idx].stave.y -
          osmd.cursor.cursorElement.offsetTop;
        let cls = ".box-" + idx;
        document.querySelector(cls).style.top = top + "px";
      }
    }
  }

  animateInstr(cls, volume, noteDuration) {
    if (typeof this.animateTimeout[cls] != "undefined") {
      clearTimeout(this.animateTimeout[cls]);
    }
    this.animateTimeout[cls] = setTimeout(function () {
      document.querySelector(cls + " img").style.transform = "scale(1)";
    }, noteDuration / 5);
    let scale = 1 + volume / 15;
    document.querySelector(cls + " img").style.transform =
      "scale(" + scale + ")";
  }

  setVoiceVolume(instrumentId, voiceId, volume) {
    let playbackInstrument = this.playbackSettings.volumes.instruments.find(
      (i) => i.id === instrumentId
    );
    let playbackVoice = playbackInstrument.voices.find((v) => v.id === voiceId);
    playbackVoice.volume = volume;
  }

  setBpm(bpm) {
    this.playbackSettings.bpm = bpm;
    if (this.scheduler) this.scheduler.wholeNoteLength = this.wholeNoteLength;
  }

  attachAudio(audioElement) {
    this.audioElement = audioElement;
    if (this.audioElement) {
      this._bindAudioEvents();
      this.syncToAudioTimeMs(this.audioElement.currentTime * 1000);
    }
  }

  _bindAudioEvents() {
    if (!this.audioElement) return;
    this.audioElement.addEventListener("play", () => this._startAudioSync());
    this.audioElement.addEventListener("pause", () => this._stopAudioSync());
    this.audioElement.addEventListener("seeked", () =>
      this.syncToAudioTimeMs(this.audioElement.currentTime * 1000)
    );
    this.audioElement.addEventListener("timeupdate", () =>
      this.syncToAudioTimeMs(this.audioElement.currentTime * 1000)
    );
    this.audioElement.addEventListener("ended", () => this.stop());
  }

  _startAudioSync() {
    if (!this.audioElement) return;
    if (this.animationFrameRequest) return;
    const syncFrame = () => {
      if (!this.audioElement || this.audioElement.paused) {
        this.animationFrameRequest = null;
        return;
      }
      this.syncToAudioTimeMs(this.audioElement.currentTime * 1000);
      this.animationFrameRequest = requestAnimationFrame(syncFrame);
    };
    this.animationFrameRequest = requestAnimationFrame(syncFrame);
  }

  _stopAudioSync() {
    if (this.animationFrameRequest) {
      cancelAnimationFrame(this.animationFrameRequest);
      this.animationFrameRequest = null;
    }
  }

  _generateCursorTimestampMap() {
    this.stepTimestamps = [];
    if (!this.cursor || !this.cursor.iterator) return;

    this.cursor.reset();
    while (!this.cursor.iterator.endReached) {
      const timestamp = this.cursor.iterator.CurrentSourceTimestamp;
      let realValue = 0;
      if (timestamp && typeof timestamp.RealValue === "number") {
        realValue = timestamp.RealValue;
      } else if (this.cursor.iterator.currentTimeStamp) {
        realValue = this.cursor.iterator.currentTimeStamp.RealValue || 0;
      }
      this.stepTimestamps.push(realValue * this.wholeNoteLength);
      this.cursor.next();
    }
    this.cursor.reset();
  }

  syncToAudioTimeMs(timeMs) {
    if(timeMs >= 0 && timeMs < this.timeMs) {
      osmd.cursor.reset();
      this.cursor = osmd.cursor;
    }
    this.timeMs = timeMs;
    if (this.stepTimestamps && this.stepTimestamps.length > 1) {
      const hasRealTimestamps = this.stepTimestamps.some((value) => value > 0);
      if (hasRealTimestamps) {
        const targetIndex = this._findCursorIndexForTime(timeMs);
        if (targetIndex !== -1) {
          this._seekCursorToStep(targetIndex);
          osmd.cursor.update();
          this.timeMs = timeMs;
          return;
        }
      }
    }

    if (this.audioElement && this.audioElement.duration > 0 && this.iterationSteps > 0) {
      const ratio = Math.min(1, Math.max(0, this.audioElement.currentTime / this.audioElement.duration));
      const targetIndex = Math.floor(ratio * (this.iterationSteps - 1));
      this._seekCursorToStep(targetIndex);
      osmd.cursor.update();
    }
  }

  _findCursorIndexForTime(timeMs) {
    let low = 0;
    let high = this.stepTimestamps.length - 1;
    let result = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const value = this.stepTimestamps[mid];
      if (value <= timeMs) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return result;
  }

  _seekCursorToStep(targetStep) {
    if (!this.cursor) return;
    targetStep = Math.max(0, Math.min(targetStep, this.iterationSteps - 1));
    if (targetStep === this.currentIterationStep) return;
    this.cursor.hide();
    if (targetStep < this.currentIterationStep) {
      this.cursor.reset();
      this.currentIterationStep = 0;
    }
    while (this.currentIterationStep < targetStep && !this.cursor.iterator.endReached) {
      this.cursor.next();
      ++this.currentIterationStep;
    }
    this.cursor.show();
    if (typeof this.cursor.update === "function") {
      this.cursor.update();
    }
    if (typeof alignInstrumentsToStaves === "function" && typeof window !== "undefined" && window.osmd) {
      alignInstrumentsToStaves(window.osmd);
    }
    this.scroll();
  }

  _countAndSetIterationSteps() {
    this.cursor.reset();
    let steps = 0;
    while (!this.cursor.iterator.endReached) {
      if (this.cursor.iterator.currentVoiceEntries) {
        this.scheduler.loadNotes(this.cursor.iterator.currentVoiceEntries);
      }
      this.cursor.next();
      ++steps;
    }
    this.iterationSteps = steps;
    this.cursor.reset();
  }

  _notePlaybackCallback(audioDelay, notes) {
    if (this.state !== playbackStates.PLAYING) return;
    if (this.audioElement) return;
    if (!this.playbackSettings.instrument) return;

    let scheduledNotes = [];

    for (let note of notes) {
      let noteDuration = this._getNoteDuration(note);
      if (noteDuration === 0) continue;
      let noteVolume = this._getNoteVolume(note);

      this.animate(note, noteVolume, noteDuration);

      scheduledNotes.push({
        note: note.halfTone,
        duration: noteDuration / 1000,
        gain: noteVolume,
      });
    }
    this.playbackSettings.instrument.schedule(
      this.ac.currentTime + audioDelay,
      scheduledNotes
    );

    this.timeoutHandles.push(
      setTimeout(
        () => this._iterationCallback(),
        Math.max(0, audioDelay * 1000 - 40)
      )
    ); // Subtracting 40 milliseconds to compensate for update delay
  }

  // Used to avoid duplicate cursor movements after a rapid pause/resume action
  _clearTimeouts() {
    for (let h of this.timeoutHandles) {
      clearTimeout(h);
    }
    this.timeoutHandles = [];
  }

  _iterationCallback() {
    if (this.state !== playbackStates.PLAYING) {
      return;
    }
    if (this.currentIterationStep > 0) {
      osmd.cursor.next();
      this.scroll();
    }
    ++this.currentIterationStep;
  }

  _getNoteDuration(note) {
    let duration = note.length.realValue * this.wholeNoteLength;
    if (note.NoteTie) {
      if (Object.is(note.NoteTie.StartNote, note) && note.NoteTie.notes[1]) {
        duration +=
          note.NoteTie.notes[1].length.realValue * this.wholeNoteLength;
      } else {
        duration = 0;
      }
    }
    return duration;
  }

  _getNoteVolume(note) {
    let instrument = note.voiceEntry.ParentVoice.Parent;
    let playbackInstrument = this.playbackSettings.volumes.instruments.find(
      (i) => i.id === instrument.Id
    );
    let playbackVoice = playbackInstrument.voices.find(
      (v) => v.id === note.voiceEntry.ParentVoice.VoiceId
    );
    return playbackVoice.volume;
  }
}
