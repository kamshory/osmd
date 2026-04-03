let pb = null;
let audioPlayer = null;

function initAudioPlayerUI() {
  if (!audioPlayer) audioPlayer = document.getElementById("audioPlayer");
  const playButton = document.getElementById("audioPlayPause");
  const muteButton = document.getElementById("audioMute");
  const volumeSlider = document.getElementById("audioVolume");
  const progressBar = document.getElementById("audioProgressBar");
  const progressFill = document.getElementById("audioProgress");
  const timeLabel = document.getElementById("audioTime");
  const audioWrapper = document.getElementById("audio-container");
  if (!audioPlayer || !playButton || !muteButton || !volumeSlider || !progressBar || !progressFill || !timeLabel || !audioWrapper) return;

  audioPlayer.controls = false;

  const updateVolumeUI = () => {
    volumeSlider.value = String(audioPlayer.volume);
    muteButton.textContent = audioPlayer.muted || audioPlayer.volume === 0 ? "🔇" : "🔊";
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const updateAudioTimeUI = () => {
    const current = audioPlayer.currentTime || 0;
    const duration = audioPlayer.duration || 0;
    timeLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    if (duration > 0) {
      const pct = Math.min(100, Math.max(0, (current / duration) * 100));
      progressFill.style.width = `${pct}%`;
    } else {
      progressFill.style.width = "0%";
    }
  };

  const updatePlayButton = () => {
    playButton.textContent = audioPlayer.paused || audioPlayer.ended ? "▶" : "❚❚";
  };

  playButton.addEventListener("click", () => {
    if (audioPlayer.paused || audioPlayer.ended) {
      audioPlayer.play();
    } else {
      audioPlayer.pause();
    }
  });

  muteButton.addEventListener("click", () => {
    audioPlayer.muted = !audioPlayer.muted;
    updateVolumeUI();
  });

  volumeSlider.addEventListener("input", (event) => {
    audioPlayer.volume = Number(event.target.value);
    audioPlayer.muted = audioPlayer.volume === 0;
    updateVolumeUI();
  });

  const seekAudio = (event) => {
    if (!audioPlayer.duration) return;
    const rect = progressBar.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const pct = Math.min(1, Math.max(0, x / rect.width));
    audioPlayer.currentTime = pct * audioPlayer.duration;
    updateAudioTimeUI();
  };

  progressBar.addEventListener("click", seekAudio);

  audioPlayer.addEventListener("loadedmetadata", updateAudioTimeUI);
  audioPlayer.addEventListener("timeupdate", updateAudioTimeUI);
  audioPlayer.addEventListener("play", updatePlayButton);
  audioPlayer.addEventListener("pause", updatePlayButton);
  audioPlayer.addEventListener("ended", () => {
    updatePlayButton();
    updateAudioTimeUI();
  });

  updateVolumeUI();
  updatePlayButton();
}

function instrumentMap(instruments) {
  let tracks = [];
  for (let instrument of instruments) {
    if (instrument) {
      for (let subinstrument of instrument.subInstruments) {
        let idString = subinstrument.idString;
        let voice = subinstrument;
        tracks.push({
          idString: idString,
          partId: instrument.idString,
          partAbbreviation: instrument.partAbbreviation,
          voice: voice,
          hasSibling: instrument.subInstruments.length > 1,
        });
      }
    }
  }
  return tracks;
}

function handleAudioFileSelect(evt) {
  let files = evt.target.files;
  if (!files || files.length === 0) return;
  let file = files[0];
  let url = URL.createObjectURL(file);
  if (!audioPlayer) audioPlayer = document.getElementById("audioPlayer");
  if (!audioPlayer) return;
  audioPlayer.src = url;
  audioPlayer.load();
  let audioWrapper = document.getElementById("audio-container");
  if (audioWrapper) audioWrapper.style.display = "block";
  if (pb) {
    pb.attachAudio(audioPlayer);
  }
}

async function loadMusicFromUrl(xmlUrl, audioUrl) {
  if (!xmlUrl) return;

  if (!audioPlayer) audioPlayer = document.getElementById("audioPlayer");
  if (audioUrl && audioPlayer) {
    audioPlayer.src = audioUrl;
    audioPlayer.load();
    let audioWrapper = document.getElementById("audio-container");
    if (audioWrapper) audioWrapper.style.display = "block";
  }

  if (audioPlayer) {
    let audioWrapper = document.getElementById("audio-container");
    if (audioWrapper) audioWrapper.style.display = "block";
  }

  try {
    const response = await fetch(xmlUrl);
    const xmlText = await response.text();
    /*
    if (!window.osmd) {
      window.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmdCanvas", {
        zoom: 0.4,
        drawFromMeasureNumber: 1,
        drawUpToMeasureNumber: Number.MAX_SAFE_INTEGER,
      });
    }
    const osmd = window.osmd;
    osmd.zoom = 0.4;

    await osmd.load(xmlText);

    
    */
    displayStaffSelection(xmlText, audioUrl);
    
  } catch (error) {
    console.error("Failed to load score from URL", error);
    alert("Gagal memuat skor XML dari URL. Periksa URL dan CORS.");
  }
}

/**
 * Manually parses part names from MusicXML content without using OSMD.
 * @param {string} xmlText - The MusicXML string content.
 * @returns {Array<{name: string, index: number}>}
 */
function parseInstrumentsFromXml(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  const scoreParts = xmlDoc.querySelectorAll("score-part");
  return Array.from(scoreParts).map((part, index) => ({
    name: part.querySelector("part-name")?.textContent || `Staf ${index + 1}`,
    index: index
  }));
}

function displayStaffSelection(xmlText, audioUrl) {
  const instruments = parseInstrumentsFromXml(xmlText);
  const selectionContainer = document.getElementById("staff-selection-container");
  const checkboxesDiv = document.getElementById("staff-checkboxes");
  const renderButton = document.getElementById("renderButton");

  if (!selectionContainer || !checkboxesDiv || !renderButton) return;

  checkboxesDiv.innerHTML = "";
  selectionContainer.style.display = "block";

  // const instruments = window.osmd.sheet.Instruments;

  // Tambahkan Checkbox "Pilih Semua"
  const selectAllDiv = document.createElement("div");
  const selectAllCb = document.createElement("input");
  selectAllCb.type = "checkbox";
  selectAllCb.id = "selectAllStaves";
  selectAllCb.checked = true;
  const selectAllLabel = document.createElement("label");
  selectAllLabel.htmlFor = "selectAllStaves";
  selectAllLabel.textContent = " Pilih Semua";
  selectAllDiv.appendChild(selectAllCb);
  selectAllDiv.appendChild(selectAllLabel);
  checkboxesDiv.appendChild(selectAllDiv);
  checkboxesDiv.appendChild(document.createElement("hr"));

  const staffCheckboxes = [];
  instruments.forEach((instr, index) => {
    const div = document.createElement("div");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "staff-checkbox";
    cb.id = "staff-cb-" + index;
    cb.value = index;
    cb.checked = true;
    staffCheckboxes.push(cb);

    const label = document.createElement("label");
    label.htmlFor = "staff-cb-" + index;
    label.textContent = " " + (instr.Name || `Staf ${index + 1}`);

    div.appendChild(cb);
    div.appendChild(label);
    checkboxesDiv.appendChild(div);
  });

  selectAllCb.addEventListener("change", (e) => {
    staffCheckboxes.forEach(cb => cb.checked = e.target.checked);
  });

  renderButton.onclick = async () => {
    const selectedIndices = staffCheckboxes
      .filter(cb => cb.checked)
      .map(cb => parseInt(cb.value));

    if (selectedIndices.length === 0) {
      alert("Silakan pilih minimal satu staf untuk dirender.");
      return;
    }

    if (!window.osmd) {
      window.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmdCanvas", {
        zoom: 0.4,
        drawFromMeasureNumber: 1,
        drawUpToMeasureNumber: Number.MAX_SAFE_INTEGER,
      });
    }
    const osmd = window.osmd;
    osmd.zoom = 0.4;

    await osmd.load(xmlText);

    finalizeRender(selectedIndices, audioUrl);
    selectionContainer.style.display = "none";
  };
}

function finalizeRender(selectedIndices, audioUrl) {
  const osmd = window.osmd;
  let loader = document.querySelector("#fileloader");
  let container = document.querySelector("#container");
  if (loader) loader.style.display = "none";
  if (container) container.style.display = "block";

  // Atur visibilitas instrumen berdasarkan pilihan
  osmd.sheet.Instruments.forEach((instr, index) => {
    instr.Visible = selectedIndices.includes(index);
  });

  osmd.render();

  if (pb) pb.stop();
  pb = new PlaybackEngine();
  pb.loadScore(osmd);
  pb.setBpm(osmd.sheet.DefaultStartTempoInBpm);

  if (!audioPlayer) audioPlayer = document.getElementById("audioPlayer");
  if (audioUrl && audioPlayer) {
    audioPlayer.src = audioUrl;
    audioPlayer.load();
    let audioWrapper = document.getElementById("audio-container");
    if (audioWrapper) audioWrapper.style.display = "block";
  }

  if (audioPlayer) {
    pb.attachAudio(audioPlayer);
  }

  let tracks = pb.getInstrumentMap(osmd.sheet.Instruments.filter(i => i.Visible));
  renderInstrument(document.querySelector("#instruments"), tracks);
  osmd.cursor.reset();
  osmd.cursor.show();
  alignInstrumentsToStaves(osmd);

  // Play tidak dipanggil otomatis, dilakukan manual oleh user
  pb.scroll();
  hideCursor();
}

function renderInstrument(element, tracks) {
  let base = "instruments/images/";
  let ul = document.createElement("div");
  ul.classList.add("elem-ul");
  let rendered = {};
  let idx = 0;
  let factor = 72;
  for (let track of tracks) {
    if (typeof rendered[track.partId] == "undefined") {
      let li = document.createElement("div");
      li.classList.add("elem-li");
      li.classList.add("instr");
      let img = document.createElement("img");
      if (track.hasSibling) {
        img.setAttribute("src", base + track.voice.midiInstrumentID + ".png");
        img.setAttribute("alt", track.partAbbreviation);
        for (let track2 of tracks) {
          li.classList.add("instr-" + track2.idString);
        }
      } else {
        img.setAttribute("src", base + track.voice.midiInstrumentID + ".png");
        img.setAttribute("alt", track.voice.name);
        li.classList.add("instr-" + track.idString);
      }
      let div = document.createElement("div");
      div.classList.add("instrument-container");
      li.classList.add("box-" + idx);
      let top = factor * idx;
      li.style.top = top + "px";
      div.appendChild(img);
      li.appendChild(div);
      ul.appendChild(li);
      rendered[track.partId] = track.partId;
      idx++;
    }
  }

  element.innerHTML = "";
  element.appendChild(ul);
}

function alignInstrumentsToStaves(osmd) {
  if (!osmd || !osmd.cursor || !osmd.cursor.iterator || !osmd.cursor.iterator.currentMeasure) return;

  const measure = osmd.cursor.iterator.currentMeasure;
  const verticalMeasureList = measure.verticalMeasureList || [];

  const container = document.getElementById("osmdCanvas");
  if (!container) return;

  const containerRect = container.getBoundingClientRect();

  let scrollPos = container.scrollTop;

  for (let idx = 0; idx < verticalMeasureList.length; idx++) {
    const el = document.querySelector(".box-" + idx);
    if (!el) continue;

    const stave = verticalMeasureList[idx].stave;
    if (!stave) continue;

    const targetTop = stave.y - scrollPos; //containerRect.top;
    //console.log(`Stave ${idx}: stave.y=${stave.y}, containerRect.top=${containerRect.top}, targetTop=${targetTop}`);
    if (Number.isNaN(targetTop)) continue;

    let attrTop = el.dataset.top;

    if (typeof attrTop === "undefined") {
      attrTop = el.offsetTop;
      el.dataset.top = attrTop;
    }

    let currentTop = parseFloat(attrTop);

    let delta = targetTop - currentTop;
    //console.log(`Aligning instrument ${idx}: currentTop=${currentTop}, targetTop=${targetTop}, delta=${delta}`);

    if (Math.abs(delta) < 1 || Math.abs(delta) > 400) continue;

    /*
    const maxDelta = 20;

    if (Math.abs(delta) > maxDelta) {
      delta = Math.sign(delta) * maxDelta;
    }
    */
    el.style.transform = `translateY(${delta}px)`;
    if(el.dataset.top == 'undefined') {
      el.dataset.top = currentTop;
    }
  }
}

function hideCursor() {
}
function handleFileSelect(evt) {
  document.querySelector("#fileloader").style.display = "none";
  document.querySelector("#container").style.display = "block";
  let files = evt.target.files; // FileList object

  let maxOSMDDisplays = 10; // how many scores can be displayed at once (in a vertical layout)
  let osmdDisplays = Math.min(files.length, maxOSMDDisplays);

  for (let i = 0, file = files[i]; i < osmdDisplays; i++) {
    if (!file.name.match(".*.xml") && !file.name.match(".*.musicxml") && !file.name.match(".*.mxl")) {
      alert("You selected a non-xml file. Please select only music xml files.");
      continue;
    }

    let reader = new FileReader();

    reader.onload = function (e) {
      let osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmdCanvas", {
        // set options here
        zoom: 0.4,
        drawFromMeasureNumber: 1,
        drawUpToMeasureNumber: Number.MAX_SAFE_INTEGER, // draw all measures, up to the end of the sample
      });
      osmd.zoom = 0.4;

      osmd.load(e.target.result).then(function () {
        window.osmd = osmd; // give access to osmd object in Browser console, e.g. for osmd.setOptions()
        //console.log("e.target.result: " + e.target.result);
        osmd.render();
        pb = new PlaybackEngine();
        pb.loadScore(osmd);
        pb.setBpm(osmd.sheet.DefaultStartTempoInBpm);

        let tracks = pb.getInstrumentMap(osmd.sheet.instruments);
        renderInstrument(document.querySelector("#instruments"), tracks);
        osmd.cursor.reset();
        osmd.cursor.show();
        alignInstrumentsToStaves(osmd);

        if (!audioPlayer) audioPlayer = document.getElementById("audioPlayer");
        if (audioPlayer) {
          pb.attachAudio(audioPlayer);
          let audioWrapper = document.getElementById("audio-container");
          if (audioWrapper) audioWrapper.style.display = "block";
        }

        pb.play();
        pb.scroll();
        hideCursor();
      });
    };
    if (file.name.match(".*.mxl") || file.name.match(".*.xml")) {
      // have to read as binary, otherwise JSZip will throw ("corrupted zip: missing 37 bytes" or similar)
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file);
    }
  }
}
