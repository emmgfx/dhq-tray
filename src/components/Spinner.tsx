const SPOKE_COUNT = 8;

/** macOS-style spinning activity indicator. */
export function Spinner() {
  return (
    <span className="spinner" role="progressbar" aria-label="Loading">
      {Array.from({ length: SPOKE_COUNT }, (_, index) => (
        <span
          key={index}
          style={{
            transform: `rotate(${(360 / SPOKE_COUNT) * index}deg)`,
            animationDelay: `${((index - SPOKE_COUNT) / SPOKE_COUNT) * 0.8}s`,
          }}
        />
      ))}
    </span>
  );
}
