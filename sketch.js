// ----- Digital Safe Web Interface -----
// This code creates a p5.js interface that talks to the Arduino over Web Serial.
// It shows a digital lock, keypad, and the current state (LOCKED / UNLOCKED).
// When you type a PIN on the Arduino keypad, the webpage updates visually.

let lockState = "LOCKED";  // Keeps track of whether the lock is locked/unlocked
let entered = "";           // Stores the current digits entered
const keys = ["1","2","3","A","4","5","6","B","7","8","9","C","*","0","#","D"];  // Key labels

let port = null;            // Serial port reference
let connectBtn;             // The “Connect to Arduino” button

function setup() {
  // Create the canvas for the lock emoji
  createCanvas(420, 560).parent("canvasWrap");
  textAlign(CENTER, CENTER);
  noStroke();

  // Set up the "Connect to Arduino" button
  connectBtn = select("#connectBtn");
  connectBtn.mousePressed(connectSerial);  // When clicked, open serial connection
}

function draw() {
  background("#0f1220");  // Dark blue background 

  // ---- Title ----
  fill(255);
  textSize(28);
  text("Digital Safe", width / 2 + 30, 70);  // Slightly shifted for better centering

  // Lock emoji
  textSize(90);
  // Change color based on state
  if (lockState === "UNLOCKED") fill("#7CFFB8"); 
  else if (lockState === "WRONG") fill("#FF7A7A"); 
  else fill("#E9ECFF"); 
  // Switch between open and closed lock emoji
  text(lockState === "UNLOCKED" ? "🔓" : "🔒", width / 2 + 30, 150);

 
  drawDots(width / 2, 210);  // Displays entered PIN as dots below the lock

  drawPad(60, 260, 80, 60, 12);  // Draws the keypad layout

  // State text
  fill("#aab1d4");
  textSize(14);
  text("State: " + lockState, width / 2 + 30, height - 10);

  // Read incoming serial messages from Arduino ----
  // The Arduino sends messages like "KEY:1" or "STATE:UNLOCKED"
  if (port && typeof port.opened === "function" && port.opened()
      && typeof port.readUntil === "function") {
    const line = port.readUntil("\n");  // Reads until newline character
    if (line && line.length) handleLine(line.trim());  // Process it
  }
}

function drawDots(x, y) {
  // Draws dots for each entered digit
  const dots = "•".repeat(entered.length).padEnd(4, " ");
  fill("#e9ecff");
  textSize(30);
  text(dots, x + 30, y);  // Centered under the lock
}

function drawPad(x0, y0, w, h, gap) {
  // Draws the keypad grid (4x4)
  fill("#1b2344");
  textSize(20);
  let i = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const x = x0 + c * (w + gap), y = y0 + r * (h + gap);
      rect(x, y, w, h, 10);  // Draw button rectangle
      fill("#E9ECFF");
      text(keys[i], x + w / 2, y + h / 2);  // Draw label in the center
      fill("#1b2344");  // Reset fill for next rect
      i++;
    }
  }
}

//SERIAL CONNECTION
async function connectSerial() {
  // This function runs when you click “Connect to Arduino”
  // It handles the browser permission popup and starts reading serial data.

  // Try to close any previous serial connections first since I was having issues with accessing the port again
  try {
    if (reader) {
      await reader.cancel();
      reader.releaseLock();
      reader = null;
    }
    if (nativePort) {
      if (nativePort.readable) {
        try { await nativePort.readable.cancel(); } catch (e) {}
      }
      await nativePort.close();
      nativePort = null;
    }
    if (port && port.opened()) {
      await port.close();
      port = null;
    }
  } catch (e) {
    // ignore errors from old ports
  }

  // Make sure Web Serial is supported
  if (!("serial" in navigator)) {
    alert("Your browser doesn’t support Web Serial (use Chrome or Edge).");
    return;
  }

  try {
    // Ask the user to choose which Arduino to connect to
    nativePort = await navigator.serial.requestPort();
    // Open at 115200 baud (matches the Arduino sketch)
    await nativePort.open({ baudRate: 115200 });

    // Decode incoming text stream
    const dec = new TextDecoderStream();
    nativePort.readable.pipeTo(dec.writable);
    reader = dec.readable.getReader();

    // Start a small async read loop to handle incoming messages
    (async () => {
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        buf += value;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handleLine(line);  // Pass line to message handler
        }
      }
    })();

    // Once connected, disable the button
    connectBtn.html("Connected").attribute("disabled", "");
    return;
  } catch (e) {
    // This usually means the port is already in use by the Arduino IDE or VS Code
    alert("Couldn't open the serial port. Close the Arduino IDE or other apps and try again.");
    console.error(e);
  }
}

function handleLine(line) {
  // This function reacts to messages from the Arduino sketch

  if (line.startsWith("KEY:")) {
    // e.g. "KEY:3" — means a button was pressed on the physical keypad
    const k = line.slice(4).trim();
    if (k >= "0" && k <= "9" && entered.length < 4) entered += k;  // add number
    else if (k === "*" && entered.length) entered = entered.slice(0, -1);  // delete
  } 
  else if (line.startsWith("STATE:")) {
    // e.g. "STATE:UNLOCKED" or "STATE:WRONG"
    const s = line.slice(6).trim().toUpperCase();
    if (s === "UNLOCKED") { lockState = "UNLOCKED"; entered = ""; }
    else if (s === "WRONG") { lockState = "WRONG"; entered = ""; }
    else if (s === "IDLE") { lockState = "LOCKED"; }
  }
}