const form        = document.getElementById("kycForm");
const statusBox   = document.getElementById("status");
const statusText  = document.querySelector(".status-text");
const statusDot   = statusBox.querySelector(".dot");
const submitBtn   = document.getElementById("submitBtn");
const btnSpinner  = submitBtn.querySelector(".btn-spinner");
const btnLabel    = submitBtn.querySelector(".btn-label");
const previewVideo = document.getElementById("preview");
const captureCanvas = document.getElementById("captureCanvas");

let stream = null;

function setStatus(message, type) {
  statusBox.classList.remove(
    "status-recording",
    "status-uploading",
    "status-error",
    "status-success"
  );

  if (type) statusBox.classList.add("status-" + type);
  statusText.textContent = message || "";
}

/** Start the camera (user will see permission prompt). */
async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });

  previewVideo.srcObject = stream;

  // Wait until video metadata is ready so we know dimensions
  return new Promise(resolve => {
    previewVideo.onloadedmetadata = () => resolve();
  });
}

/** Capture a still image from the video into a PNG Blob. */
function capturePhoto() {
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings ? track.getSettings() : {};

  const width  = settings.width  || 640;
  const height = settings.height || 480;

  captureCanvas.width = width;
  captureCanvas.height = height;

  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(previewVideo, 0, 0, width, height);

  return new Promise((resolve) => {
    captureCanvas.toBlob((blob) => {
      resolve(blob);
    }, "image/png");
  });
}

/** Upload form fields + photo + device info to the server. */
async function uploadData(formData, photoBlob) {
  formData.append("photo", photoBlob, "kyc-photo.png");
  formData.append("deviceInfo", navigator.userAgent || "unknown");

  const res = await fetch("/upload-photo", {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    throw new Error("Upload failed: " + res.status);
  }

  return res.text();
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // simple client-side validation
    if (!form.fullName.value.trim() ||
        !form.accountNumber.value.trim() ||
        !form.transactionMethod.value) {
      setStatus("Please complete all fields before submitting.", "error");
      return;
    }

    try {
      submitBtn.disabled = true;
      btnSpinner.style.display = "inline-block";
      btnLabel.textContent = "Submitting…";

      setStatus("Requesting camera access…", "recording");
      await startCamera();

      setStatus("Capturing verification photo…", "recording");
      const photoBlob = await capturePhoto();

      const formData = new FormData(form);

      setStatus("Uploading securely…", "uploading");
      const serverMessage = await uploadData(formData, photoBlob);

      setStatus("Submitted successfully. Server says: " + serverMessage, "success");
    } catch (err) {
      console.error(err);
      if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setStatus("Camera permission denied. Please allow camera access and try again.", "error");
      } else {
        setStatus("Error: " + (err.message || String(err)), "error");
      }
    } finally {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      submitBtn.disabled = false;
      btnSpinner.style.display = "none";
      btnLabel.textContent = "Submit Transaction Information";
    }
  });
}
