import { audio } from '../systems/AudioManager'

const CREDITS: [string, string][] = [
  ['DESIGN, CODE & DIRECTION', 'Claude · Anthropic'],
  ['3D PROPS', 'Tripo P2 (AI generated, cleaned with glTF-Transform)'],
  ['CREATURE', 'Meshy 7.1 · auto-rigged, posed procedurally'],
  ['MUSIC', 'ElevenLabs Music v2.5'],
  ['SOUND DESIGN', 'ElevenLabs Sound Effects v2'],
  ['SURFACES', 'FLUX 3 · tileable PBR maps'],
  ['GENERATION PLATFORM', 'fal.ai'],
  ['ENGINE', 'Three.js · React Three Fiber · Rapier physics · Web Audio HRTF'],
]

export function CreditsMenu({ onBack }: { onBack: () => void }) {
  return (
    <div className="panel credits">
      <h2 className="panel-title">CREDITS</h2>
      <dl>
        {CREDITS.map(([k, v]) => (
          <div key={k} className="credit">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="credits-note">Play with headphones, in the dark.</p>
      <button className="menu-item back" onClick={onBack} onMouseEnter={() => audio.play('ui_hover', { bus: 'ui', volume: 0.35 })}>
        BACK
      </button>
    </div>
  )
}
