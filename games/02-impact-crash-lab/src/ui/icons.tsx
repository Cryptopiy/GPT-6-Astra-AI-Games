export function Icon({ name, size = 18 }: { name: 'play' | 'reset' | 'pause' | 'arrow' | 'focus' | 'home' | 'cube' | 'chart' | 'info'; size?: number }) {
  const paths = { play: 'm8 5 11 7-11 7Z', reset: 'M3 11a9 9 0 1 1 2.5 7M3 4v7h7', pause: 'M8 5v14M16 5v14', arrow: 'M5 12h14m-6-6 6 6-6 6', focus: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M9 12h6m-3-3v6', home: 'm3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7', cube: 'm12 3 9 5v9l-9 5-9-5V8Zm0 10 9-5M12 13 3 8m9 5v9', chart: 'M4 4v16h17M7 15l4-5 4 3 5-7', info: 'M12 11v6m0-10v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
