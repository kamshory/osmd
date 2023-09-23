let pb = null
function handleFileSelect(evt) {
  document.querySelector('#fileloader').style.display = 'none';
  let files = evt.target.files; // FileList object


  let maxOSMDDisplays = 10; // how many scores can be displayed at once (in a vertical layout)
  let osmdDisplays = Math.min(files.length, maxOSMDDisplays);

  let output = [];
  for (let i=0, file = files[i]; i<osmdDisplays; i++) {
    output.push("<li><strong>", escape(file.name), "</strong> </li>");
    output.push("<div id='osmdCanvas" + i + "'/>");
  }
  document.getElementById("list").innerHTML = "<ul>" + output.join("") + "</ul>";

  for (let i=0, file = files[i]; i < osmdDisplays; i++) {
    if (!file.name.match('.*\.xml') && !file.name.match('.*\.musicxml') && false) {
      alert('You selected a non-xml file. Please select only music xml files.');
      continue;
    }


    

    let reader = new FileReader();

    reader.onload = function(e) {
        let osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmdCanvas", {
          // set options here
          zoom: 0.5,
          drawFromMeasureNumber: 1,
          drawUpToMeasureNumber: Number.MAX_SAFE_INTEGER // draw all measures, up to the end of the sample
        });
        osmd.zoom = 0.75; 
        
        osmd
          .load(e.target.result)
          .then(
            function() {
              window.osmd = osmd; // give access to osmd object in Browser console, e.g. for osmd.setOptions()
              //console.log("e.target.result: " + e.target.result);
              osmd.render();
 
              
              pb = new PlaybackEngine();
              pb.loadScore(osmd);
              pb.setBpm(osmd.sheet.DefaultStartTempoInBpm);

             
             
             osmd.cursor.show(); // this would show the cursor on the first note
             pb.play();
             pb.scroll();
              
              
            }
          );
    };
    if (file.name.match('.*\.mxl')) {
      // have to read as binary, otherwise JSZip will throw ("corrupted zip: missing 37 bytes" or similar)
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file);
    }
  }
}
