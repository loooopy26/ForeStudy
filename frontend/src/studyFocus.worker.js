import { loadLiteRt, loadAndCompile, Tensor } from '@litertjs/core'

const size = 128
const faceThreshold = Math.log(0.65 / 0.35)
const fineAnchorCount = 16 * 16 * 2
let model
let inputName

function detectFace(scores, boxes) {
  let best = -1
  let score = faceThreshold
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > score) {
      score = scores[i]
      best = i
    }
  }
  if (best < 0) return null

  // Short-range BlazeFace has two anchors per 8px cell, then six per 16px cell.
  const fine = best < fineAnchorCount
  const stride = fine ? 8 : 16
  const cells = size / stride
  const cell = fine ? Math.floor(best / 2) : Math.floor((best - fineAnchorCount) / 6)
  const anchorX = (cell % cells + 0.5) / cells
  const anchorY = (Math.floor(cell / cells) + 0.5) / cells

  const i = best * 16
  const point = offset => ({
    x: anchorX + boxes[i + offset] / size,
    y: anchorY + boxes[i + offset + 1] / size,
  })
  const center = point(0)
  const width = boxes[i + 2] / size
  const height = boxes[i + 3] / size
  if (!(width > 0 && height > 0)) return null
  const eyes = [point(4), point(6)]
  const nose = point(8)
  return { box: { x: center.x - width / 2, y: center.y - height / 2, width, height }, eyes, nose }
}

function measureDirection(detection) {
  if (!detection) return null
  const { eyes: [firstEye, secondEye], nose } = detection
  // Project the nose offset onto the eye line to account for sideways tilt.
  const dx = secondEye.x - firstEye.x
  const dy = secondEye.y - firstEye.y
  const eyeDistanceSquared = dx * dx + dy * dy
  if (eyeDistanceSquared < 16 / (size * size)) return null
  const nx = nose.x - (firstEye.x + secondEye.x) / 2
  const ny = nose.y - (firstEye.y + secondEye.y) / 2
  return (nx * dx + ny * dy) / eyeDistanceSquared
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      await loadLiteRt(new URL('./', self.location.href).href)
      model = await loadAndCompile(new URL('../models/blazeface-short-range.tflite', self.location.href).href,
        { accelerator: 'wasm' })
      inputName = model.getInputDetails()[0].name
      self.postMessage({ type: 'ready' })
      return
    }
    const rgba = new Uint8ClampedArray(data.pixels)
    const rgb = new Float32Array(size * size * 3)
    for (let i = 0, j = 0; i < rgba.length; i += 4) {
      rgb[j++] = rgba[i] / 127.5 - 1
      rgb[j++] = rgba[i + 1] / 127.5 - 1
      rgb[j++] = rgba[i + 2] / 127.5 - 1
    }
    const input = new Tensor(rgb, [1, size, size, 3])
    let output
    try {
      output = await model.run({ [inputName]: input })
      const arrays = Object.values(output).map(tensor => tensor.toTypedArray())
      const scores = arrays.find(array => array.length === 896)
      const boxes = arrays.find(array => array.length === 896 * 16)
      if (!scores || !boxes) throw new Error('Unexpected BlazeFace output')
      const detection = detectFace(scores, boxes)
      self.postMessage({ type: 'result', detection, direction: measureDirection(detection) })
    } finally {
      input.delete()
      if (output) Object.values(output).forEach(tensor => tensor.delete())
    }
  } catch (error) {
    console.error('BlazeFace inference:', error.message)
    self.postMessage({ type: 'error' })
  }
}
