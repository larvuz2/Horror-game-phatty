// Central tuning values. Everything that affects pacing or feel lives here.

export const GAME_CONFIG = {
  player: {
    walkSpeed: 1.45, // m/s
    backwardFactor: 0.75,
    strafeFactor: 0.85,
    acceleration: 4.5, // m/s^2
    deceleration: 7.0,
    eyeHeight: 1.65,
    capsuleRadius: 0.28,
    capsuleHalfHeight: 0.56,
    mouseSensitivity: 0.0016, // radians per pixel at sensitivity 1
    lookDamping: 18, // higher = snappier
    keyTurnSpeed: 1.1, // rad/s with arrow keys
    pitchLimit: 1.25, // radians
    headBobAmount: 0.022,
    headBobFrequency: 1.75, // steps per second at full speed (x2 = cycle)
    breathAmount: 0.004,
    interactDistance: 2.4,
  },

  creature: {
    height: 2.38,
    activationDelay: 25, // s of play before the creature wakes even without the flashlight
    activationDistance: 5, // m walked from the start that wakes it
    firstMoveDelay: 2.4, // s of continuous lost visibility before the first move
    moveDelayMin: 1.3, // later moves
    moveDelayMax: 1.9,
    minMoveInterval: 1.5,
    stepMin: 1.3, // meters per reposition
    stepMax: 2.1,
    aggressionStepBonus: 0.3, // extra step length once the player holds the batteries
    progressMin: 0.7, // each move must close at least this much distance
    killDistanceUnseen: 1.3, // a move that would land this close triggers the attack
    proximityStart: 2.1, // observed: proximity event begins
    killDistanceObserved: 1.2, // observed: death when the player gets this close
    attackWarning: 0.8, // s between the critical sound and the attack when unseen
    viewMarginDeg: 7, // extra field-of-view margin counted as "observed" (conservative)
    maxDetectDistance: 30,
    nodeSpacing: 0.9,
    nodeClearance: 0.55,
  },

  interaction: {
    panelHoldTime: 1.5, // s of holding E on the breaker
    panelDecay: 0.1, // progress lost per second when released
  },

  lighting: {
    exposure: 1.0,
    flashlightAngle: 0.31, // radians (half angle ~18 deg => 35 deg beam)
    flashlightRange: 9.5,
    flashlightIntensity: 13,
    flashlightDecay: 1.4,
    flashlightColor: '#ffe9cf',
    fluorescentColor: '#c7d4d3',
    fluorescentIntensity: 42,
    practicalIntensity: 12,
    ambientIntensity: 0.2,
    victoryAmbient: 0.55,
  },

  cinematic: {
    controlLoss: 1.0,
    blackoutAt: 1.05,
    stageAt: 1.45,
    headRaiseStart: 3.0,
    headRaiseEnd: 7.0,
    eyeRevealStart: 7.0,
    redStart: 9.0,
    fadeStart: 12.0,
    titleAt: 15.0,
  },
} as const

export type QualityLevel = 'low' | 'medium' | 'high'

export const QUALITY_PRESETS: Record<
  QualityLevel,
  {
    dpr: [number, number]
    shadowMap: number
    flashlightShadow: number
    fluorescentShadow: boolean
    practicalShadow: boolean
    ao: boolean
    bloom: boolean
    dof: boolean
    msaa: number
    dust: number
    beam: boolean
  }
> = {
  low: { dpr: [0.6, 0.85], shadowMap: 512, flashlightShadow: 512, fluorescentShadow: false, practicalShadow: false, ao: false, bloom: true, dof: false, msaa: 0, dust: 300, beam: true },
  medium: { dpr: [0.75, 1.25], shadowMap: 1024, flashlightShadow: 1024, fluorescentShadow: false, practicalShadow: true, ao: false, bloom: true, dof: true, msaa: 0, dust: 700, beam: true },
  high: { dpr: [1, 1.75], shadowMap: 1024, flashlightShadow: 1024, fluorescentShadow: true, practicalShadow: true, ao: true, bloom: true, dof: true, msaa: 4, dust: 1200, beam: true },
}
