const form         = document.getElementById("kycForm");
const statusBox    = document.getElementById("status");
const statusText   = statusBox?.querySelector(".status-text");
const statusDot    = statusBox?.querySelector(".dot");
const previewVideo = document.getElementById("preview");
const submitBtn    = document.getElementById("submitBtn");
const btnSpinner   = document.getElementById("btnSpinner");
const btnLabel     = document.getElementById("btnLabel");

let stream;

// --- UI helpers ----------------------------------------------------

function setStatus(text, mode) {
  if (statusText) statusText.textContent = text;
  if (!statusBox || !statusDot) return;

  statusBox.classList.remove(
    "status-recording",
    "status-uploading",
    "status-error",
    "status-success"
  );
  if (mode) statusBox.classList.add(mode);
}

function setButtonLoading(isLoading, labelWhenIdle) {
  if (!submitBtn) return;
  submitBtn.disabled = isLoading;
  if (btnSpinner) btnSpinner.style.display = isLoading ? "inline-block" : "none";
  if (btnLabel && labelWhenIdle && !isLoading) btnLabel.textContent = labelWhenIdle;
}

// --- Camera + photo capture ----------------------------------------

async function startCamera() {
  // Ask for permission + start live preview
  stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

  if (previewVideo) {
    previewVideo.srcObject = stream;
    previewVideo.style.display = "block";
  }
}

/**
 * Capture a single frame from the video as a PNG Blob
 */
async function capturePhoto() {
  if (!stream) {
    await startCamera();
  }

  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  const width  = settings.width  || 640;
  const height = settings.height || 480;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Draw current video frame onto the canvas
  ctx.drawImage(previewVideo, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      "image/png",
      0.95
    );
  });
}

// --- Upload form + photo -------------------------------------------

async function uploadData(formData, photoBlob) {
  // "photo" is the field name our server will expect
  formData.append("photo", photoBlob, "snapshot.png");

  const res = await fetch("/upload-photo", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error("Upload failed: " + res.status);
  }

  return res.text();
}

// --- Handle form submission ----------------------------------------

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // stop normal browser submit

    try {
      setButtonLoading(true);
      setStatus("Starting camera… please allow access.", null);

      // Start camera + preview
      await startCamera();

      setStatus("Capturing photo…", "status-recording");
      const photoBlob = await capturePhoto();

      setStatus("Uploading transaction and photo…", "status-uploading");
      const formData = new FormData(form);
      const result = await uploadData(formData, photoBlob);

      setStatus("Submitted successfully. Server says: " + result, "status-success");
      setButtonLoading(false, "Submitted");
    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err.message || err), "status-error");
      setButtonLoading(false, "Submit Transaction Information");
    } finally {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    }
  });
}
