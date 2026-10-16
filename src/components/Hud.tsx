import { useEffect } from 'react'
import { useGame, type Message } from '../systems/GameState'

function MessageView({ m }: { m: Message }) {
  const drop = useGame((s) => s.dropMessage)
  useEffect(() => {
    const t = window.setTimeout(() => drop(m.id), m.duration * 1000 + 1200)
    return () => window.clearTimeout(t)
  }, [m, drop])
  return (
    <div className={`msg msg-${m.kind}`} style={{ animationDuration: `${m.duration + 1.2}s` }}>
      {m.text}
    </div>
  )
}

// No permanent HUD: only contextual prompts and short messages.
export function Hud({ locked }: { locked: boolean }) {
  const prompt = useGame((s) => s.prompt)
  const progress = useGame((s) => s.promptProgress)
  const messages = useGame((s) => s.messages)
  const phase = useGame((s) => s.phase)
  return (
    <div className="hud">
      <div className="hud-messages">
        {messages.map((m) => (
          <MessageView key={m.id} m={m} />
        ))}
      </div>
      {prompt && (
        <div className="prompt">
          <span>{prompt}</span>
          {progress > 0 && (
            <span className="prompt-bar">
              <span style={{ transform: `scaleX(${progress})` }} />
            </span>
          )}
        </div>
      )}
      {!locked && phase === 'PLAYING' && <div className="click-hint">CLICK TO LOOK AROUND · ESC TO PAUSE</div>}
    </div>
  )
}
