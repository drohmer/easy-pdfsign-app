// Vertical position (fraction of page width, like every element coordinate)
// of the centre of what the user is currently looking at on `page`.
// Used to drop newly added elements where they can actually be seen.
export function getVisibleY(page: number): number {
  const scrollContainer = document.querySelector('main')
  const pageEl = document.querySelector(`[data-page="${page}"]`)
  if (!scrollContainer || !pageEl) return 0.45
  const scrollRect = scrollContainer.getBoundingClientRect()
  const pageRect = pageEl.getBoundingClientRect()
  const viewportCenterY = scrollRect.top + scrollRect.height / 2
  const rawY = (viewportCenterY - pageRect.top) / pageRect.width
  const maxY = (pageRect.height / pageRect.width) * 0.9
  return Math.max(0.05, Math.min(maxY, rawY))
}
