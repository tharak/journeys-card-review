const list = document.querySelector('#card-source-pages');

try {
  const response = await fetch('data.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const urls = new Set();
  for (const card of data.cards) {
    if (card.sourceUrl) urls.add(card.sourceUrl);
    for (const scan of card.sourceScans ?? []) {
      if (scan.sourceUrl) urls.add(scan.sourceUrl);
    }
  }
  const entries = [...urls].sort().map(url => {
    const entry = document.createElement('li');
    entry.textContent = url;
    return entry;
  });
  list.replaceChildren(...entries);
} catch (error) {
  console.error('Could not load card source pages', error);
  list.textContent = 'Card source pages could not load.';
}
