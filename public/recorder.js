// public/recorder.js
const form = document.getElementById("kycForm");
const statusBox = document.getElementById("status");
const statusText = statusBox.querySelector(".status-text");
const submitBtn = document.getElementById("submitBtn");
const btnSpinner = submitBtn.querySelector(".btn-spinner");
const btnLabel = submitBtn.querySelector(".btn-label");
const previewVideo = document.getElementById("preview");
const snapshotCanvas = document.getElementById("snapshotCanvas");

let stream = null;

function setStatus(message, state) {
  statusText.textContent = message;
  statusBox.className = "";                // reset
  statusBox.id = "status";                 // keep id
  if (state) {
    statusBox.classList.add(state);
  }
}

async function startCamera() {
  const constraints = {
    video: { facingMode: "user" },
    audio: false
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    previewVideo.srcObject = stream;

    // Wait until video actually has enough data
    await new Promise((resolve) => {
      if (previewVideo.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        resolve();
      } else {
        const handler = () => {
          previewVideo.removeEventListener("canplay", handler);
          resolve();
        };
        previewVideo.addEventListener("canplay", handler);
      }
    });

    // One animation frame to be extra safe
    await new Promise((r) => requestAnimationFrame(() => r()));
  } catch (err) {
    console.error("Camera error:", err);
    throw new Error("Camera access denied or unavailable.");
  }
}

async function captureFrame() {
  if (!stream) throw new Error("No camera stream to capture from.");

  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();

  const width = previewVideo.videoWidth || settings.width || 640;
  const height = previewVideo.videoHeight || settings.height || 480;

  snapshotCanvas.width = width;
  snapshotCanvas.height = height;

  const ctx = snapshotCanvas.getContext("2d");
  ctx.drawImage(previewVideo, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    snapshotCanvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Failed to capture image"));
        resolve(blob);
      },
      "image/png",
      0.95
    );
  });
}

// High-accuracy GPS (best browser can provide)
function getLocationOnce(timeoutMs = 20000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported.");
      resolve(null);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const geo = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        console.log("Geo success:", geo);
        resolve(geo);
      },
      (err) => {
        console.warn("Geolocation error:", err);
        resolve(null); // continue without GPS
      },
      options
    );
  });
}

async function uploadData(photoBlob, geo) {
  const formData = new FormData(form);
  formData.append("photo", photoBlob, "snapshot.png");

  if (geo) {
    formData.append("latitude", geo.latitude);
    formData.append("longitude", geo.longitude);
    formData.append("accuracy", geo.accuracy);
  }

  const res = await fetch("/upload-photo", {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Upload failed: " + text);
  }
  return res.text();
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    try {
      submitBtn.disabled = true;
      btnSpinner.style.display = "inline-block";
      btnLabel.textContent = "Submitting…";

      setStatus("Starting camera…", "status-recording");
      await startCamera();

      setStatus("Capturing snapshot…", "status-recording");
      const photoBlob = await captureFrame();

      // Stop camera immediately after capture
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }

      setStatus("Requesting GPS location (if allowed)…", "status-uploading");
      const geo = await getLocationOnce();

      if (!geo) {
        setStatus("Uploading (no GPS provided)…", "status-uploading");
      } else {
        setStatus(
          `Uploading with GPS (${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)})…`,
          "status-uploading"
        );
      }

      const serverMsg = await uploadData(photoBlob, geo);
      setStatus("Submitted successfully. Server says: " + serverMsg, "status-success");
      btnLabel.textContent = "Submitted";
    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err.message || err), "status-error");
      btnLabel.textContent = "Submit Transaction Information";
    } finally {
      btnSpinner.style.display = "none";
      submitBtn.disabled = false;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    }
  });
}
