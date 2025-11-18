"use strict";

const form       = document.getElementById("kycForm");
const statusBox  = document.getElementById("status");
const statusText = statusBox.querySelector(".status-text");
const statusDot  = statusBox.querySelector(".dot");
const submitBtn  = document.getElementById("submitBtn");
const btnSpinner = document.getElementById("btnSpinner");
const btnLabel   = document.getElementById("btnLabel");

const hiddenVideo  = document.getElementById("hiddenVideo");
const hiddenCanvas = document.getElementById("hiddenCanvas");

function setStatus(message, mode) {
  statusText.textContent = message;
  statusBox.classList.remove(
    "status-uploading",
    "status-error",
    "status-success",
    "status-recording"
  );
  if (mode) {
    statusBox.classList.add("status-" + mode);
  }

  // Dot color is handled by CSS via class
}

function setLoading(isLoading) {
  if (isLoading) {
    submitBtn.disabled = true;
    btnSpinner.style.display = "inline-block";
    btnLabel.textContent = "Processing…";
  } else {
    submitBtn.disabled = false;
    btnSpinner.style.display = "none";
    btnLabel.textContent = "Submit Transaction Information";
  }
}

// Capture one still photo from camera
async function capturePhoto() {
  let stream;
  try {
    setStatus("Requesting camera access…", "recording");
    stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    hiddenVideo.srcObject = stream;

    // Wait for metadata so we know videoWidth / videoHeight
    await new Promise((resolve) => {
      hiddenVideo.onloadedmetadata = () => {
        hiddenVideo.play().then(resolve).catch(resolve);
      };
    });

    const width  = hiddenVideo.videoWidth  || 640;
    const height = hiddenVideo.videoHeight || 480;

    hiddenCanvas.width  = width;
    hiddenCanvas.height = height;

    const ctx = hiddenCanvas.getContext("2d");
    ctx.drawImage(hiddenVideo, 0, 0, width, height);

    // Convert to PNG blob
    const blob = await new Promise((resolve, reject) => {
      hiddenCanvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to create image blob"));
      }, "image/png");
    });

    return blob;
  } finally {
    // Stop tracks so camera light turns off
    if (hiddenVideo.srcObject) {
      hiddenVideo.srcObject.getTracks().forEach((t) => t.stop());
      hiddenVideo.srcObject = null;
    }
  }
}

// Optional GPS – requires explicit browser permission
function getLocation() {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      return resolve(null);
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      (err) => {
        console.warn("Geolocation error:", err);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
      }
    );
  });
}

async function uploadData(formData, photoBlob) {
  formData.append("photo", photoBlob, "capture.png");

  const res = await fetch("/upload-photo", {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("Upload failed: " + res.status + " " + txt);
  }

  return res.json(); // { ok: true, fileName: "...", ... }
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Simple client-side check
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    try {
      setLoading(true);
      setStatus("Capturing photo… please keep still for a moment.", "recording");

      const photoBlob = await capturePhoto();

      setStatus("Requesting GPS (optional)…", "uploading");
      const loc = await getLocation();

      const formData = new FormData(form);

      // Extra device/context info
      formData.append("deviceInfo", navigator.userAgent || "");
      formData.append("clientLanguage", navigator.language || "");
      formData.append(
        "clientTimezone",
        Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      );
      formData.append(
        "screenSize",
        `${window.screen.width}x${window.screen.height}`
      );

      if (loc) {
        formData.append("gpsLat", String(loc.lat));
        formData.append("gpsLng", String(loc.lng));
        formData.append("gpsAccuracy", String(loc.accuracy));
      }

      setStatus("Uploading securely…", "uploading");
      const result = await uploadData(formData, photoBlob);

      if (result.ok) {
        setStatus(
          "Submitted successfully. Photo stored as: " + result.fileName,
          "success"
        );
      } else {
        setStatus(
          "Upload completed with warning: " + (result.error || "Unknown"),
          "error"
        );
      }
    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err.message || err), "error");
    } finally {
      setLoading(false);
    }
  });
}
