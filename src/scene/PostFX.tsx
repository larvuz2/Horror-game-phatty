import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, Noise, Vignette, ToneMapping, ChromaticAberration, DepthOfField, BrightnessContrast, N8AO } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode, type BloomEffect, type ChromaticAberrationEffect, type DepthOfFieldEffect, type VignetteEffect, type NoiseEffect, type BrightnessContrastEffect } from 'postprocessing'
import * as THREE from 'three'
import { QUALITY_PRESETS } from '../config/gameConfig'
import { useSettings } from '../systems/SettingsManager'
import { runtime } from '../systems/runtime'

// Cinematic grade: AO (high), bloom, DoF (cinematics), ACES tone curve, grain, vignette, subtle aberration.
export function PostFX() {
  const quality = useSettings((s) => s.quality)
  const q = QUALITY_PRESETS[quality]
  const bloom = useRef<BloomEffect>(null)
  const vignette = useRef<VignetteEffect>(null)
  const ca = useRef<ChromaticAberrationEffect>(null)
  const dof = useRef<DepthOfFieldEffect>(null)
  const noise = useRef<NoiseEffect>(null)
  const bc = useRef<BrightnessContrastEffect>(null)
  const caOffset = useRef(new THREE.Vector2(0.0004, 0.0003))

  useFrame(() => {
    const fx = runtime.fx
    const s = useSettings.getState()
    if (bloom.current) bloom.current.intensity = 0.55 + fx.bloomBoost
    if (vignette.current) vignette.current.darkness = Math.min(0.95, 0.62 + fx.vignetteBoost * 0.4)
    if (ca.current) {
      const a = 0.00035 + fx.aberration * 0.0022
      caOffset.current.set(a, a * 0.7)
      ca.current.offset = caOffset.current
    }
    if (noise.current) noise.current.blendMode.opacity.value = 0.05 + s.filmGrain * 0.28
    if (bc.current) bc.current.brightness = s.brightness * 0.12
    if (dof.current) {
      const amt = fx.dofAmount
      dof.current.bokehScale = amt * 3.2
      const coc = dof.current.cocMaterial
      if (fx.dofFocus > 0) {
        coc.focusDistance = fx.dofFocus
        coc.focusRange = 0.6
      }
    }
  })

  return (
    <EffectComposer multisampling={q.msaa} enableNormalPass={false}>
      <>{q.ao ? <N8AO aoRadius={0.9} intensity={2.2} distanceFalloff={0.8} quality="medium" halfRes /> : null}</>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.55} radius={0.62} />
      <>{q.dof ? <DepthOfField ref={dof} worldFocusDistance={2} worldFocusRange={0.6} bokehScale={0} /> : null}</>
      <ChromaticAberration ref={ca} offset={caOffset.current} radialModulation modulationOffset={0.35} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <BrightnessContrast ref={bc} brightness={0} contrast={0.04} />
      <Vignette ref={vignette} offset={0.28} darkness={0.62} eskil={false} />
      <Noise ref={noise} premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.2} />
    </EffectComposer>
  )
}
