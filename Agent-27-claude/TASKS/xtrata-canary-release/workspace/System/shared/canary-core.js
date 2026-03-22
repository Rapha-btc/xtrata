window.XtrataCanaryCore = {
  version: '1.0.0',
  summarize(copy) {
    const title = copy?.title || 'Xtrata Recursive Canary';
    const message = copy?.message || 'Recursive canary ready.';
    return `${title}: ${message}`;
  },
  lineage() {
    return [
      'runtime catalog',
      'release catalog',
      'root catalog'
    ];
  }
};
