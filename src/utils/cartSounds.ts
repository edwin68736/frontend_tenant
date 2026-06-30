import beepSrc from '@/assets/sound/beep-29.mp3'
import removeSrc from '@/assets/sound/button-21.mp3'

let addAudio: HTMLAudioElement | null = null
let removeAudio: HTMLAudioElement | null = null

function playClip(getAudio: () => HTMLAudioElement) {
  try {
    const audio = getAudio()
    audio.currentTime = 0
    void audio.play().catch(() => {
      /* autoplay policy o sin altavoz */
    })
  } catch {
    /* ignore */
  }
}

/** Sonido al agregar producto al carrito POS. */
export function playCartAddSound() {
  playClip(() => {
    if (!addAudio) {
      addAudio = new Audio(beepSrc)
      addAudio.volume = 0.55
    }
    return addAudio
  })
}

/** Sonido al quitar producto del carrito POS. */
export function playCartRemoveSound() {
  playClip(() => {
    if (!removeAudio) {
      removeAudio = new Audio(removeSrc)
      removeAudio.volume = 0.55
    }
    return removeAudio
  })
}
