window.XtrataCanaryWidget = {
  renderList(target, items) {
    if (!target) return;
    const list = document.createElement('ol');
    list.style.paddingLeft = '1.25rem';
    for (const item of items) {
      const entry = document.createElement('li');
      entry.textContent = item;
      list.appendChild(entry);
    }
    target.replaceChildren(list);
  },
  render(target, copy) {
    const items = Array.isArray(copy?.operator_checklist) ? copy.operator_checklist : [];
    this.renderList(target, items);
  }
};
