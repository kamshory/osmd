let pb = null;
let audioPlayer = null;

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
  let loader = document.querySelector("#fileloader");
  let container = document.querySelector("#container");
  if (loader) loader.style.display = "none";
  if (container) container.style.display = "block";

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
    let osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmdCanvas", {
      zoom: 0.5,
      drawFromMeasureNumber: 1,
      drawUpToMeasureNumber: Number.MAX_SAFE_INTEGER,
    });
    osmd.zoom = 0.5;

    await osmd.load(xmlText);
    window.osmd = osmd;
    osmd.render();

    pb = new PlaybackEngine();
    pb.loadScore(osmd);
    pb.setBpm(osmd.sheet.DefaultStartTempoInBpm);
    if (audioPlayer) {
      pb.attachAudio(audioPlayer);
    }

    let tracks = pb.getInstrumentMap(osmd.sheet.instruments);
    renderInstrument(document.querySelector("#instruments"), tracks);
    osmd.cursor.reset();
    osmd.cursor.show();

    pb.play();
    pb.scroll();
    hideCursor();
  } catch (error) {
    console.error("Failed to load score from URL", error);
    alert("Gagal memuat skor XML dari URL. Periksa URL dan CORS.");
  }
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
        zoom: 0.5,
        drawFromMeasureNumber: 1,
        drawUpToMeasureNumber: Number.MAX_SAFE_INTEGER, // draw all measures, up to the end of the sample
      });
      osmd.zoom = 0.5;

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

        for (
          let idx = 0;
          idx <
          osmd.cursor.iterator.currentMeasure.verticalMeasureList.length - 1;
          idx++
        ) {
          let top =
            osmd.cursor.iterator.currentMeasure.verticalMeasureList[idx].stave
              .y - osmd.cursor.cursorElement.offsetTop;
          document.querySelector(".box-" + idx).style.top = top + "px";
        }
        osmd.cursor.reset();

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
