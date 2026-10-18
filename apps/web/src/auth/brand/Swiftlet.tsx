/** The swiftlet mid-flap: it replaces the label's icon while a sign-in is in flight. Motion lives in auth.css. */
export function Swiftlet() {
  return (
    <svg className="swiftlet bob" width="24" height="24" viewBox="0 0 64 64" aria-hidden="true">
      <g className="flap">
        <path d="M32 8C30.4 8 29 9.6 28.8 12.2L28.4 18.4C20.5 13.2 10.5 14.5 2.5 27.5C10.2 22.8 20 23.6 28.2 28.8C28.1 32 28.4 35.2 29 37.6L22.5 56.5L32 45.5Z" fill="#ffffff" />
        <path className="swiftlet__right" d="M32 8C33.6 8 35 9.6 35.2 12.2L35.6 18.4C43.5 13.2 53.5 14.5 61.5 27.5C53.8 22.8 44 23.6 35.8 28.8C35.9 32 35.6 35.2 35 37.6L41.5 56.5L32 45.5Z" />
      </g>
    </svg>
  );
}
