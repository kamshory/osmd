const playbackStates = {
  INIT: 'INIT',
  PLAYING: 'PLAYING',
  STOPPED: 'STOPPED',
  PAUSED: 'PAUSED'
};

class PlaybackEngine {
  constructor(initialScroll) {
    this.ac = new AudioContext();
    this.ac.suspend();
    this.defaultBpm = 100;

    this.cursor = null;
    this.sheet = null;
    this.iterator = null;
    this.denominator = null;
    this.currentIndex = 0;

    this.scheduler = null;

    this.iterationSteps = 0;
    this.currentIterationStep = 0;

    this.timeoutHandles = [];

    this.playbackSettings = {
      bpm: this.defaultBpm,
      instrument: null,
      volumes: {
        master: 1,
        instruments: []
      }
    };

    this.state = playbackStates.INIT;
    this.scroolTop = initialScroll || 0;
  }
  scrool()
  {
    let top = osmd.cursor.cursorElement.offsetTop;
    let pos = top - 65;
    if(pos < 0)
    {
      pos = 0;
    }
    document.title = [top, pos, this.scroolTop]
    if(this.scroolTop < pos)
    {
      this.scroolTop = pos;
      window.scroll({top:pos});
      
    }
  }

  get wholeNoteLength() {
    return Math.round((60 / this.playbackSettings.bpm) * this.denominator * 1000);
  }

  async loadInstrument(instrumentName) {
    console.log('before load instrument');
    this.forceScroll();
    this.playbackSettings.instrument = await Soundfont.instrument(this.ac, instrumentName);
    console.log('after load instrument');
    this.forceScroll();
  }

  loadScore(osmd) {
    this.sheet = osmd.sheet;
    this.cursor = osmd.cursor;
    this.denominator = this.sheet.playbackSettings.rhythm.denominator;
    if (this.sheet.HasBPMInfo) {
      this.setBpm(this.sheet.DefaultStartTempoInBpm);
    }

    let instruments = this.sheet.Instruments.map(i => {
      return {
        name: i.Name,
        id: i.id,
        voices: i.Voices.map(v => {
          return {
            name: 'Voice ' + v.VoiceId,
            id: v.VoiceId,
            volume: 1
          };
        })
      };
    });

    this.playbackSettings.volumes.instruments = instruments;

    this.scheduler = new PlaybackScheduler(this.denominator, this.wholeNoteLength, this.ac, (delay, notes) =>
      this._notePlaybackCallback(delay, notes)
    );
    this._countAndSetIterationSteps();
  }

  async play() {
    console.log('position 0');
    this.forceScroll();
    if (!this.playbackSettings.instrument) 
    {
      await this.loadInstrument('acoustic_grand_piano');
    }
    console.log('position 1');
    this.forceScroll();
    await this.ac.resume();
    console.log('position 2');
    this.forceScroll();
    this.cursor.show();
    console.log('position 3');
    this.forceScroll();
    this.state = playbackStates.PLAYING;
    this.scheduler.start();
    console.log('position 4');
    this.forceScroll();
    
  }

  forceScroll()
  {
    console.log(this.scroolTop)
    window.scroll({top:this.scrollTop});
  }

  async stop() {
    this.state = playbackStates.STOPPED;
    if (this.playbackSettings.instrument) this.playbackSettings.instrument.stop();
    this._clearTimeouts();
    this.scheduler.reset();
    this.cursor.reset();
    this.currentIterationStep = 0;
    this.cursor.hide();
  }

  pause() {
    this.state = playbackStates.PAUSED;
    this.ac.suspend();
    if (this.playbackSettings.instrument) this.playbackSettings.instrument.stop();
    this.scheduler.setIterationStep(this.currentIterationStep);
    this.scheduler.pause();
    this._clearTimeouts();
  }

  resume() {
    this.state = playbackStates.PLAYING;
    this.scheduler.resume();
    this.ac.resume();
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
    let schedulerStep = this.currentIterationStep;
    if (this.currentIterationStep > 0 && this.currentIterationStep < this.iterationSteps) ++schedulerStep;
    this.scheduler.setIterationStep(schedulerStep);
    this.cursor.show();
  }

  setVoiceVolume(instrumentId, voiceId, volume) {
    let playbackInstrument = this.playbackSettings.volumes.instruments.find(i => i.id === instrumentId);
    let playbackVoice = playbackInstrument.voices.find(v => v.id === voiceId);
    playbackVoice.volume = volume;
  }

  setBpm(bpm) {
    this.playbackSettings.bpm = bpm;
    if (this.scheduler) this.scheduler.wholeNoteLength = this.wholeNoteLength;
  }

  _countAndSetIterationSteps() {
    this.cursor.reset();
    let steps = 0;
    while (!this.cursor.iterator.endReached) {
      if (this.cursor.iterator.currentVoiceEntries)
        this.scheduler.loadNotes(this.cursor.iterator.currentVoiceEntries);
      this.cursor.next();
      ++steps;
    }
    this.iterationSteps = steps;
    this.cursor.reset();
  }

  _notePlaybackCallback(audioDelay, notes) {
    if (this.state !== playbackStates.PLAYING) return;
    
    
    
    let scheduledNotes = [];

    for (let note of notes) {
      let noteDuration = this._getNoteDuration(note);
      if (noteDuration === 0) continue;
      let noteVolume = this._getNoteVolume(note);

      scheduledNotes.push({
        note: note.halfTone,
        duration: noteDuration / 1000,
        gain: noteVolume
      });
    }

    this.playbackSettings.instrument.schedule(this.ac.currentTime + audioDelay, scheduledNotes);

    this.timeoutHandles.push(
      setTimeout(() => this._iterationCallback(), Math.max(0, audioDelay * 1000 - 40))
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
    if (this.state !== playbackStates.PLAYING) 
    {
      return;
    }
    if (this.currentIterationStep > 0) 
    {
      osmd.cursor.next();
      this.scrool();
    }
    ++this.currentIterationStep;
  }

  _getNoteDuration(note) {
    let duration = note.length.realValue * this.wholeNoteLength;
    if (note.NoteTie) {
      if (Object.is(note.NoteTie.StartNote, note) && note.NoteTie.notes[1]) {
        duration += note.NoteTie.notes[1].length.realValue * this.wholeNoteLength;
      } else {
        duration = 0;
      }
    }
    return duration;
  }

  _getNoteVolume(note) {
    let instrument = note.voiceEntry.ParentVoice.Parent;
    let playbackInstrument = this.playbackSettings.volumes.instruments.find(i => i.id === instrument.Id);
    let playbackVoice = playbackInstrument.voices.find(v => v.id === note.voiceEntry.ParentVoice.VoiceId);
    return playbackVoice.volume;
  }
}