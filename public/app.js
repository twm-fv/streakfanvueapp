import { fanvue } from '/fanvue-sdk.js';

const els = {
  credits: document.getElementById('credits'),
  install: document.getElementById('install'),
  installNote: document.getElementById('install-note'),
  workspace: document.getElementById('workspace'),
  media: document.getElementById('media'),
  jobs: document.getElementById('jobs'),
  preset: document.getElementById('preset'),
  captions: document.getElementById('captions'),
  buy: document.getElementById('buy'),
  status: document.getElementById('status'),
};

function setStatus(message) {
  els.status.textContent = message ?? '';
  fanvue.resize(document.body.scrollHeight);
}

function selectedRatios() {
  return [...document.querySelectorAll('.ratios input:checked')].map((input) => input.value);
}

function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

async function api(path, options) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: options?.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function renderMedia(videos) {
  els.media.replaceChildren(
    ...videos.map((video) => {
      const item = document.createElement('li');
      const left = document.createElement('div');
      left.innerHTML = `<div class="mono">${video.uuid}</div>
        <div class="media__meta">${formatDuration(video.durationMs)} · ${video.width ?? '?'}×${video.height ?? '?'} · ${video.estimatedMinutes} min of credit</div>`;
      if (!video.socialExport.socialExportAllowed) {
        const warn = document.createElement('div');
        warn.className = 'media__meta blocked';
        warn.textContent = `Vault only: ${video.socialExport.reason}`;
        left.append(warn);
      }
      const button = document.createElement('button');
      button.className = 'button';
      button.textContent = 'Make clips';
      button.addEventListener('click', () => render(video.uuid, button));
      item.append(left, button);
      return item;
    }),
  );
  if (videos.length === 0) {
    els.media.innerHTML = '<li class="media__meta">No videos in the Vault yet.</li>';
  }
}

function renderJobs(jobs) {
  els.jobs.replaceChildren(
    ...jobs.map((job) => {
      const item = document.createElement('li');
      const clips = job.clips
        .map((clip) => `${clip.title}${clip.socialExportAllowed ? '' : ' (Vault only)'}`)
        .join(', ');
      item.innerHTML = `<div>
          <div>${job.preset} · <strong>${job.status}</strong></div>
          <div class="jobs__meta">${job.error ?? clips || 'no clips yet'}</div>
        </div>
        <div class="jobs__meta">${job.minutesCharged} min</div>`;
      return item;
    }),
  );
  if (jobs.length === 0) {
    els.jobs.innerHTML = '<li class="jobs__meta">Nothing rendered yet.</li>';
  }
}

async function render(mediaUuid, button) {
  const ratios = selectedRatios();
  if (ratios.length === 0) return setStatus('Pick at least one aspect ratio.');

  button.disabled = true;
  setStatus('Rendering. Long videos take a few minutes.');
  const { ok, status, data } = await api('/api/clips', {
    method: 'POST',
    body: JSON.stringify({
      mediaUuid,
      preset: els.preset.value,
      aspectRatios: ratios,
      captions: els.captions.checked,
    }),
  });
  button.disabled = false;

  if (status === 402) {
    setStatus(`Not enough credit: ${data.required} minutes needed, ${data.available} left.`);
    return;
  }
  if (!ok) return setStatus(data.error ?? 'Render failed.');

  setStatus(data.job.status === 'done' ? 'Clips are back in your Vault.' : `Job ${data.job.status}.`);
  fanvue.actionCompleted('clips-rendered');
  await refresh();
}

async function buyCredits() {
  const { ok, data } = await api('/api/purchase', { method: 'POST' });
  if (!ok) return setStatus(data.error ?? 'Could not start the purchase.');
  fanvue.createPurchaseRequest(data.purchase);
  setStatus(
    data.paymentsEnabled
      ? 'Complete the payment in the Fanvue modal.'
      : 'Payments are stubbed in this build: no charge was made and no credit was added.',
  );
}

async function refresh() {
  const [{ data: mediaData, status }, { data: jobsData }] = await Promise.all([
    api('/api/media'),
    api('/api/clips'),
  ]);
  if (status === 401) return showInstall();
  els.credits.textContent = `${mediaData.creditMinutes} render minutes left`;
  renderMedia(mediaData.videos ?? []);
  renderJobs(jobsData.jobs ?? []);
  fanvue.resize(document.body.scrollHeight);
}

function showInstall(session) {
  els.install.hidden = false;
  els.workspace.hidden = true;
  if (session && !session.oauthConfigured) {
    els.installNote.textContent =
      'This build has no Fanvue app credentials yet, so Connect will not work. See the README.';
  }
  fanvue.resize(document.body.scrollHeight);
}

async function start() {
  const { data: session } = await api('/api/session');
  if (!session.installed) return showInstall(session);
  els.install.hidden = true;
  els.workspace.hidden = false;
  els.buy.addEventListener('click', buyCredits);
  await refresh();
}

start().catch((error) => setStatus(`Something broke: ${error.message}`));
