export function Issuer({ family }: { family: string }) {
  return <span className={`issuer ${family}`}><i />{family}</span>;
}

export function Issuers({ families }: { families: string[] }) {
  return <span className="issuers">{[...new Set(families)].map((f) => <Issuer key={f} family={f} />)}</span>;
}

export function Trust({ value }: { value: number }) {
  return (
    <span className="trust" title="Trust: liquidity × freshness × metadata agreement, 0–1">
      <span className="bar"><i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} /></span>
      <span className="num">{value.toFixed(2)}</span>
    </span>
  );
}
