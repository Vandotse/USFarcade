const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

export function listGames() {
  return request("/games");
}

export function createPlayer(displayName, avatarColor) {
  return request("/players", {
    method: "POST",
    body: JSON.stringify({ displayName, avatarColor })
  });
}

export function submitScore(score) {
  return request("/scores", {
    method: "POST",
    body: JSON.stringify(score)
  });
}

export function getLeaderboard(gameSlug, limit = 10) {
  return request(`/leaderboards/${gameSlug}?limit=${limit}`);
}

