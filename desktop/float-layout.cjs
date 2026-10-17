function monitorBounds(area, placement, count, expanded, docked = false) {
  const vertical = placement.edge === 'left' || placement.edge === 'right';
  const small = docked && placement.edge && !expanded;
  const width = Math.min(small ? (vertical ? 32 : 96) : expanded ? Math.max(360, placement.detailWidth || 460) : 300, area.width);
  const height = Math.min(small ? (vertical ? 88 : 32) : expanded ? Math.max(320, placement.detailHeight || 580) : 62 + Math.min(count, 4) * 64, area.height);
  let x = Math.min(Math.max(placement.x ?? area.x + area.width - width - 16, area.x), area.x + area.width - width);
  let y = Math.min(Math.max(placement.y ?? area.y + area.height - height - 16, area.y), area.y + area.height - height);
  if (placement.edge === 'left') x = area.x;
  if (placement.edge === 'right') x = area.x + area.width - width;
  if (placement.edge === 'top') y = area.y;
  if (placement.edge === 'bottom') y = area.y + area.height - height;
  return {
    width, height, x, y,
  };
}

function snapPlacement(bounds, area) {
  let x = Math.min(Math.max(bounds.x, area.x), Math.max(area.x, area.x + area.width - bounds.width));
  let y = Math.min(Math.max(bounds.y, area.y), Math.max(area.y, area.y + area.height - bounds.height));
  if (Math.abs(x - area.x) <= 16) x = area.x;
  else if (Math.abs(x + bounds.width - area.x - area.width) <= 16) x = area.x + area.width - bounds.width;
  if (Math.abs(y - area.y) <= 16) y = area.y;
  else if (Math.abs(y + bounds.height - area.y - area.height) <= 16) y = area.y + area.height - bounds.height;
  return { x, y };
}

function dockEdge(bounds, area) {
  if (Math.abs(bounds.x - area.x) <= 2) return 'left';
  if (Math.abs(bounds.x + bounds.width - area.x - area.width) <= 2) return 'right';
  if (Math.abs(bounds.y - area.y) <= 2) return 'top';
  if (Math.abs(bounds.y + bounds.height - area.y - area.height) <= 2) return 'bottom';
  return null;
}

module.exports = { monitorBounds, snapPlacement, dockEdge };
