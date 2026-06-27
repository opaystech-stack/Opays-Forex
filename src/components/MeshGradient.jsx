import { useRef, useEffect } from 'react';

export default function MeshGradient() {
  const canvasRef = useRef(null);
  const blobsRef = useRef([]);
  const rafRef = useRef(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    resize();

    const w = container.offsetWidth;
    const h = container.offsetHeight;

    // Initialize blobs
    blobsRef.current = [
      { x: w * 0.3, y: h * 0.4, vx: 0.18, vy: 0.12, radius: 320, color: 'rgba(79, 70, 229, 0.22)' },
      { x: w * 0.7, y: h * 0.6, vx: -0.15, vy: 0.2, radius: 280, color: 'rgba(6, 182, 212, 0.16)' },
      { x: w * 0.5, y: h * 0.3, vx: 0.1, vy: -0.14, radius: 250, color: 'rgba(120, 50, 200, 0.12)' },
      { x: w * 0.2, y: h * 0.7, vx: -0.12, vy: -0.1, radius: 300, color: 'rgba(79, 70, 229, 0.14)' },
    ];

    function loop() {
      const cw = container.offsetWidth;
      const ch = container.offsetHeight;
      ctx.clearRect(0, 0, cw, ch);

      // Background
      ctx.fillStyle = '#080E1A';
      ctx.fillRect(0, 0, cw, ch);

      for (const blob of blobsRef.current) {
        blob.x += blob.vx;
        blob.y += blob.vy;

        if (blob.x < -blob.radius) blob.x = cw + blob.radius;
        if (blob.x > cw + blob.radius) blob.x = -blob.radius;
        if (blob.y < -blob.radius) blob.y = ch + blob.radius;
        if (blob.y > ch + blob.radius) blob.y = -blob.radius;

        ctx.globalCompositeOperation = 'screen';
        const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.radius);
        gradient.addColorStop(0, blob.color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, cw, ch);
      }

      ctx.globalCompositeOperation = 'source-over';
      rafRef.current = requestAnimationFrame(loop);
    }

    // Use IntersectionObserver to pause when not visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            rafRef.current = requestAnimationFrame(loop);
          } else {
            cancelAnimationFrame(rafRef.current);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(container);

    const handleResize = () => {
      resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
