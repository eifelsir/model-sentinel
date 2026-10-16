function monitorBounds(area, placement, count, expanded) {
  const width = Math.min(expanded ? Math.max(360, placement.detailWidth || 460) : 300, area.width);
  const height = Math.min(expanded ? Math.max(320, placement.detailHeight || 580) : 62 + Math.min(count, 4) * 64, area.height);
  return {
    width, height,
    x: Math.min(Math.max(placement.x ?? area.x + area.width - width - 16, area.x), area.x + area.width - width),
    y: Math.min(Math.max(placement.y ?? area.y + area.height - height - 16, area.y), area.y + area.height - height),
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

module.exports = { monitorBounds, snapPlacement };
