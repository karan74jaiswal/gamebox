/**
 * Real-time audio frequency analyzer for audio-reactive 3D visuals.
 * Extracted and generalized from cdx-2089-music-player.
 */
export function createAudioAnalyser(audioContext: AudioContext, fftSize = 128) {
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = fftSize
  analyser.smoothingTimeConstant = 0.8

  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)

  return {
    analyser,
    dataArray,

    /**
     * Connects an audio source (like an AudioNode or gain node) to this analyzer.
     */
    connect(source: AudioNode) {
      source.connect(analyser)
    },

    /**
     * Updates and returns normalized audio frequency metrics [0..1]:
     * - bass: low frequency energy (kick drums, basslines)
     * - mid: mid frequency energy (vocals, snares)
     * - treble: high frequency energy (hi-hats, sparkles)
     * - overall: average total sound energy
     */
    update(): { bass: number; mid: number; treble: number; overall: number } {
      analyser.getByteFrequencyData(dataArray)

      const splitLow = Math.floor(bufferLength * 0.15)
      const splitMid = Math.floor(bufferLength * 0.5)

      let sumBass = 0
      let countBass = 0
      let sumMid = 0
      let countMid = 0
      let sumTreble = 0
      let countTreble = 0

      for (let i = 0; i < bufferLength; i++) {
        const val = dataArray[i] / 255
        if (i < splitLow) {
          sumBass += val
          countBass++
        } else if (i < splitMid) {
          sumMid += val
          countMid++
        } else {
          sumTreble += val
          countTreble++
        }
      }

      const bass = countBass ? sumBass / countBass : 0
      const mid = countMid ? sumMid / countMid : 0
      const treble = countTreble ? sumTreble / countTreble : 0
      const overall = (bass + mid + treble) / 3

      return { bass, mid, treble, overall }
    },
  }
}
