export default function LoadingState({ title = "Loading workspace..." }) {
  return (
    <div className="loading-state card-surface">
      <div className="loading-orb" />
      <div>
        <h3>{title}</h3>
        <p>Pulling the latest retail data and preparing the dashboard.</p>
      </div>
    </div>
  );
}
