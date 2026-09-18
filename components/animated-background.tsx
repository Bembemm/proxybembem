export function AnimatedBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 bg-slate-50"
      aria-hidden="true"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 70% 45% at 12% 12%, rgba(196,181,253,0.22), transparent 68%), radial-gradient(ellipse 60% 42% at 88% 36%, rgba(192,132,252,0.16), transparent 70%), radial-gradient(ellipse 72% 45% at 35% 86%, rgba(221,214,254,0.20), transparent 72%)",
      }}
    />
  )
}
