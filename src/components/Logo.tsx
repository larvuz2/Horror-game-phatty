// Custom wordmark. The second O of LOOK drifts out of line — it is the one letter looking away.
export function Logo({ size = 'large' }: { size?: 'large' | 'small' }) {
  return (
    <h1 className={`logo logo-${size}`} aria-label="Don't Look Away">
      <span className="logo-word">
        <span>D</span>
        <span>O</span>
        <span>N</span>
        <span className="logo-apos">’</span>
        <span>T</span>
      </span>
      <span className="logo-word">
        <span>L</span>
        <span>O</span>
        <span className="logo-away">O</span>
        <span>K</span>
      </span>
      <span className="logo-word">
        <span>A</span>
        <span>W</span>
        <span>A</span>
        <span>Y</span>
      </span>
    </h1>
  )
}
