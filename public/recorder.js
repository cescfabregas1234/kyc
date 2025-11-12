const oneClick = document.getElementById('oneClick');
const preview  = document.getElementById('preview');
const statusEl = document.getElementById('status');

let stream, mediaRecorder, chunks = [];

function setStatus(t){ statusEl.textContent = t; }

oneClick.addEventListener('click', async () => {
  oneClick.disabled = true;
  setStatus('Requesting camera permission…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
    preview.srcObject = stream;

    // Start recording immediately
    chunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const fd = new FormData();
      fd.append('video', blob, `rec_${Date.now()}.webm`);
      fd.append('consent_text', 'User clicked Start & Record (consent)');
      fd.append('consent_ts', new Date().toISOString());
      fd.append('user_agent', navigator.userAgent);

      setStatus('Uploading…');
      try {
        const resp = await fetch('/upload', { method: 'POST', body: fd });
        const json = await resp.json();
        setStatus(`Uploaded. Server id: ${json.id || 'n/a'}`);
      } catch (err) {
        console.error(err);
        setStatus('Upload failed — see console.');
        oneClick.disabled = false;
      } finally {
        try { stream.getTracks().forEach(t=>t.stop()); } catch {}
      }
    };

    mediaRecorder.start();
    setStatus('Recording… auto-stops in 8s');
    setTimeout(() => {
      try { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); } catch {}
    }, 8000);
  } catch (err) {
    console.error(err);
    setStatus('Permission denied or no camera.');
    oneClick.disabled = false;
  }
});
