import { RoomDemo } from './RoomDemo';

const RACKS = Array.from({ length: 8 }, (_, i) => i);
const RACK_STEP = { x: 27.9, y: 16.1 };
const RACK_STAGGER_S = 0.08;
const RACK_FIRST_DELAY_S = 0.15;
const LAST_RACK = RACKS.length - 1;

/** The art is drawn in its own fixed palette on the dark room; these literals are the design's, not app tokens. */
const RACK_FACES = {
  lit: { side: '#1a2531', front: '#24313f', top: '#3b4a5c', rail: '#7a8794' },
  /** The eighth rack is a customer's: a step dimmer. */
  dim: { side: '#18212c', front: '#1f2a37', top: '#2b394a', rail: '#56626f' },
};

function Rack({ index }: { index: number }) {
  const face = index === LAST_RACK ? RACK_FACES.dim : RACK_FACES.lit;
  return (
    // The drop-in animation owns the inner group's transform, so the placement sits on its own wrapper.
    <g transform={`translate(${(RACK_STEP.x * index).toFixed(1)} ${(RACK_STEP.y * index).toFixed(1)})`}>
      <g className="rk" style={{ animationDelay: `${(RACK_FIRST_DELAY_S + RACK_STAGGER_S * index).toFixed(2)}s` }}>
        <polygon points="377.8,106.0 338.0,129.0 338.0,37.0 377.8,14.0" fill={face.side} />
        <polygon points="314.1,115.2 338.0,129.0 338.0,37.0 314.1,23.2" fill={face.front} />
        <polygon points="353.9,0.2 377.8,14.0 338.0,37.0 314.1,23.2" fill={face.top} />
        <path d="M317.7 101.9L334.4 111.6M317.7 86.6L334.4 96.3M317.7 71.3L334.4 80.9M317.7 55.9L334.4 65.6M317.7 40.6L334.4 50.3" stroke={face.rail} strokeWidth="1" opacity=".55" />
      </g>
    </g>
  );
}

export function RoomIllustration({ label, captions }: { label: string; captions: readonly string[] }) {
  return (
    <svg className="float signin-brand__room" viewBox="40 -10 650 420" preserveAspectRatio="xMidYMax meet" role="img" aria-label={label}>
      <polygon points="330.0,60.0 648.7,244.0 389.8,393.5 71.1,209.5" fill="#142233" stroke="#2e4258" strokeWidth="1.5" />
      <path d="M369.8 83.0L110.9 232.5M409.7 106.0L150.7 255.5M449.5 129.0L190.6 278.5M489.3 152.0L230.4 301.5M529.2 175.0L270.2 324.5M569.0 198.0L310.1 347.5M608.9 221.0L349.9 370.5M290.2 83.0L608.9 267.0M250.3 106.0L569.0 290.0M210.5 129.0L529.2 313.0M170.7 152.0L489.3 336.0M130.8 175.0L449.5 359.0M91.0 198.0L409.7 382.0" stroke="#1c2d40" strokeWidth="1" fill="none" />
      <polygon points="330.0,60.0 648.7,244.0 648.7,193.4 330.0,9.4" fill="rgba(127,162,232,0.10)" stroke="rgba(127,162,232,0.35)" strokeWidth="1" />
      <polygon points="330.0,60.0 71.1,209.5 71.1,158.9 330.0,9.4" fill="rgba(127,162,232,0.10)" stroke="rgba(127,162,232,0.35)" strokeWidth="1" />
      <g className="zone">
        {RACKS.map((i) => (
          <polygon key={i} transform={`translate(${(RACK_STEP.x * i).toFixed(1)} ${(RACK_STEP.y * i).toFixed(1)})`} points="314.1,115.2 338.0,129.0 298.1,152.0 274.2,138.2" fill="rgba(127,162,232,0.14)" />
        ))}
        <path className="ants" d="M274.2 138.2L493.3 264.7" stroke="#7fa2e8" strokeWidth="1.25" strokeDasharray="4 3" />
      </g>
      <path d="M71.1 158.9L330.0 9.4L648.7 193.4" stroke="#7fa2e8" strokeWidth="2" fill="none" strokeLinejoin="round" />
      <path className="sweep" d="M71.1 158.9L330.0 9.4L648.7 193.4" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      {RACKS.map((i) => (
        <Rack key={i} index={i} />
      ))}
      <RoomDemo captions={captions} />
    </svg>
  );
}
