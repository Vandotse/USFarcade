import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

const symbols = ["A", "B", "C", "D", "E", "F", "G", "H"];

function shuffle(items) {
  return [...items]
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }, index) => ({ id: `${value}-${index}`, value, matched: false }));
}

export function MemoryMatch({ disabled, onScore }) {
  const [cards, setCards] = useState(() => shuffle([...symbols, ...symbols]));
  const [open, setOpen] = useState([]);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [completed, setCompleted] = useState(false);

  const matchedCount = useMemo(() => cards.filter((card) => card.matched).length, [cards]);

  useEffect(() => {
    if (open.length !== 2) return;
    const [first, second] = open;
    const isMatch = cards[first].value === cards[second].value;
    const timeout = window.setTimeout(() => {
      if (isMatch) {
        setCards((current) =>
          current.map((card, index) => (index === first || index === second ? { ...card, matched: true } : card))
        );
      }
      setOpen([]);
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [open, cards]);

  useEffect(() => {
    if (completed || matchedCount !== cards.length) return;
    const durationMs = Date.now() - startedAt;
    const scoreValue = Math.max(100, 10000 - moves * 90 - Math.round(durationMs / 1000) * 45);
    setCompleted(true);
    onScore({
      scoreValue,
      durationMs,
      moves,
      metadata: { mode: "memory", pairs: symbols.length }
    });
  }, [cards.length, completed, matchedCount, moves, onScore, startedAt]);

  function resetGame() {
    setCards(shuffle([...symbols, ...symbols]));
    setOpen([]);
    setMoves(0);
    setStartedAt(null);
    setCompleted(false);
  }

  function chooseCard(index) {
    if (disabled || completed || open.length === 2 || open.includes(index) || cards[index].matched) return;
    if (!startedAt) setStartedAt(Date.now());
    setOpen((current) => [...current, index]);
    if (open.length === 1) setMoves((current) => current + 1);
  }

  return (
    <div className="memory-game">
      <div className="memory-stats">
        <span>{moves} moves</span>
        <span>{matchedCount / 2} pairs</span>
        <button className="icon-button" onClick={resetGame} disabled={disabled} title="Shuffle board" type="button">
          <RotateCcw size={16} />
        </button>
      </div>
      <div className="memory-grid">
        {cards.map((card, index) => {
          const isOpen = open.includes(index) || card.matched;
          return (
            <button
              key={card.id}
              className={isOpen ? "memory-card open" : "memory-card"}
              onClick={() => chooseCard(index)}
              disabled={disabled}
              type="button"
            >
              <span>{isOpen ? card.value : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

