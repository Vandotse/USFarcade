import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

export function ReactionSpeed({ disabled, onScore }) {
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const timerRef = useRef(null);
  const readyAtRef = useRef(0);

  useEffect(() => {
    return () => window.clearTimeout(timerRef.current);
  }, []);

  function startRound() {
    window.clearTimeout(timerRef.current);
    setResult(null);
    setPhase("waiting");
    const delay = 900 + Math.floor(Math.random() * 1600);
    timerRef.current = window.setTimeout(() => {
      readyAtRef.current = performance.now();
      setPhase("ready");
    }, delay);
  }

  function handlePadClick() {
    if (disabled) return;
    if (phase === "waiting") {
      window.clearTimeout(timerRef.current);
      setResult("Too soon");
      setPhase("idle");
      return;
    }
    if (phase === "ready") {
      const durationMs = Math.round(performance.now() - readyAtRef.current);
      setResult(`${durationMs} ms`);
      setPhase("complete");
      onScore({
        scoreValue: durationMs,
        durationMs,
        moves: null,
        metadata: { mode: "reaction" }
      });
    }
  }

  const padLabel = phase === "waiting" ? "Hold..." : phase === "ready" ? "Launch!" : result || "Ready";

  return (
    <div className="reaction-game">
      <button className={`reaction-pad ${phase}`} onClick={handlePadClick} disabled={disabled} type="button">
        <span>{padLabel}</span>
      </button>
      <div className="game-actions">
        <button className="secondary-action" onClick={startRound} disabled={disabled} type="button">
          <Play size={16} />
          Start
        </button>
        <button className="icon-button" onClick={startRound} disabled={disabled} title="Reset round" type="button">
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}

