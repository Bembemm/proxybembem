"use client"

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Light base */}
      <div className="absolute inset-0 bg-slate-50" />
      
      {/* Pastel smoke/fog wisps - soft purple and lilac */}
      <div className="absolute inset-0">
        {/* Soft lilac smoke wisp 1 - LARGE */}
        <div 
          className="absolute w-[100vw] h-[50vh] opacity-40 animate-smoke-drift-1"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(196, 181, 253, 0.6) 0%, rgba(167, 139, 250, 0.3) 30%, rgba(139, 92, 246, 0.15) 50%, transparent 70%)',
            left: '-30%',
            top: '5%',
            filter: 'blur(80px)',
          }}
        />
        
        {/* Soft purple smoke wisp 1 */}
        <div 
          className="absolute w-[80vw] h-[45vh] opacity-35 animate-smoke-drift-2"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(192, 132, 252, 0.5) 0%, rgba(168, 85, 247, 0.3) 35%, rgba(139, 92, 246, 0.15) 55%, transparent 70%)',
            right: '-20%',
            top: '25%',
            filter: 'blur(70px)',
          }}
        />
        
        {/* Soft lilac smoke wisp 2 */}
        <div 
          className="absolute w-[90vw] h-[40vh] opacity-30 animate-smoke-drift-3"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(221, 214, 254, 0.55) 0%, rgba(196, 181, 253, 0.3) 35%, rgba(167, 139, 250, 0.15) 55%, transparent 70%)',
            left: '5%',
            top: '45%',
            filter: 'blur(75px)',
          }}
        />
        
        {/* Soft purple smoke wisp 2 */}
        <div 
          className="absolute w-[70vw] h-[35vh] opacity-30 animate-smoke-drift-4"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(216, 180, 254, 0.5) 0%, rgba(192, 132, 252, 0.25) 40%, rgba(168, 85, 247, 0.1) 60%, transparent 75%)',
            left: '-15%',
            top: '65%',
            filter: 'blur(65px)',
          }}
        />
        
        {/* Soft blend wisp */}
        <div 
          className="absolute w-[100vw] h-[35vh] opacity-25 animate-smoke-drift-5"
          style={{
            background: 'linear-gradient(90deg, rgba(196, 181, 253, 0.4) 0%, rgba(192, 132, 252, 0.35) 50%, rgba(221, 214, 254, 0.3) 100%)',
            right: '-30%',
            top: '80%',
            filter: 'blur(85px)',
          }}
        />
        
        {/* Bright purple accent top */}
        <div 
          className="absolute w-[60vw] h-[30vh] opacity-25 animate-smoke-drift-6"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(192, 132, 252, 0.45) 0%, rgba(168, 85, 247, 0.2) 40%, transparent 65%)',
            left: '40%',
            top: '15%',
            filter: 'blur(60px)',
          }}
        />
        
        {/* Extra lilac glow center */}
        <div 
          className="absolute w-[50vw] h-[40vh] opacity-20 animate-smoke-drift-1"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(221, 214, 254, 0.4) 0%, rgba(196, 181, 253, 0.2) 45%, transparent 70%)',
            left: '25%',
            top: '30%',
            filter: 'blur(90px)',
          }}
        />
      </div>
      
      {/* Very subtle vignette for depth */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 30%, rgba(148, 163, 184, 0.15) 100%)',
        }}
      />
    </div>
  )
}
