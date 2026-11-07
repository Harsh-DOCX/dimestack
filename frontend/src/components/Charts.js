const COLORS = ['#14b8a6', '#0e0e0e', '#7dd3c7', '#525252', '#b7efe8', '#1f2933', '#0f766e', '#a3a3a3'];

function extent(points, keys) {
  let min = 0;
  let max = 1;
  points.forEach((point) => {
    keys.forEach((key) => {
      const value = Number(point[key]) || 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
  });
  if (min === max) max = min + 1;
  return { min, max };
}

export function TrendChart({ points, currencyLabel, labels = ['Income', 'Expenses', 'Balance'] }) {
  const data = points || [];
  const hasValue = data.some((point) => point.income || point.expense || point.balance);
  if (!hasValue) return <p className="empty">Nothing to chart for this date range.</p>;
  const width = 640;
  const height = 260;
  const pad = { l: 36, r: 12, t: 16, b: 28 };
  const { min, max } = extent(data, ['income', 'expense', 'balance']);
  const xFor = (index) => pad.l + (data.length === 1 ? (width - pad.l - pad.r) / 2 : (index / (data.length - 1)) * (width - pad.l - pad.r));
  const yFor = (value) => pad.t + ((max - value) / (max - min)) * (height - pad.t - pad.b);
  const pathFor = (key) => data.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(1)} ${yFor(point[key]).toFixed(1)}`).join(' ');
  const step = Math.ceil(data.length / 6);
  return (
    <figure className="chart" role="img" aria-label={`Balance, income, and expenses over time in ${currencyLabel}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
        {[0, 0.5, 1].map((tick) => {
          const y = yFor(min + (max - min) * tick);
          return <line key={tick} x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="chart-grid" />;
        })}
        <path d={pathFor('income')} className="line income" />
        <path d={pathFor('expense')} className="line expense" />
        <path d={pathFor('balance')} className="line balance" />
        {data.map((point, index) => (index % step === 0 ? (
          <text key={point.label + index} x={xFor(index)} y={height - 8} textAnchor="middle" className="tick">{point.label}</text>
        ) : null))}
      </svg>
      <figcaption className="legend">
        <span><i className="swatch income" /> {labels[0]}</span>
        <span><i className="swatch expense" /> {labels[1]}</span>
        <span><i className="swatch balance" /> {labels[2]}</span>
      </figcaption>
    </figure>
  );
}

function pieSlice(cx, cy, radius, start, end) {
  const large = end - start > Math.PI ? 1 : 0;
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
}

export function SplitPie({ slices, currencyLabel }) {
  const data = (slices || []).filter((slice) => Number(slice.amount) > 0);
  if (!data.length) return <p className="empty">No amounts to distribute in this range.</p>;
  const total = data.reduce((sum, slice) => sum + Number(slice.amount), 0);
  let angle = -Math.PI / 2;
  const pieces = data.map((slice, index) => {
    const portion = Number(slice.amount) / total;
    const next = angle + portion * Math.PI * 2;
    const piece = { ...slice, portion, color: COLORS[index % COLORS.length], full: portion >= 0.999, path: pieSlice(110, 110, 86, angle, next) };
    angle = next;
    return piece;
  });
  return (
    <figure className="chart pie-wrap" role="img" aria-label={`Distribution of amounts in ${currencyLabel}`}>
      <svg viewBox="0 0 220 220" className="pie">
        {pieces.map((piece) => (
          piece.full
            ? <circle key={piece.label} cx="110" cy="110" r="86" fill={piece.color} />
            : <path key={piece.label} d={piece.path} fill={piece.color} />
        ))}
      </svg>
      <ul className="legend-list">
        {pieces.map((piece) => (
          <li key={piece.label}>
            <i className="swatch" style={{ background: piece.color }} />
            <span>{piece.label}</span>
            <strong>{Math.round(piece.portion * 100)}%</strong>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function CompareBars({ rows }) {
  if (!rows?.length) return <p className="empty">No months to compare yet.</p>;
  const max = Math.max(1, ...rows.flatMap((row) => [row.income, row.expense, Math.abs(row.savings)]));
  return (
    <div className="bars" role="img" aria-label="Monthly income, expenses, and savings">
      {rows.map((row) => (
        <div className="bar-col" key={row.month}>
          <div className="bar-stack">
            <div className="bar income" style={{ height: `${(row.income / max) * 100}%` }} title={`Income ${row.income}`} />
            <div className="bar expense" style={{ height: `${(row.expense / max) * 100}%` }} title={`Expenses ${row.expense}`} />
            <div className="bar savings" style={{ height: `${(Math.abs(row.savings) / max) * 100}%` }} title={`Savings ${row.savings}`} />
          </div>
          <span>{row.month.slice(2)}</span>
        </div>
      ))}
    </div>
  );
}

export function NetLine({ points }) {
  return (
    <TrendChart
      points={(points || []).map((point) => ({ label: point.label, income: point.assets, expense: point.liabilities, balance: point.net }))}
      currencyLabel="net worth"
      labels={['Assets', 'Liabilities', 'Net worth']}
    />
  );
}
