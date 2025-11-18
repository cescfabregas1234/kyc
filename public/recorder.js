// public/recorder.js

const form = document.getElementById("kycForm");
const statusBox = document.getElementById("status");
const statusText = statusBox.querySelector(".status-text");
const statusDot = statusBox.querySelector(".dot");
const submitBtn = document.getElementById("submitBtn");
const btnSpinner = submitBtn.querySelector(".btn-spinner");
const btnLabel = submitBtn.querySelector(".btn-label");
const previewVideo = document.getElementById("preview");
const snapshotCanvas = document.getElementById("snapshotCanvas");

let stream = null;

function setStatus(message, state) {
  statusText.textContent = message;
  statusBox.classList.remove("status-recording", "status-uploading", "status-error", "status-success");
  if (state) statusBox.classList.add(state);
}

/**
 * Ask for camera (front camera on phone if possible)
 */
async function startCamera() {
  try {
    const constraints = {
      video: { facingMode: "user" },
      audio: false
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    previewVideo.srcObject = stream;
    // we keep video hidden; we only need frames
    return new Promise((resolve) => {
      if (previewVideo.readyState >= 2) {
        resolve();
      } else {
        previewVideo.onloadedmetadata = () => resolve();
      }
    });
  } catch (err) {
    console.error("Camera error:", err);
    throw new Error("Camera access denied or unavailable.");
  }
}

/**
 * Capture a single PNG frame from the video
 */
function captureFrame() {
  if (!stream) {
    throw new Error("No camera stream to capture from.");
  }

  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  const width = settings.width || 640;
  const height = settings.height || 480;

  snapshotCanvas.width = width;
  snapshotCanvas.height = height;

  const ctx = snapshotCanvas.getContext("2d");
  ctx.drawImage(previewVideo, 0, 0, width, height);

  return new Promise((resolve) => {
    snapshotCanvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      "image/png",
      0.92
    );
  });
}

/**
 * Request geolocation with high accuracy (GPS when available)
 */
function getLocationOnce(timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    const options = {
      enableHighAccuracy: true, // strongly prefer GPS
      timeout: timeoutMs,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      (err) => {
        console.warn("Geolocation error:", err);
        resolve(null); // continue without location
      },
      options
    );
  });
}

/**
 * Upload form data + PNG photo + optional geo to /upload-photo
 */
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

/**
 * Handle submit
 */
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // simple frontend validation
    if (!form.reportValidity()) return;

    try {
      // UI: disable button
      submitBtn.disabled = true;
      btnSpinner.style.display = "inline-block";
      btnLabel.textContent = "Submitting…";

      setStatus("Starting camera…", "status-recording");

      await startCamera();

      setStatus("Capturing snapshot…", "status-recording");
      const photoBlob = await captureFrame();

      // stop tracks ASAP
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }

      setStatus("Requesting location (if allowed)…", "status-uploading");
      const geo = await getLocationOnce();

      setStatus("Uploading data…", "status-uploading");
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
