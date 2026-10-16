import { Logo } from './Logo'
import { SettingsMenu } from './SettingsMenu'
import { CreditsMenu } from './CreditsMenu'
import { useGame } from '../systems/GameState'
import { audio } from '../systems/AudioManager'

const hover = () => audio.play('ui_hover', { bus: 'ui', volume: 0.35 })

export function MainMenu({ onStart, loading }: { onStart: () => void; loading: number }) {
  const panel = useGame((s) => s.menuPanel)
  const set = useGame((s) => s.set)
  const ready = useGame((s) => s.assetsReady && s.audioReady)
  const go = (p: 'main' | 'settings' | 'credits') => {
    audio.play('ui_select', { bus: 'ui', volume: 0.5 })
    set({ menuPanel: p })
  }
  return (
    <div className="screen menu">
      {panel === 'main' && (
        <>
          <div className="menu-logo">
            <Logo />
            <p className="tagline">It only moves when you don’t look.</p>
          </div>
          <nav className="menu-items">
            <button className="menu-item" onClick={onStart} onMouseEnter={hover} disabled={!ready}>
              {ready ? 'START' : `LOADING ${Math.round(loading * 100)}%`}
            </button>
            <button className="menu-item" onClick={() => go('settings')} onMouseEnter={hover}>
              SETTINGS
            </button>
            <button className="menu-item" onClick={() => go('credits')} onMouseEnter={hover}>
              CREDITS
            </button>
          </nav>
          <p className="menu-foot">HEADPHONES RECOMMENDED · MOUSE &amp; KEYBOARD OR TOUCH</p>
        </>
      )}
      {panel === 'settings' && <SettingsMenu onBack={() => go('main')} />}
      {panel === 'credits' && <CreditsMenu onBack={() => go('main')} />}
    </div>
  )
}
