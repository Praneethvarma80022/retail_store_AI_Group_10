export default function TrendBars({
  items,
  labelKey,
  valueKey,
  valueFormatter,
  helper,
}) {
  const maxValue = Math.max(...items.map((item) => item[valueKey] || 0), 1);

  return (
    <div className="trend-bars">
      {items.map((item) => {
        const value = item[valueKey] || 0;
        const width = `${Math.max((value / maxValue) * 100, 8)}%`;

        return (
          <div key={`${item[labelKey]}-${value}`} className="trend-row">
            <div className="trend-row-top">
              <span>{item[labelKey]}</span>
              <strong>{valueFormatter(value)}</strong>
            </div>
            <div className="trend-track">
              <span className="trend-fill" style={{ width }} />
            </div>
            {helper ? <small>{helper(item)}</small> : null}
          </div>
        );
      })}
    </div>
  );
}
