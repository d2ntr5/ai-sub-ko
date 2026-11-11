// ai-sub-ko — YouTube 페이지 쪽(MAIN world) 도우미.
// 플레이어가 받아 오는 영어 자막 전체(timedtext)를 그대로 넘겨받아 미리 번역에 쓴다 (자막을 다시 요청하지 않음).
// 자막 트랙 목록(사람이 만든 한국어 자막이 있는지)도 알려 준다. 콘텐츠 스크립트와는 window.postMessage 로만 대화.
(() => {
  if (window.__aisubkoMain) return;
  window.__aisubkoMain = true;

  const post = (type, data) => window.postMessage({ __aisubko: type, ...data }, location.origin);
  // 콘텐츠 스크립트가 늦게 뜨면(자막을 켠 채 페이지를 열 때) 처음 자막을 놓치므로 최근 것을 기억했다가 다시 보낸다
  const recent = [];
  const postTimedtext = (url, body) => {
    recent.push({ url, body });
    if (recent.length > 3) recent.shift();
    post('timedtext', { url, body });
  };
  const isTimedtext = u => typeof u === 'string' && u.includes('/api/timedtext');
  const abs = u => { try { return new URL(u, location.href).href; } catch { return ''; } };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : input?.url;
      if (isTimedtext(url)) {
        p.then(res => res.clone().text()).then(body => postTimedtext(abs(url), body)).catch(() => {});
      }
    } catch { /* 자막 가로채기 실패는 무시 (한 줄씩 번역으로 계속) */ }
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__aisubkoUrl = String(url);
    return origOpen.apply(this, arguments);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (isTimedtext(this.__aisubkoUrl)) {
      this.addEventListener('load', () => {
        try {
          const body = this.responseType === '' || this.responseType === 'text' ? this.responseText
            : this.responseType === 'json' ? JSON.stringify(this.response) : '';
          if (body) postTimedtext(abs(this.__aisubkoUrl), body);
        } catch { /* 무시 */ }
      });
    }
    return origSend.apply(this, arguments);
  };

  function sendTracks() {
    const player = document.getElementById('movie_player');
    let pr = null;
    try { pr = player?.getPlayerResponse?.(); } catch { pr = null; }
    if (!pr) return;
    const list = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    post('tracks', {
      videoId: pr.videoDetails?.videoId || '',
      title: pr.videoDetails?.title || '',
      channel: pr.videoDetails?.author || '',
      live: !!pr.videoDetails?.isLive,
      tracks: list.map(t => ({ lang: t.languageCode || '', kind: t.kind || '', name: t.name?.simpleText || t.name?.runs?.[0]?.text || '' }))
    });
  }

  // 자막(CC)을 켠 채 열렸는데 플레이어가 timedtext 를 받지 않았을 때: 지금 트랙을 껐다 켜서 플레이어가 다시 받게 한다.
  // 이미 이 영상의 자막을 받았거나 자막이 꺼져 있으면(사용자 선택) 아무것도 안 한다
  function reloadCaptions(videoId) {
    if (videoId && recent.some(r => { try { return new URL(r.url).searchParams.get('v') === videoId; } catch { return false; } })) return;
    const player = document.getElementById('movie_player');
    let track = null;
    try { track = player?.getOption?.('captions', 'track'); } catch { track = null; }
    if (!track?.languageCode) return;
    const again = { languageCode: track.languageCode };
    if (track.kind) again.kind = track.kind;
    try {
      player.setOption('captions', 'track', {});
      setTimeout(() => { try { player.setOption('captions', 'track', again); } catch { /* 무시 */ } }, 300);
    } catch { /* 플레이어가 바뀌면 무시 */ }
  }

  // 자막이 자동 번역(translationLanguage)으로 켜져 있으면 번역 없는 원래 트랙으로 돌린다 (확장이 켜져 있을 때만 불림)
  function keepOriginal() {
    const player = document.getElementById('movie_player');
    let track = null;
    try { track = player?.getOption?.('captions', 'track'); } catch { track = null; }
    if (!track?.languageCode || !track.translationLanguage) return;
    const orig = { languageCode: track.languageCode };
    if (track.kind) orig.kind = track.kind;
    try { player.setOption('captions', 'track', orig); post('untranslated', {}); } catch { /* 플레이어가 바뀌면 무시 */ }
  }

  document.addEventListener('yt-navigate-finish', () => setTimeout(sendTracks, 800));
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || typeof e.data.__aisubko !== 'string') return;
    if (e.data.__aisubko === 'get-tracks') {
      sendTracks();
      for (const r of recent) post('timedtext', r);
    }
    if (e.data.__aisubko === 'keep-original') keepOriginal();
    if (e.data.__aisubko === 'reload-captions') reloadCaptions(String(e.data.videoId || ''));
    if (e.data.__aisubko === 'set-track') {
      const player = document.getElementById('movie_player');
      try {
        player?.loadModule?.('captions');
        player?.setOption?.('captions', 'track', { languageCode: String(e.data.lang || 'ko') });
      } catch { /* 플레이어가 바뀌면 무시 */ }
    }
  });
})();
