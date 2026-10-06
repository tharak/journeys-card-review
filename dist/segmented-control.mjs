export function connectSegmentedControl(group, onChange) {
  const buttons = [...group.querySelectorAll('button[data-value]')];
  let selected = buttons.find(button => button.getAttribute('aria-checked') === 'true') || buttons[0];
  function select(button, focus = false) {
    const changed = button !== selected;
    selected = button;
    for (const option of buttons) {
      option.setAttribute('aria-checked', String(option === selected));
      option.tabIndex = option === selected ? 0 : -1;
    }
    if (focus) button.focus({ preventScroll: true });
    button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (changed) onChange(button.dataset.value);
  }
  for (const [index, button] of buttons.entries()) {
    button.addEventListener('click', () => select(button));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % buttons.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + buttons.length - 1) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else return;
      event.preventDefault();
      event.stopPropagation();
      select(buttons[next], true);
    });
  }
  return { get value() { return selected.dataset.value; } };
}
