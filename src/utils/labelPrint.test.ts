import { describe, expect, it } from 'vitest'
import { afterLabelBytes, labelRowWidthMm, planLabelRows, printableWidthMm, rgbaToEscPosRaster } from './labelPrint'

describe('labelPrint', () => {
  it('convierte píxeles a GS v 0 centrado y en franjas', () => {
    // 8x2: primer píxel negro de la fila 0, resto blanco.
    const w = 8
    const h = 2
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255)
    rgba[0] = rgba[1] = rgba[2] = 0
    const out = rgbaToEscPosRaster(rgba, w, h, 16)
    // cabecera GS v 0, m=0, xL=2 (16 puntos), yL=2
    expect(Array.from(out.slice(0, 8))).toEqual([0x1d, 0x76, 0x30, 0, 2, 0, 2, 0])
    // centrado: 4 puntos de margen izquierdo → el negro cae en el bit 3 del primer byte (0b00001000)
    expect(out[8]).toBe(0b00001000)
    expect(out.length).toBe(8 + 2 * 2)
  })

  it('parte imágenes altas en franjas de 128 filas', () => {
    const rgba = new Uint8ClampedArray(8 * 300 * 4).fill(255)
    const out = rgbaToEscPosRaster(rgba, 8, 300, 8)
    // 3 franjas: 128 + 128 + 44 filas, cada una con cabecera de 8 bytes
    expect(out.length).toBe(3 * 8 + 300)
  })

  it('rechaza imágenes más anchas que el rollo', () => {
    expect(() => rgbaToEscPosRaster(new Uint8ClampedArray(32 * 4 * 4), 32, 4, 16)).toThrow()
  })

  it('reparte etiquetas en filas por columnas', () => {
    const a = { name: 'A', price: 1, code: '1' }
    const b = { name: 'B', price: 2, code: '2' }
    const rows = planLabelRows({ columns: 3, lines: [{ item: a, quantity: 2 }, { item: b, quantity: 3 }] })
    expect(rows.map((r) => r.map((i) => i.name).join(''))).toEqual(['AAB', 'BB'])
  })

  it('calcula anchos y comandos de fin', () => {
    expect(labelRowWidthMm({ width: 30, columns: 2, gap: 2 })).toBe(62)
    expect(printableWidthMm(58)).toBe(48)
    expect(printableWidthMm(80)).toBe(72)
    expect(afterLabelBytes('cut')).toEqual([0x1d, 0x56, 0x41, 0x10])
    expect(afterLabelBytes('none')).toEqual([])
  })
})

describe('TSPL', () => {
  it('arma SIZE/GAP/BITMAP con 1 = blanco y 0 = tinta', async () => {
    const { tsplLabelCommand } = await import('./labelPrint')
    const rgba = new Uint8ClampedArray(8 * 2 * 4).fill(255)
    rgba[0] = rgba[1] = rgba[2] = 0 // primer píxel negro
    const out = tsplLabelCommand(rgba, 8, 2, 1, 0.25, 2)
    const txt = new TextDecoder('latin1').decode(out)
    expect(txt.startsWith('SIZE 1 mm,0.3 mm\r\nGAP 2 mm,0 mm\r\nDIRECTION 0\r\nCLS\r\nBITMAP 0,0,1,2,0,')).toBe(true)
    const head = 'SIZE 1 mm,0.3 mm\r\nGAP 2 mm,0 mm\r\nDIRECTION 0\r\nCLS\r\nBITMAP 0,0,1,2,0,'.length
    expect(out[head]).toBe(0x7f)
    expect(out[head + 1]).toBe(0xff)
    expect(txt.endsWith('\r\nPRINT 1,1\r\n')).toBe(true)
  })
})
