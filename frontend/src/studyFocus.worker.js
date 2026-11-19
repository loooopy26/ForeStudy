import { loadLiteRt, loadAndCompile, Tensor } from '@litertjs/core'

const size = 128
const faceThreshold = Math.log(0.65 / 0.35)
let model
let inputName

function measureDirection(scores, boxes) {
  let best = -1
  let score = faceThreshold
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > score) {
      score = scores[i]
      best = i
    }
  }
  if (best < 0) return null

  // BlazeFace encodes eyes and nose relative to the same anchor and scale.
  // Their differences cancel the anchor offsets. Project onto the eye line
  // so tilting the head sideways does not itself count as turning away.
  const i = best * 16
  const dx = boxes[i + 6] - boxes[i + 4]
  const dy = boxes[i + 7] - boxes[i + 5]
  const eyeDistanceSquared = dx * dx + dy * dy
  if (eyeDistanceSquared < 16) return null
  const nx = boxes[i + 8] - (boxes[i + 4] + boxes[i + 6]) / 2
  const ny = boxes[i + 9] - (boxes[i + 5] + boxes[i + 7]) / 2
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
      self.postMessage({ type: 'result', direction: measureDirection(scores, boxes) })
    } finally {
      input.delete()
      if (output) Object.values(output).forEach(tensor => tensor.delete())
    }
  } catch (error) {
    console.error('BlazeFace inference:', error.message)
    self.postMessage({ type: 'error' })
  }
}
