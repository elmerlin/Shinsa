import { GAME_TYPES } from '../lib/constants.js';

export default function ChartSelector({
  charts,
  activeIndex,
  onSelect,
  onAdd,
  onDelete,
}) {
  if (!charts || charts.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-4 py-1.5 bg-piu-dark border-b border-piu-border shrink-0 overflow-x-auto">
      <span className="text-xs text-gray-500 mr-1">Charts:</span>

      {charts.map((chart, i) => {
        const gameType = GAME_TYPES[chart.type];
        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap
              ${i === activeIndex
                ? 'bg-piu-accent text-white'
                : 'bg-piu-card text-gray-400 hover:text-white border border-piu-border'
              }`}
          >
            {chart.difficulty} {chart.meter} ({gameType?.label || chart.type})
          </button>
        );
      })}

      <button
        onClick={() => onAdd()}
        className="px-2 py-1 rounded text-xs bg-piu-card text-piu-blue hover:text-blue-400 border border-piu-border"
      >
        + New
      </button>

      {charts.length > 1 && (
        <button
          onClick={() => {
            if (confirm('Delete this chart difficulty?')) {
              onDelete(activeIndex);
            }
          }}
          className="px-2 py-1 rounded text-xs bg-piu-card text-red-500 hover:text-red-400 border border-piu-border ml-1"
        >
          Delete
        </button>
      )}
    </div>
  );
}
