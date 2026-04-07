export default function SectionCard({
  title,
  eyebrow,
  actions,
  className = "",
  children,
}) {
  return (
    <section className={`card-surface section-card ${className}`.trim()}>
      <header className="section-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h3 className="section-title">{title}</h3>
        </div>
        {actions ? <div className="section-actions">{actions}</div> : null}
      </header>

      <div className="section-content">{children}</div>
    </section>
  );
}
