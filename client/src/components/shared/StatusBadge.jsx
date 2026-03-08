export function getExpiryInfo(earliestExpiry) {
  if (!earliestExpiry) return null;
  const [y, m, d] = earliestExpiry.split('-').map(Number);
  const expiry = new Date(y, m - 1, d); // parse as local midnight, not UTC
  const daysLeft = Math.floor((expiry - new Date()) / 86400000);
  if (daysLeft < 0)   return { label: 'Expired',          color: 'red' };
  if (daysLeft === 0) return { label: 'Exp Today',         color: 'red' };
  if (daysLeft <= 14) return { label: `Exp ${daysLeft}d`,  color: 'amber' };
  if (daysLeft <= 60) return { label: `${daysLeft}d left`, color: 'green' };
  return { label: `${Math.round(daysLeft / 30)}mo left`,   color: 'green' };
}

const colorMap = {
  red:   'bg-red-500/10 text-red-400 border-red-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  green: 'bg-green-500/10 text-green-400 border-green-500/20',
};

export default function StatusBadge({ earliestExpiry, totalPortions }) {
  if (!earliestExpiry) return null;
  const info = getExpiryInfo(earliestExpiry);
  if (!info) return null;
  // Show badge even at 0 portions when expired — prompts the user to clear out
  if (totalPortions === 0 && info.color !== 'red') return null;
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${colorMap[info.color]}`}>
      {info.label}
    </span>
  );
}
