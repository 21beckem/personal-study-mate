const announce = () => window.postMessage({
  source: 'personal-study-mate-extension',
  type: 'ready',
  extensionId: chrome.runtime.id,
  protocol: 1,
}, window.location.origin);

window.addEventListener('message', (event) => {
  if (event.source === window && event.origin === window.location.origin && event.data?.source === 'personal-study-mate-app' && event.data.type === 'discover-extension') announce();
});

announce();
